import { supabase } from '../lib/supabase'
import { randomInt } from 'crypto'
import { assinarToken, garantirSegredoConfigurado, hashSenha, verificarSenha } from '../lib/site-auth'
import { buscarExistente, criarClienteSite, escapeLike, normalizarTelefone } from './leads'
import { garantirCupomBoasVindas, listarCuponsAtivos } from './cupons'
import type { AlterarSenhaInput, AtualizarPerfilInput, CadastrarContaInput, LoginInput } from '../schemas/conta'

export class ErroConta extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

type ContaRow = { id: string; cliente_id: string; email: string; senha_hash: string; verificado: boolean }

async function buscarContaPorEmail(email: string): Promise<ContaRow | null> {
  const { data, error } = await supabase
    .from('site_contas')
    .select('id, cliente_id, email, senha_hash, verificado')
    .ilike('email', escapeLike(email))
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as ContaRow | null
}

export async function cadastrarConta(input: CadastrarContaInput): Promise<{ token: string }> {
  garantirSegredoConfigurado()
  const telefone = normalizarTelefone(input.telefone)
  const nome = input.nome.replace(/\s+/g, ' ').trim()

  const contaExistente = await buscarContaPorEmail(input.email)
  if (contaExistente) {
    // Tentou "criar conta" de novo com a mesma senha (ex.: achou que o cadastro
    // não tinha terminado): só entra, sem erro.
    if (await verificarSenha(input.senha, contaExistente.senha_hash)) {
      await supabase.from('site_contas').update({ ultimo_login_em: new Date().toISOString() }).eq('id', contaExistente.id)
      return { token: assinarToken({ contaId: contaExistente.id, clienteId: contaExistente.cliente_id }) }
    }
    throw new ErroConta('Já existe uma conta com este e-mail. Use a aba "Entrar" com a senha dela.', 409)
  }

  // Mesma regra do pop-up: reaproveita o cadastro existente (e-mail ou telefone).
  const existente = await buscarExistente(input.email, telefone)
  let clienteId: string

  if (existente) {
    const { data: contaDoCliente } = await supabase
      .from('site_contas')
      .select('id')
      .eq('cliente_id', existente.id)
      .maybeSingle()
    if (contaDoCliente) {
      throw new ErroConta('Já existe uma conta para este telefone. Entre com o e-mail usado nela.', 409)
    }
    const updates: Record<string, string> = {}
    if (!existente.email) updates.email = input.email
    if (!existente.telefone) updates.telefone = telefone
    if (!existente.whatsapp) updates.whatsapp = telefone
    if (Object.keys(updates).length) await supabase.from('clientes').update(updates).eq('id', existente.id)
    await supabase.from('cliente_timeline').insert({
      cliente_id: existente.id,
      tipo: 'sistema',
      descricao: `Criou conta no site (${input.email})`,
    })
    clienteId = existente.id
  } else {
    clienteId = await criarClienteSite({
      nome,
      email: input.email,
      telefone,
      observacoes: 'Criou conta no site',
      eventoTimeline: `Criou conta no site (${input.email})`,
    })
  }

  const { data: conta, error } = await supabase
    .from('site_contas')
    .insert({ cliente_id: clienteId, email: input.email, senha_hash: await hashSenha(input.senha), ultimo_login_em: new Date().toISOString() })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new ErroConta('Já existe uma conta com estes dados. Entre com sua senha.', 409)
    throw new Error(error.message)
  }

  // Se algo falhar daqui em diante, desfaz a conta para não sobrar um login
  // "pela metade" que impede a pessoa de tentar de novo.
  try {
    const token = assinarToken({ contaId: conta.id as string, clienteId })
    await garantirCupomBoasVindas(clienteId)
    return { token }
  } catch (err) {
    await supabase.from('site_contas').delete().eq('id', conta.id)
    throw err
  }
}

export async function login(input: LoginInput): Promise<{ token: string }> {
  garantirSegredoConfigurado()
  const conta = await buscarContaPorEmail(input.email)
  // Mesmo erro para e-mail inexistente e senha errada (não revela quem tem conta).
  if (!conta || !(await verificarSenha(input.senha, conta.senha_hash))) {
    throw new ErroConta('E-mail ou senha incorretos.', 401)
  }
  await supabase.from('site_contas').update({ ultimo_login_em: new Date().toISOString() }).eq('id', conta.id)
  return { token: assinarToken({ contaId: conta.id, clienteId: conta.cliente_id }) }
}

