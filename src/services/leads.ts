import { supabase } from '../lib/supabase'
import { buscarPopupCadastroAtivo } from './popups'
import { garantirCupomBoasVindas } from './cupons'
import type { CadastrarLeadInput } from '../schemas/lead'

export type CadastroLeadResultado = {
  // true = a pessoa já estava no sistema (lead ou cliente) e não foi duplicada
  existente: boolean
  primeiro_nome: string
  cupom_codigo: string | null
}

// Mesmo formato que o WhatsApp grava (services/whatsapp.ts): só dígitos,
// número nacional sem o 55 — ex.: "34999998888".
export function normalizarTelefone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2)
  return digits
}

export function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

let origemSiteId: string | null = null
async function getOrigemSiteId(): Promise<string | null> {
  if (origemSiteId) return origemSiteId
  const { data } = await supabase.from('origens_cliente').select('id').ilike('nome', 'site').maybeSingle()
  if (data) {
    origemSiteId = data.id as string
    return origemSiteId
  }
  const { data: created, error } = await supabase
    .from('origens_cliente')
    .insert({ nome: 'Site', ativo: true })
    .select('id')
    .single()
  if (error) {
    console.error('[Leads] Erro ao criar a origem Site:', error.message)
    return null
  }
  origemSiteId = created.id as string
  return origemSiteId
}

export type ClienteExistente = { id: string; nome: string; email: string | null; telefone: string | null; whatsapp: string | null }

// Procura pelo e-mail e, se não achar, pelos 8 últimos dígitos do telefone
// (pega o mesmo número com ou sem 9, DDD, +55 ou máscara — igual ao WhatsApp).
export async function buscarExistente(email: string, telefone: string): Promise<ClienteExistente | null> {
  const cols = 'id, nome, email, telefone, whatsapp'

  const { data: porEmail, error: emailError } = await supabase
    .from('clientes')
    .select(cols)
    .ilike('email', escapeLike(email))
    .limit(1)
  if (emailError) throw new Error(emailError.message)
  if (porEmail?.length) return porEmail[0] as ClienteExistente

  const last8 = telefone.slice(-8)
  const pattern = `%${last8.slice(0, 4)}%${last8.slice(4)}%`
  const { data: porTelefone, error: telError } = await supabase
    .from('clientes')
    .select(cols)
    .or(`whatsapp.ilike.${pattern},telefone.ilike.${pattern}`)
    .limit(1)
  if (telError) throw new Error(telError.message)
  return (porTelefone?.[0] as ClienteExistente | undefined) ?? null
}

export async function cadastrarLeadSite(input: CadastrarLeadInput): Promise<CadastroLeadResultado> {
  const telefone = normalizarTelefone(input.telefone)
  const nome = input.nome.replace(/\s+/g, ' ').trim()
  const popup = await buscarPopupCadastroAtivo()
  const cupom = popup?.cupom_codigo ?? null
  const sufixoCupom = cupom ? ` — cupom ${cupom}` : ''

  const existente = await buscarExistente(input.email, telefone)

  if (existente) {
    // Não sobrescreve dados que a loja já tem: só completa o que estava vazio.
    const updates: Record<string, string> = {}
    if (!existente.email) updates.email = input.email
    if (!existente.telefone) updates.telefone = telefone
    if (!existente.whatsapp) updates.whatsapp = telefone
    if (Object.keys(updates).length) {
      const { error } = await supabase.from('clientes').update(updates).eq('id', existente.id)
      if (error) throw new Error(error.message)
    }
    await supabase.from('cliente_timeline').insert({
      cliente_id: existente.id,
      tipo: 'sistema',
      descricao: `Cadastrou-se novamente pelo site (${nome}, ${input.email})${sufixoCupom}`,
    })
    await garantirCupomBoasVindas(existente.id)
    return { existente: true, primeiro_nome: (existente.nome || nome).split(' ')[0]!, cupom_codigo: cupom }
  }

  const clienteId = await criarClienteSite({
    nome,
    email: input.email,
    telefone,
    observacoes: `Cadastro pelo pop-up do site${sufixoCupom}`,
    eventoTimeline: `Lead cadastrado pelo site${sufixoCupom}`,
  })
  await garantirCupomBoasVindas(clienteId)

  return { existente: false, primeiro_nome: nome.split(' ')[0]!, cupom_codigo: cupom }
}

// Cria o cliente/lead com origem "Site" e registra o evento na linha do tempo.
export async function criarClienteSite(dados: {
  nome: string
  email: string
  telefone: string
  observacoes: string
  eventoTimeline: string
}): Promise<string> {
  const { data: criado, error } = await supabase
    .from('clientes')
    .insert({
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone,
      whatsapp: dados.telefone,
      status_funil: 'novo_lead',
      status_qualificacao: 'novo_lead',
      lead_score: 1,
      ativo: true,
      origem_id: await getOrigemSiteId(),
      observacoes: dados.observacoes,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('cliente_timeline').insert({
    cliente_id: criado.id,
    tipo: 'sistema',
    descricao: dados.eventoTimeline,
  })
  return criado.id as string
}
