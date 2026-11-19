import { supabase } from '../lib/supabase'
import { buscarPopupCadastroAtivo } from './popups'

export type Cupom = {
  id: string
  cliente_id: string
  codigo: string
  descricao: string | null
  tipo: 'percentual' | 'valor'
  valor: number
  status: 'ativo' | 'usado' | 'cancelado'
  validade: string | null
  origem: 'boas_vindas' | 'manual'
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function clienteJaComprou(clienteId: string): Promise<boolean> {
  const { count } = await supabase
    .from('vendas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .not('status', 'in', '(cancelado,orcamento)')
  return (count ?? 0) > 0
}

// Dá o cupom de boas-vindas (configurado no pop-up de cadastro) para quem ainda
// não comprou. No máximo um por cliente (índice único no banco).
export async function garantirCupomBoasVindas(clienteId: string): Promise<void> {
  const popup = await buscarPopupCadastroAtivo()
  if (!popup?.cupom_codigo) return
  if (await clienteJaComprou(clienteId)) return
  const percentual = Number(popup.cupom_percentual ?? 10)
  const { error } = await supabase.from('cupons').insert({
    cliente_id: clienteId,
    codigo: popup.cupom_codigo,
    descricao: `${percentual}% OFF na primeira compra`,
    tipo: 'percentual',
    valor: percentual,
    origem: 'boas_vindas',
  })
  // 23505 = já tem cupom de boas-vindas
  if (error && error.code !== '23505') console.error('[Cupons] Erro ao criar cupom de boas-vindas:', error.message)
}

export async function listarCuponsAtivos(clienteId: string): Promise<Cupom[]> {
  const { data, error } = await supabase
    .from('cupons')
    .select('id, cliente_id, codigo, descricao, tipo, valor, status, validade, origem')
    .eq('cliente_id', clienteId)
    .eq('status', 'ativo')
    .or(`validade.is.null,validade.gte.${hoje()}`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ ...c, valor: Number(c.valor) })) as Cupom[]
}

export function calcularDesconto(cupom: Pick<Cupom, 'tipo' | 'valor'>, subtotal: number): number {
  const bruto = cupom.tipo === 'percentual' ? (subtotal * cupom.valor) / 100 : cupom.valor
  return Math.round(Math.min(bruto, subtotal) * 100) / 100
}