export async function buscarPerfil(contaId: string, clienteId: string) {
  const [contaRes, clienteRes, cupons, pedidosRes] = await Promise.all([
    supabase.from('site_contas').select('email, verificado').eq('id', contaId).maybeSingle(),
    supabase.from('clientes').select('nome, email, telefone, whatsapp, cidade, data_nascimento').eq('id', clienteId).maybeSingle(),
    listarCuponsAtivos(clienteId),
    supabase
      .from('site_pedidos')
      .select('numero, itens, subtotal, desconto, total, cupom_codigo, status, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (!contaRes.data || !clienteRes.data) throw new ErroConta('Sessão inválida. Entre novamente.', 401)

  // Compras lançadas pela equipe no sistema para este cliente (vendas não
  // canceladas e que não são só orçamento) — aparecem assim que a conta existe.
  const { data: compras, error: comprasError } = await supabase
    .from('vendas')
    .select('numero, data_venda, total, desconto, status, descricao_livre, itens:venda_itens(nome_produto, quantidade, subtotal)')
    .eq('cliente_id', clienteId)
    .not('status', 'in', '(cancelado,orcamento)')
    .order('data_venda', { ascending: false })
    .limit(50)
  if (comprasError) throw new Error(comprasError.message)

  const c = clienteRes.data
  return {
    conta: { email: contaRes.data.email, verificado: contaRes.data.verificado },
    perfil: {
      nome: c.nome,
      email: c.email ?? contaRes.data.email,
      telefone: c.telefone ?? c.whatsapp,
      cidade: c.cidade,
      data_nascimento: c.data_nascimento,
    },
    cupons: cupons.map(({ id, codigo, descricao, tipo, valor, validade }) => ({ id, codigo, descricao, tipo, valor, validade })),
    pedidos: pedidosRes.data ?? [],
    compras: compras ?? [],
  }
}

export async function atualizarPerfil(clienteId: string, input: AtualizarPerfilInput): Promise<void> {
  const telefone = normalizarTelefone(input.telefone)
  const { error } = await supabase
    .from('clientes')
    .update({
      nome: input.nome.replace(/\s+/g, ' ').trim(),
      telefone,
      cidade: input.cidade || null,
      data_nascimento: input.data_nascimento || null,
    })
    .eq('id', clienteId)
  if (error) throw new Error(error.message)
}

export async function alterarSenha(contaId: string, input: AlterarSenhaInput): Promise<void> {
  const { data: conta } = await supabase.from('site_contas').select('senha_hash').eq('id', contaId).maybeSingle()
  if (!conta || !(await verificarSenha(input.senha_atual, conta.senha_hash as string))) {
    throw new ErroConta('Senha atual incorreta.', 400)
  }
  const { error } = await supabase
    .from('site_contas')
    .update({ senha_hash: await hashSenha(input.nova_senha), updated_at: new Date().toISOString() })
    .eq('id', contaId)
  if (error) throw new Error(error.message)
}

// Equipe gera uma senha temporária para o cliente que esqueceu a dele
// (não há serviço de e-mail para "esqueci minha senha").
export async function redefinirSenhaPelaEquipe(clienteId: string, usuarioId: string): Promise<{ senha_temporaria: string }> {
  const { data: conta } = await supabase.from('site_contas').select('id').eq('cliente_id', clienteId).maybeSingle()
  if (!conta) throw new ErroConta('Este cadastro não tem conta no site.', 404)
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789'
  const senha = Array.from({ length: 10 }, () => alfabeto[randomInt(alfabeto.length)]).join('')
  const { error } = await supabase
    .from('site_contas')
    .update({ senha_hash: await hashSenha(senha), updated_at: new Date().toISOString() })
    .eq('id', conta.id)
  if (error) throw new Error(error.message)
  await supabase.from('cliente_timeline').insert({
    cliente_id: clienteId,
    tipo: 'sistema',
    descricao: 'Senha da conta do site redefinida pela equipe',
    created_by: usuarioId,
  })
  return { senha_temporaria: senha }
}
