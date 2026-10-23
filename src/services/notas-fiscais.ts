import { supabase } from '../lib/supabase'
import { focusNfeRequest, focusNfeUrl } from '../lib/focusnfe'

type EmpresaFiscal = {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  inscricao_estadual: string
  regime_tributario: number
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  municipio: string
  uf: string
  cep: string
}

type ItemVenda = {
  quantidade: number
  preco_unitario: number
  nome_produto: string
  produto: {
    id: string
    ncm: string | null
    cfop_padrao: string | null
    cst_csosn: string | null
    unidade_medida: string | null
    origem_mercadoria: number | null
  } | null
}

type VendaParaEmissao = {
  id: string
  numero: number
  tipo: string
  desconto: number
  total: number
  cliente: {
    nome: string
    cpf: string | null
    endereco: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    estado: string | null
    cep: string | null
  } | null
  itens: ItemVenda[]
}

export type NotaFiscal = {
  id: string
  venda_id: string
  ref: string
  status: 'processando' | 'autorizado' | 'erro' | 'cancelado'
  status_sefaz: string | null
  mensagem_sefaz: string | null
  numero: string | null
  serie: string | null
  chave_acesso: string | null
  danfe_url: string | null
  xml_url: string | null
  erro: string | null
  created_at: string
  updated_at: string
}

async function buscarEmpresaFiscal(): Promise<{ data: EmpresaFiscal | null; error: string | null }> {
  const { data, error } = await supabase.from('empresa_fiscal').select('*').single()
  if (error) return { data: null, error: 'Empresa fiscal não configurada — rode a migration nfe.sql e cadastre os dados da loja.' }
  return { data, error: null }
}

async function buscarVenda(vendaId: string): Promise<{ data: VendaParaEmissao | null; error: string | null }> {
  const { data, error } = await supabase
    .from('vendas')
    .select(
      `id, numero, tipo, desconto, total,
       cliente:clientes(nome, cpf, endereco, numero, complemento, bairro, cidade, estado, cep),
       itens:venda_itens(quantidade, preco_unitario, nome_produto,
         produto:produtos(id, ncm, cfop_padrao, cst_csosn, unidade_medida, origem_mercadoria))`,
    )
    .eq('id', vendaId)
    .single()

  if (error) return { data: null, error: 'Venda não encontrada.' }
  return { data: data as unknown as VendaParaEmissao, error: null }
}

function validar(venda: VendaParaEmissao): string[] {
  const problemas: string[] = []

  if (venda.tipo !== 'normal') {
    problemas.push('Venda livre não suporta emissão automática de NF-e — cadastre os itens como produtos.')
    return problemas
  }
  if (!venda.itens.length) problemas.push('Venda sem itens.')
  if (!venda.cliente) {
    problemas.push('Venda sem cliente vinculado.')
  } else {
    if (!venda.cliente.cpf) problemas.push('Cliente sem CPF cadastrado.')
    if (!venda.cliente.endereco || !venda.cliente.numero || !venda.cliente.bairro || !venda.cliente.cidade || !venda.cliente.estado || !venda.cliente.cep) {
      problemas.push('Cliente com endereço incompleto.')
    }
  }
  venda.itens.forEach((item, i) => {
    const label = item.nome_produto || `item ${i + 1}`
    if (!item.produto) {
      problemas.push(`"${label}": item sem produto vinculado.`)
      return
    }
    if (!item.produto.ncm) problemas.push(`"${label}": NCM não cadastrado no produto.`)
    if (!item.produto.cfop_padrao) problemas.push(`"${label}": CFOP não cadastrado no produto.`)
    if (!item.produto.cst_csosn) problemas.push(`"${label}": CST/CSOSN não cadastrado no produto.`)
  })

  return problemas
}

// cfop_padrao é cadastrado no produto na forma "dentro do estado" (5xxx).
// Se o cliente for de outro estado, troca o primeiro dígito para 6 (fora do estado).
function resolverCfop(cfopPadrao: string, ufEmpresa: string, ufCliente: string): string {
  const mesmoEstado = ufEmpresa === ufCliente
  if (mesmoEstado) return cfopPadrao
  return cfopPadrao.startsWith('5') ? `6${cfopPadrao.slice(1)}` : cfopPadrao
}

