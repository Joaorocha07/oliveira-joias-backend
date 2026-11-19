import { supabase } from '../lib/supabase'
import { calcularDesconto, type Cupom } from './cupons'
import { ErroConta } from './conta'
import type { CriarPedidoInput } from '../schemas/conta'

const round2 = (n: number) => Math.round(n * 100) / 100

export async function criarPedidoSite(clienteId: string, input: CriarPedidoInput) {
  // Preço sempre vem do catálogo (nunca do navegador).
  const slugs = [...new Set(input.itens.map((i) => i.slug))]
  const { data: produtos, error: prodError } = await supabase
    .from('catalogo_produtos')
    .select('slug, nome, valor')
    .in('slug', slugs)
    .eq('ativo', true)
  if (prodError) throw new Error(prodError.message)
  const porSlug = new Map((produtos ?? []).map((p) => [p.slug as string, p]))

  const indisponivel = input.itens.find((i) => !porSlug.has(i.slug))
  if (indisponivel) throw new ErroConta('Um dos produtos do carrinho não está mais disponível. Remova-o e tente de novo.', 400)

  const itens = input.itens.map((i) => {
    const p = porSlug.get(i.slug)!
    const valorUnitario = Number(p.valor)
    return {
      slug: i.slug,
      nome: p.nome as string,
      quantidade: i.quantidade,
      valor_unitario: valorUnitario,
      subtotal: round2(valorUnitario * i.quantidade),
      observacao: i.observacao || null,
    }
  })
  const subtotal = round2(itens.reduce((s, i) => s + i.subtotal, 0))

  let cupom: Cupom | null = null
  if (input.cupom_id) {
    const { data } = await supabase
      .from('cupons')
      .select('id, cliente_id, codigo, descricao, tipo, valor, status, validade, origem')
      .eq('id', input.cupom_id)
      .eq('cliente_id', clienteId)
      .maybeSingle()
    const hoje = new Date().toISOString().slice(0, 10)
    if (!data || data.status !== 'ativo' || (data.validade && data.validade < hoje)) {
      throw new ErroConta('Este cupom não está mais disponível.', 400)
    }
    cupom = { ...(data as Cupom), valor: Number(data.valor) }
  }

  const desconto = cupom ? calcularDesconto(cupom, subtotal) : 0
  const total = round2(subtotal - desconto)

  const { data: pedido, error } = await supabase
    .from('site_pedidos')
    .insert({
      cliente_id: clienteId,
      itens,
      subtotal,
      cupom_id: cupom?.id ?? null,
      cupom_codigo: cupom?.codigo ?? null,
      desconto,
      total,
      observacoes: input.observacoes || null,
    })
    .select('numero')
    .single()
  if (error) throw new Error(error.message)

  const valor = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  await supabase.from('cliente_timeline').insert({
    cliente_id: clienteId,
    tipo: 'sistema',
    descricao: `Fez o pedido #${pedido.numero} pelo site (${valor}${cupom ? `, cupom ${cupom.codigo}` : ''})`,
  })
  await supabase.from('clientes').update({ ultimo_contato_em: new Date().toISOString() }).eq('id', clienteId)

  // O cupom continua "ativo" até o vendedor lançar a venda no sistema e marcá-lo como usado.
  return { numero: pedido.numero as number, itens, subtotal, desconto, total, cupom_codigo: cupom?.codigo ?? null }
}
