import {
  Browsers,
  Contact,
  DisconnectReason,
  WAMessage,
  WAMessageKey,
  WASocket,
  fetchLatestBaileysVersion,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
  normalizeMessageContent,
} from 'baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { clearStoredSession, listSlotsWithSession, useDatabaseAuthState } from '../lib/whatsapp-auth-state'

// Conexão de até 2 números com o WhatsApp Web (Baileys). O admin lê o QR Code
// na tela /whatsapp do ERP e o backend passa a ser um "aparelho conectado".
// Cada mensagem recebida de um contato novo vira um lead em `clientes`.
// As conexões vivem na memória deste processo: rode apenas UMA instância do
// backend, senão as duas disputam a mesma sessão e uma derruba a outra.

export const SLOT_COUNT = 2

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected'

export interface SlotStatus {
  status: ConnectionStatus
  qrBase64: string | null
  phone: string | null
  error: string | null
}

interface Connection extends SlotStatus {
  sock: WASocket | null
  retries: number
  closing: boolean
  adminId: string | null
  timer?: NodeJS.Timeout
}

const logger = pino({ level: 'error' })
const connections = new Map<number, Connection>()
const IGNORED_TYPES = new Set(['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'pollUpdateMessage', 'keepInChatMessage'])

let versionPromise: Promise<[number, number, number] | undefined> | null = null
function latestVersion() {
  versionPromise ??= fetchLatestBaileysVersion().then((r) => r.version).catch(() => undefined)
  return versionPromise
}

function publicState(conn: Connection | undefined): SlotStatus {
  if (!conn) return { status: 'disconnected', qrBase64: null, phone: null, error: null }
  return { status: conn.status, qrBase64: conn.qrBase64, phone: conn.phone, error: conn.error }
}

function statusCode(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
}

export function getAllStatus(): { slots: SlotStatus[] } {
  return { slots: Array.from({ length: SLOT_COUNT }, (_, i) => publicState(connections.get(i))) }
}

export async function connect(slot: number, adminId?: string): Promise<void> {
  const existing = connections.get(slot)
  if (existing && existing.status !== 'disconnected') {
    if (adminId) existing.adminId = adminId
    return
  }

  const conn: Connection = {
    status: 'connecting', qrBase64: null, phone: null, error: null,
    sock: null, retries: 0, closing: false, adminId: adminId ?? existing?.adminId ?? null,
  }
  connections.set(slot, conn)
  await openSocket(slot, conn)
}

// Remove o aparelho de "Dispositivos conectados" no celular e apaga a sessão.
export async function disconnect(slot: number): Promise<void> {
  const conn = connections.get(slot)
  if (conn) {
    conn.closing = true
    clearTimeout(conn.timer)
    await conn.sock?.logout().catch(() => {})
    conn.sock?.end(undefined)
    connections.delete(slot)
  }
  await clearStoredSession(slot)
}

// Reabre as sessões salvas quando o servidor sobe, sem precisar ler o QR de novo.
export async function restoreConnections(): Promise<void> {
  const slots = await listSlotsWithSession()
  await Promise.all(slots.map((slot) => connect(slot).catch((err) => {
    logger.error({ err, slot }, 'Falha ao restaurar a sessão do WhatsApp')
  })))
}

async function openSocket(slot: number, conn: Connection): Promise<void> {
  const { state, saveCreds } = await useDatabaseAuthState(slot)

  const sock = makeWASocket({
    version: await latestVersion(),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.ubuntu('Oliveira Joias'),
    // Sem isso o celular para de receber notificações enquanto o servidor está conectado.
    markOnlineOnConnect: false,
    // Só a sincronização inicial curta — é por ela que chegam os contatos da agenda.
    syncFullHistory: false,
  })
  if (conn.closing) {
    sock.end(undefined)
    return
  }
  conn.sock = sock
  conn.status = 'connecting'

  sock.ev.on('creds.update', () => {
    saveCreds().catch((err) => logger.error({ err, slot }, 'Falha ao salvar a sessão do WhatsApp'))
  })

  sock.ev.on('connection.update', (update) => {
    void (async () => {
      if (conn.sock !== sock) return

      if (update.qr) {
        conn.status = 'waiting_qr'
        conn.error = null
        conn.qrBase64 = await QRCode.toDataURL(update.qr, { margin: 2, width: 280 })
      }

      if (update.connection === 'open') {
        conn.status = 'connected'
        conn.qrBase64 = null
        conn.error = null
        conn.retries = 0
        const user = jidDecode(sock.user?.id)?.user
        conn.phone = user ? `+${user}` : null
      }

      if (update.connection === 'close') {
        conn.sock = null
        conn.qrBase64 = null
        if (conn.closing) return
        const code = statusCode(update.lastDisconnect?.error)

        if (code === DisconnectReason.loggedOut) {
          // Desconectado pelo celular (Dispositivos conectados > Desconectar).
          conn.status = 'disconnected'
          conn.phone = null
          conn.error = 'O WhatsApp foi desconectado pelo celular. Leia o QR Code novamente.'
          await clearStoredSession(slot)
          return
        }
        if (code === DisconnectReason.connectionReplaced) {
          conn.status = 'disconnected'
          conn.error = 'Esta sessão foi aberta em outro servidor. Mantenha só uma instância do backend rodando e conecte de novo.'
          return
        }
        if (!state.creds.registered && code !== DisconnectReason.restartRequired) {
          // Ninguém leu o QR Code a tempo.
          conn.status = 'disconnected'
          conn.error = 'O QR Code expirou. Clique em Conectar para gerar outro.'
          await clearStoredSession(slot)
          return
        }

        // Queda de rede ou reinício pedido pelo WhatsApp (logo após ler o QR): reconecta com backoff.
        conn.status = 'connecting'
        const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(30_000, 2_000 * 2 ** conn.retries++)
        conn.timer = setTimeout(() => {
          openSocket(slot, conn).catch((err) => {
            logger.error({ err, slot }, 'Falha ao reconectar o WhatsApp')
            conn.status = 'disconnected'
            conn.error = 'Não foi possível reconectar. Clique em Conectar.'
          })
        }, delay)
      }
    })().catch((err) => logger.error({ err, slot }, 'Erro na conexão do WhatsApp'))
  })

  // Contatos da agenda do celular: chegam na sincronização inicial ao conectar
  // (messaging-history.set) e quando a agenda muda (contacts.upsert).
  sock.ev.on('contacts.upsert', (contacts) => {
    importContacts(conn, sock, contacts, slot).catch((err) => {
      console.error(`[WhatsApp slot-${slot}] Erro ao importar contatos:`, err)
    })
  })
  sock.ev.on('messaging-history.set', ({ contacts }) => {
    importContacts(conn, sock, contacts, slot).catch((err) => {
      console.error(`[WhatsApp slot-${slot}] Erro ao importar contatos:`, err)
    })
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'append' = histórico sincronizado ou mensagens enviadas por este servidor.
    if (type !== 'notify') return
    for (const message of messages) {
      handleIncoming(conn, sock, message).catch((err) => {
        console.error(`[WhatsApp slot-${slot}] Erro ao salvar contato:`, err)
      })
    }
  })
}

// Número do contato (só dígitos), ou null se não der para descobrir. O WhatsApp
// identifica cada vez mais contas por LID (id anônimo, "@lid"), que NÃO é o
// telefone — o número real vem em remoteJidAlt ou no mapeamento LID -> número.
async function resolvePhone(sock: WASocket, key: WAMessageKey): Promise<string | null> {
  const jid = key.remoteJid!
  if (isLidUser(jid)) {
    const pn = key.remoteJidAlt ?? await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null)
    return pn ? jidDecode(pn)?.user ?? null : null
  }
  return jidDecode(jid)?.user ?? null
}

// Mesmo formato dos cadastros manuais (DDD + número, sem +55). Números
// brasileiros antigos chegam do WhatsApp sem o nono dígito do celular.
function toStoredPhone(digits: string): string {
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    let national = digits.slice(2)
    if (national.length === 10 && /[6-9]/.test(national[2]!)) national = `${national.slice(0, 2)}9${national.slice(2)}`
    return national
  }
  return `+${digits}`
}

