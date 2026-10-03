import path from 'path'
import { supabase } from './supabase'

// Singleton em memória — persiste enquanto o processo do Express estiver ativo.

const SESSION_BASE = path.join(process.cwd(), '.whatsapp-session')
const SLOT_COUNT = 2

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected'

interface SlotState {
  status: ConnectionStatus
  qrBase64: string | null
  phone: string | null
  adminUserId: string | null
  originId: string | null
}

const slots: SlotState[] = Array.from({ length: SLOT_COUNT }, () => ({
  status: 'disconnected',
  qrBase64: null,
  phone: null,
  adminUserId: null,
  originId: null,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sockets: any[] = Array(SLOT_COUNT).fill(null)

export function getAllSlotsStatus() {
  return slots.map((s) => ({ status: s.status, qrBase64: s.qrBase64, phone: s.phone }))
}

export function connectSlot(index: number, adminUserId?: string): void {
  const s = slots[index]
  if (!s || s.status === 'connected' || s.status === 'connecting') return

  if (adminUserId) s.adminUserId = adminUserId
  s.status = 'connecting'
  s.qrBase64 = null

  doConnect(index).catch((err) => {
    console.error(`[WhatsApp slot-${index}] Erro ao conectar:`, err)
    const st = slots[index]
    if (st) st.status = 'disconnected'
  })
}

interface NoopLogger {
  level: string
  trace: () => void
  debug: () => void
  info: () => void
  warn: () => void
  error: () => void
  child: () => NoopLogger
}

const noopLogger: NoopLogger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {},
  child: () => noopLogger,
}

async function doConnect(index: number): Promise<void> {
  const s = slots[index]
  if (!s) return

  console.log(`[WhatsApp slot-${index}] Iniciando doConnect...`)

  // Importação dinâmica: baileys é ESM, o backend é CommonJS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baileys: any = await import('@whiskeysockets/baileys')
  const makeWASocket = baileys.default
  const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys

  const { toDataURL } = await import('qrcode')

  const sessionDir = path.join(SESSION_BASE, `slot-${index}`)
  console.log(`[WhatsApp slot-${index}] Session dir: ${sessionDir}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir) as any

  let version: [number, number, number]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = await fetchLatestBaileysVersion()
    version = v.version
    console.log(`[WhatsApp slot-${index}] Versão WA: ${version.join('.')}`)
  } catch (err) {
    version = [2, 3000, 1023372854]
    console.warn(`[WhatsApp slot-${index}] fetchLatestBaileysVersion falhou, usando fallback ${version.join('.')}:`, err)
  }

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: noopLogger,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    // Manter conexão ativa — sem isso a conexão pode cair por inatividade no servidor
    keepAliveIntervalMs: 15_000,
    // Identificação como Chrome Desktop para evitar rejeição pelo WhatsApp
    browser: ['Chrome', 'Desktop', '124.0.0'],
    // Reduzir janela de mensagens recebidas no reconect (evita flood de histórico)
    getMessage: async () => undefined,
  })

  sockets[index] = sock

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update as {
      connection?: string
      lastDisconnect?: { error?: { output?: { statusCode?: number } } }
      qr?: string
    }

    if (qr) {
      console.log(`[WhatsApp slot-${index}] QR gerado, aguardando scan...`)
      s.status = 'waiting_qr'
      s.qrBase64 = await (toDataURL as (data: string, opts: object) => Promise<string>)(
        qr, { width: 280, margin: 2 }
      ).catch(() => null)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMsg = (lastDisconnect?.error as any)?.message ?? 'sem mensagem'
      const DR = DisconnectReason as Record<string, number>

      const reasonName = Object.entries(DR).find(([, v]) => v === code)?.[0] ?? 'desconhecido'
      console.warn(`[WhatsApp slot-${index}] Conexão fechada. Código: ${code} (${reasonName}), Erro: ${errorMsg}`)

      s.qrBase64 = null
      s.phone = null
      sockets[index] = null

      // Logout explícito ou conflito: encerra a sessão e apaga os arquivos para evitar conflito futuro
      const permanentCodes = new Set([DR.loggedOut, DR.connectionReplaced])
      if (permanentCodes.has(code as number)) {
        s.status = 'disconnected'
        console.log(`[WhatsApp slot-${index}] Sessão encerrada (${reasonName}), limpando arquivos de sessão...`)
        import('fs/promises').then(({ rm }) =>
          rm(path.join(SESSION_BASE, `slot-${index}`), { recursive: true, force: true }).catch(() => {})
        ).catch(() => {})
      } else if (code === (DR as Record<string, number>).restartRequired) {
        // 515: baileys pede reinício após scan do QR — manter 'connecting' para evitar duplo-connect
        s.status = 'connecting'
        console.log(`[WhatsApp slot-${index}] Reinício necessário (515), reconectando imediatamente...`)
        setTimeout(() => {
          doConnect(index).catch((err) => {
            console.error(`[WhatsApp slot-${index}] Erro ao reconectar:`, err)
            const st = slots[index]
            if (st) st.status = 'disconnected'
          })
        }, 1000)
      } else {
        // Outros erros temporários: reconectar em 5s
        s.status = 'connecting'
        console.log(`[WhatsApp slot-${index}] Tentando reconectar em 5s...`)
        setTimeout(() => {
          doConnect(index).catch((err) => {
            console.error(`[WhatsApp slot-${index}] Erro ao reconectar:`, err)
            const st = slots[index]
            if (st) st.status = 'disconnected'
          })
        }, 5000)
      }
    } else if (connection === 'open') {
      console.log(`[WhatsApp slot-${index}] Conectado com sucesso!`)
      s.status = 'connected'
      s.qrBase64 = null
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jid: string = (sock.user as any)?.id ?? ''
        const cleaned = (jid.split(':')[0] ?? '').replace(/\D/g, '')
        if (cleaned) s.phone = `+${cleaned}`
        console.log(`[WhatsApp slot-${index}] Número vinculado: ${s.phone}`)
      } catch {}
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
    console.log(`[WhatsApp slot-${index}] messages.upsert — tipo: ${type}, qtd: ${messages.length}`)
    for (const msg of messages) {
      if (msg.key?.fromMe) continue
      const jid: string = msg.key?.remoteJid ?? ''
      if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue

      const phone = jid.replace('@s.whatsapp.net', '')
      const name: string | null = msg.pushName ?? null
      console.log(`[WhatsApp slot-${index}] Mensagem recebida de ${phone} (${name ?? 'sem nome'})`)

      try {
        await saveContact(s, phone, name, index)
      } catch (err) {
        console.error(`[WhatsApp slot-${index}] Erro ao salvar contato ${phone}:`, err)
      }
    }
  })
}

async function saveContact(s: SlotState, rawPhone: string, pushName: string | null, slotIndex?: number): Promise<void> {
  const tag = slotIndex !== undefined ? `[WhatsApp slot-${slotIndex}]` : '[WhatsApp]'
  const phone = rawPhone.replace(/\D/g, '')
  const whatsappNumber = `+${phone}`

  // Busca ou cria a origem 'WhatsApp' automaticamente
  if (!s.originId) {
    const { data: found } = await supabase
      .from('origens_cliente')
      .select('id')
      .ilike('nome', 'whatsapp')
      .maybeSingle()

    if (found) {
      s.originId = (found as { id: string }).id
      console.log(`${tag} Origem WhatsApp encontrada: ${s.originId}`)
    } else {
      // Cria a origem se não existir
      const { data: created, error: createErr } = await supabase
        .from('origens_cliente')
        .insert({ nome: 'WhatsApp', ativo: true })
        .select('id')
        .single()
      if (createErr) {
        console.error(`${tag} Erro ao criar origem WhatsApp:`, createErr.message)
      } else {
        s.originId = (created as { id: string }).id
        console.log(`${tag} Origem WhatsApp criada: ${s.originId}`)
      }
    }
  }

  const { data: existing } = await supabase
    .from('clientes')
    .select('id')
    .or(`whatsapp.eq.${whatsappNumber},telefone.eq.${whatsappNumber}`)
    .maybeSingle()

  if (existing) {
    console.log(`${tag} Contato ${whatsappNumber} já existe, ignorando.`)
    return
  }

  const { error: insertErr } = await supabase.from('clientes').insert({
    nome: pushName?.trim() || `WhatsApp ${whatsappNumber}`,
    whatsapp: whatsappNumber,
    telefone: whatsappNumber,
    status_funil: 'novo_lead',
    status_qualificacao: 'novo_lead',
    lead_score: 1,
    ativo: true,
    origem_id: s.originId,
    ...(s.adminUserId ? { created_by: s.adminUserId } : {}),
  })

  if (insertErr) {
    console.error(`${tag} Erro ao inserir contato ${whatsappNumber}:`, insertErr.message)
  } else {
    console.log(`${tag} Contato salvo: ${whatsappNumber} (${pushName ?? 'sem nome'})`)
  }
}

export async function disconnectSlot(index: number): Promise<void> {
  try {
    const sock = sockets[index]
    if (sock) {
      await (sock.logout() as Promise<void>).catch(() => {})
      sockets[index] = null
    }
  } catch {}

  const s = slots[index]
  if (s) {
    s.status = 'disconnected'
    s.qrBase64 = null
    s.phone = null
  }

  try {
    const { rm } = await import('fs/promises')
    await rm(path.join(SESSION_BASE, `slot-${index}`), { recursive: true, force: true })
  } catch {}
}
