import { Router, type Response } from 'express'
import type { ZodType } from 'zod'
import { exigirConta, exigirEquipe, type SessaoConta } from '../lib/site-auth'
import { limitarPorIp } from '../lib/rate-limit'
import {
  alterarSenhaSchema, atualizarPerfilSchema, cadastrarContaSchema, criarPedidoSchema, loginSchema,
} from '../schemas/conta'
import {
  alterarSenha, atualizarPerfil, buscarPerfil, cadastrarConta, ErroConta, login, redefinirSenhaPelaEquipe,
} from '../services/conta'
import { criarPedidoSite } from '../services/pedidos-site'

// Contas de clientes do site (Oliveira Joias). Chamado pelas rotas /api do
// portfólio, que guardam o token num cookie httpOnly.
export const contaRouter = Router()

function validar<T>(schema: ZodType<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  const campos = (result.error as { flatten: () => { fieldErrors: Record<string, string[]> } }).flatten().fieldErrors
  res.status(400).json({ error: Object.values(campos).flat()[0] ?? 'Dados inválidos', detalhes: campos })
  return null
}

function tratarErro(res: Response, err: unknown) {
  if (err instanceof ErroConta) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[Conta]', err)
  res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' })
}

const sessao = (res: Response) => res.locals.sessao as SessaoConta

contaRouter.post('/cadastro', limitarPorIp(5, 15 * 60 * 1000), async (req, res) => {
  const input = validar(cadastrarContaSchema, req.body, res)
  if (!input) return
  try {
    res.status(201).json({ data: await cadastrarConta(input) })
  } catch (err) {
    tratarErro(res, err)
  }
})

contaRouter.post('/login', limitarPorIp(10, 15 * 60 * 1000), async (req, res) => {
  const input = validar(loginSchema, req.body, res)
  if (!input) return
  try {
    res.json({ data: await login(input) })
  } catch (err) {
    tratarErro(res, err)
  }
})

contaRouter.get('/', exigirConta, async (_req, res) => {
  try {
    const s = sessao(res)
    res.json({ data: await buscarPerfil(s.contaId, s.clienteId) })
  } catch (err) {
    tratarErro(res, err)
  }
})

contaRouter.put('/', exigirConta, async (req, res) => {
  const input = validar(atualizarPerfilSchema, req.body, res)
  if (!input) return
  try {
    await atualizarPerfil(sessao(res).clienteId, input)
    res.json({ data: { ok: true } })
  } catch (err) {
    tratarErro(res, err)
  }
})

contaRouter.put('/senha', exigirConta, limitarPorIp(10, 15 * 60 * 1000), async (req, res) => {
  const input = validar(alterarSenhaSchema, req.body, res)
  if (!input) return
  try {
    await alterarSenha(sessao(res).contaId, input)
    res.json({ data: { ok: true } })
  } catch (err) {
    tratarErro(res, err)
  }
})

contaRouter.post('/pedidos', exigirConta, limitarPorIp(10, 15 * 60 * 1000), async (req, res) => {
  const input = validar(criarPedidoSchema, req.body, res)
  if (!input) return
  try {
    res.status(201).json({ data: await criarPedidoSite(sessao(res).clienteId, input) })
  } catch (err) {
    tratarErro(res, err)
  }
})

// Sistema (equipe logada): gera senha temporária para o cliente.
contaRouter.post('/equipe/redefinir-senha', exigirEquipe, async (req, res) => {
  const clienteId = typeof req.body?.cliente_id === 'string' ? req.body.cliente_id : ''
  if (!clienteId) {
    res.status(400).json({ error: 'cliente_id é obrigatório.' })
    return
  }
  try {
    res.json({ data: await redefinirSenhaPelaEquipe(clienteId, res.locals.usuarioEquipe as string) })
  } catch (err) {
    tratarErro(res, err)
  }
})