async function handleIncoming(conn: Connection, sock: WASocket, message: WAMessage) {
  const jid = message.key.remoteJid
  if (!jid || !message.message || message.key.fromMe) return
  if (isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) return

  const contentType = getContentType(normalizeMessageContent(message.message))
  if (!contentType || IGNORED_TYPES.has(contentType)) return

  const digits = await resolvePhone(sock, message.key)
  if (!digits) {
    console.warn(`[WhatsApp] Não foi possível descobrir o telefone de ${jid}; contato não salvo.`)
    return
  }
  await saveLead(conn, toStoredPhone(digits), message.pushName ?? null, true)
}

// Só contatos salvos com nome na agenda (`name`): quem só tem `notify` (nome do
// próprio perfil) apareceu de grupo/conversa e não é necessariamente cliente.
async function importContacts(conn: Connection, sock: WASocket, contacts: Contact[], slot: number) {
  const own = jidDecode(sock.user?.id)?.user
  let saved = 0
  for (const c of contacts) {
    if (!c.name) continue
    const pnJid = c.phoneNumber ?? (c.id.endsWith('@s.whatsapp.net') ? c.id : null)
    const digits = pnJid ? jidDecode(pnJid)?.user : null
    if (!digits || digits === own) continue
    if (await saveLead(conn, toStoredPhone(digits), c.name)) saved++
  }
  if (saved) console.log(`[WhatsApp slot-${slot}] ${saved} contatos da agenda importados como leads.`)
}