function montarPayload(empresa: EmpresaFiscal, venda: VendaParaEmissao) {
  const cliente = venda.cliente!
  const mesmoEstado = empresa.uf === cliente.estado

  const itens = venda.itens.map((item, i) => {
    const produto = item.produto!
    const cfop = resolverCfop(produto.cfop_padrao!, empresa.uf, cliente.estado!)
    const valorBruto = item.quantidade * item.preco_unitario

    return {
      numero_item: i + 1,
      codigo_produto: produto.id,
      descricao: item.nome_produto,
      cfop,
      codigo_ncm: produto.ncm,
      quantidade_comercial: item.quantidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_comercial: item.preco_unitario,
      valor_unitario_tributavel: item.preco_unitario,
      unidade_comercial: produto.unidade_medida ?? 'UN',
      unidade_tributavel: produto.unidade_medida ?? 'UN',
      valor_bruto: valorBruto,
      inclui_no_total: 1,
      icms_origem: produto.origem_mercadoria ?? 0,
      icms_situacao_tributaria: produto.cst_csosn,
      // Simples Nacional/MEI recolhe PIS/COFINS pelo DAS unificado — sem destaque na nota.
      // Confirmar com o contador antes da primeira emissão em produção.
      pis_situacao_tributaria: '99',
      cofins_situacao_tributaria: '99',
    }
  })

  const valorProdutos = itens.reduce((soma, item) => soma + item.valor_bruto, 0)

  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: mesmoEstado ? 1 : 2,
    consumidor_final: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,

    cnpj_emitente: empresa.cnpj,
    nome_emitente: empresa.razao_social,
    nome_fantasia_emitente: empresa.nome_fantasia ?? empresa.razao_social,
    logradouro_emitente: empresa.logradouro,
    numero_emitente: empresa.numero,
    complemento_emitente: empresa.complemento ?? undefined,
    bairro_emitente: empresa.bairro,
    municipio_emitente: empresa.municipio,
    uf_emitente: empresa.uf,
    cep_emitente: empresa.cep,
    inscricao_estadual_emitente: empresa.inscricao_estadual,
    regime_tributario_emitente: empresa.regime_tributario,

    nome_destinatario: cliente.nome,
    cpf_destinatario: cliente.cpf,
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: cliente.endereco,
    numero_destinatario: cliente.numero,
    complemento_destinatario: cliente.complemento ?? undefined,
    bairro_destinatario: cliente.bairro,
    municipio_destinatario: cliente.cidade,
    uf_destinatario: cliente.estado,
    cep_destinatario: cliente.cep,

    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: venda.desconto,
    valor_outras_despesas: 0,
    valor_produtos: valorProdutos,
    valor_total: venda.total,

    items: itens,
  }
}

function refDaVenda(vendaId: string): string {
  return `nfe-${vendaId}`
}

export async function consultarNotaFiscal(vendaId: string): Promise<{ data: NotaFiscal | null; error: string | null }> {
  const { data: nota, error } = await supabase.from('notas_fiscais').select('*').eq('venda_id', vendaId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!nota) return { data: null, error: null }

  if (nota.status !== 'processando') return { data: nota, error: null }

  const { status, body } = await focusNfeRequest<Record<string, unknown>>('GET', `/nfe/${nota.ref}`)
  if (status >= 400) return { data: nota, error: null }

  const atualizada = await aplicarRespostaFocusNfe(nota.id, body)
  return { data: atualizada, error: null }
}

async function aplicarRespostaFocusNfe(notaId: string, body: Record<string, unknown>): Promise<NotaFiscal> {
  const statusFocus = String(body.status ?? 'processando')
  const status: NotaFiscal['status'] =
    statusFocus === 'autorizado' ? 'autorizado' : statusFocus === 'cancelado' ? 'cancelado' : statusFocus === 'erro_autorizacao' ? 'erro' : 'processando'

  const update = {
    status,
    status_sefaz: (body.status_sefaz as string) ?? null,
    mensagem_sefaz: (body.mensagem_sefaz as string) ?? null,
    numero: (body.numero as string) ?? null,
    serie: (body.serie as string) ?? null,
    chave_acesso: (body.chave_nfe as string) ?? null,
    danfe_url: body.caminho_danfe ? focusNfeUrl(body.caminho_danfe as string) : null,
    xml_url: body.caminho_xml_nota_fiscal ? focusNfeUrl(body.caminho_xml_nota_fiscal as string) : null,
    erro: status === 'erro' ? ((body.mensagem_sefaz as string) ?? 'Rejeitado pela SEFAZ.') : null,
    updated_at: new Date().toISOString(),
  }

  const { data } = await supabase.from('notas_fiscais').update(update).eq('id', notaId).select('*').single()
  return data as NotaFiscal
}

export async function emitirNotaFiscal(vendaId: string): Promise<{ data: NotaFiscal | null; error: string | null }> {
  const { data: existente } = await supabase.from('notas_fiscais').select('*').eq('venda_id', vendaId).maybeSingle()
  if (existente?.status === 'autorizado') {
    return { data: null, error: 'Esta venda já tem uma NF-e autorizada.' }
  }

  const { data: empresa, error: erroEmpresa } = await buscarEmpresaFiscal()
  if (erroEmpresa || !empresa) return { data: null, error: erroEmpresa }

  const { data: venda, error: erroVenda } = await buscarVenda(vendaId)
  if (erroVenda || !venda) return { data: null, error: erroVenda }

  const problemas = validar(venda)
  if (problemas.length) return { data: null, error: problemas.join(' ') }

  const ref = refDaVenda(vendaId)
  const payload = montarPayload(empresa, venda)

  const { data: nota, error: erroUpsert } = await supabase
    .from('notas_fiscais')
    .upsert({ venda_id: vendaId, ref, status: 'processando', erro: null }, { onConflict: 'venda_id' })
    .select('*')
    .single()
  if (erroUpsert || !nota) return { data: null, error: 'Falha ao registrar a nota fiscal.' }

  const { status, body } = await focusNfeRequest<Record<string, unknown>>('POST', `/nfe?ref=${ref}`, payload)

  if (status >= 400) {
    const mensagem = (body.mensagem as string) ?? (body.erros as { mensagem?: string }[])?.[0]?.mensagem ?? 'Erro ao emitir NF-e na Focus NFe.'
    await supabase.from('notas_fiscais').update({ status: 'erro', erro: mensagem, updated_at: new Date().toISOString() }).eq('id', nota.id)
    return { data: null, error: mensagem }
  }

  const atualizada = await aplicarRespostaFocusNfe(nota.id, body)
  return { data: atualizada, error: null }
}
