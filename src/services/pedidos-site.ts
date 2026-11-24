import { supabase } from '../lib/supabase'
import { calcularDesconto, type Cupom } from './cupons'
import { ErroConta } from './conta'
import type { CriarPedidoInput } from '../schemas/conta'

const round2 = (n: number) => Math.round(n * 100) / 100

type ProdutoPedido = { slug: string; nome: string; valor: number; aros: { aro: number; estoque: number }[] | null; aros_par: boolean | null }

const temAros = (p: ProdutoPedido) => Array.isArray(p.aros) && p.aros.length > 0

// Produto com aros configurados exige o(s) aro(s) escolhido(s) e confere o
// estoque somando todos os itens do carrinho (ex.: 2 pares no aro 16 = 4 unidades).
function validarAros(itens: CriarPedidoInput['itens'], porSlug: Map<string, ProdutoPedido>) {
  const necessario = new Map<string, number>() // "slug|aro" -> unidades
  for (const i of itens) {
    const p = porSlug.get(i.slug)!
    if (!temAros(p)) continue
    const esperado = p.aros_par === false ? 1 : 2
    const escolhidos = i.aros ?? []
    if (escolhidos.length !== esperado) {
      throw new ErroConta(`Escolha ${esperado === 2 ? 'os aros' : 'o aro'} de "${p.nome}" antes de finalizar.`, 400)
    }
    for (const aro of escolhidos) {
      const chave = `${i.slug}|${aro}`
      necessario.set(chave, (necessario.get(chave) ?? 0) + i.quantidade)
    }
  }
  for (const [chave, qtd] of necessario) {
    const [slug, aroTxt] = chave.split('|') as [string, string]
    const p = porSlug.get(slug)!
    const aro = Number(aroTxt)
    const estoque = p.aros!.find((a) => a.aro === aro)?.estoque ?? 0
    if (estoque < qtd) {
      throw new ErroConta(
        estoque > 0
          ? `Só temos ${estoque} unidade(s) do aro ${aro} de "${p.nome}". Ajuste o carrinho.`
          : `O aro ${aro} de "${p.nome}" acabou. Escolha outro aro.`,
        400,
      )
    }
  }
}

export async function criarPedidoSite(clienteId: string, input: CriarPedidoInput) {
  // Preço sempre vem do catálogo (nunca do navegador).
  const slugs = [...new Set(input.itens.map((i) => i.slug))]
  const { data: produtos, error: prodError } = await supabase
    .from('catalogo_produtos')
    .select('slug, nome, valor, aros, aros_par')
    .in('slug', slugs)
    .eq('ativo', true)
  if (prodError) throw new Error(prodError.message)
  const porSlug = new Map(((produtos ?? []) as ProdutoPedido[]).map((p) => [p.slug, p]))

  const indisponivel = input.itens.find((i) => !porSlug.has(i.slug))
  if (indisponivel) throw new ErroConta('Um dos produtos do carrinho não está mais disponível. Remova-o e tente de novo.', 400)

  validarAros(input.itens, porSlug)

  const itens = input.itens.map((i) => {
    const p = porSlug.get(i.slug)!
    const valorUnitario = Number(p.valor)
    const aros = temAros(p) ? [...(i.aros ?? [])] : []
    // O aro também vai no texto da observação: assim aparece igual no sistema,
    // no perfil do cliente e na mensagem do WhatsApp.
    const textoAros = aros.length === 2 ? `Aros ${aros[0]} e ${aros[1]}` : aros.length === 1 ? `Aro ${aros[0]}` : ''
    const observacao = [textoAros, i.observacao || ''].filter(Boolean).join(' · ')
    return {
      slug: i.slug,
      nome: p.nome as string,
      quantidade: i.quantidade,
      valor_unitario: valorUnitario,
      subtotal: round2(valorUnitario * i.quantidade),
      aros: aros.length > 0 ? aros : null,
      observacao: observacao || null,
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