let origemWhatsAppId: string | null = null
async function getOrigemWhatsAppId(): Promise<string | null> {
  if (origemWhatsAppId) return origemWhatsAppId
  const { data } = await supabase.from('origens_cliente').select('id').ilike('nome', 'whatsapp').maybeSingle()
  if (data) {
    origemWhatsAppId = data.id as string
    return origemWhatsAppId
  }
  const { data: created, error } = await supabase
    .from('origens_cliente')
    .insert({ nome: 'WhatsApp', ativo: true })
    .select('id')
    .single()
  if (error) {
    console.error('[WhatsApp] Erro ao criar a origem WhatsApp:', error.message)
    return null
  }
  origemWhatsAppId = created.id as string
  return origemWhatsAppId
}

// Retorna true quando criou um lead novo (false = já existia).
async function saveLead(conn: Connection, phone: string, pushName: string | null, fromMessage = false): Promise<boolean> {
  // Compara pelos 8 últimos dígitos: pega o mesmo cliente com ou sem 9, DDD,
  // +55 ou máscara "(34) 99999-9999" no cadastro manual.
  const last8 = phone.replace(/\D/g, '').slice(-8)
  const { data: existing, error: findError } = await supabase
    .from('clientes')
    .select('id')
    .or(`whatsapp.ilike.%${last8.slice(0, 4)}%${last8.slice(4)}%,telefone.ilike.%${last8.slice(0, 4)}%${last8.slice(4)}%`)
    .limit(1)
  if (findError) throw new Error(findError.message)
  if (existing && existing.length > 0) return false

  const { error } = await supabase.from('clientes').insert({
    nome: pushName?.trim() || `WhatsApp ${phone}`,
    whatsapp: phone,
    telefone: phone,
    status_funil: 'novo_lead',
    status_qualificacao: 'novo_lead',
    lead_score: 1,
    ativo: true,
    origem_id: await getOrigemWhatsAppId(),
    ...(fromMessage ? { ultimo_contato_em: new Date().toISOString() } : {}),
    ...(conn.adminId ? { created_by: conn.adminId } : {}),
  })
  if (error) throw new Error(error.message)
  return true
}
