import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from './env'
import { supabase } from './supabase'

// Login dos CLIENTES do site (não é o Supabase Auth, que é o login da equipe).
// Senha: scrypt com salt. Sessão: token assinado com HMAC-SHA256 (SITE_AUTH_SECRET).

const SESSAO_DIAS = 30

function scryptAsync(senha: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(senha, salt)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = armazenado.split('$')
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false
  const esperado = Buffer.from(hashB64, 'base64')
  const calculado = await scryptAsync(senha, Buffer.from(saltB64, 'base64'))
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
}

// Chamado no início do cadastro/login: falha ANTES de gravar algo no banco
// se o servidor não estiver configurado.
export function garantirSegredoConfigurado(): void {
  segredo()
}

function segredo(): string {
  const s = env.siteAuthSecret
  if (!s || s.length < 32) {
    throw new Error('SITE_AUTH_SECRET ausente ou curto (mínimo 32 caracteres) — necessário para as contas do site.')
  }
  return s
}

function assinatura(corpo: string): string {
  return createHmac('sha256', segredo()).update(corpo).digest('base64url')
}

export type SessaoConta = { contaId: string; clienteId: string }

export function assinarToken(sessao: SessaoConta): string {
  const exp = Math.floor(Date.now() / 1000) + SESSAO_DIAS * 86_400
  const corpo = Buffer.from(JSON.stringify({ sub: sessao.contaId, cid: sessao.clienteId, exp })).toString('base64url')
  return `${corpo}.${assinatura(corpo)}`
}

export function verificarToken(token: string): SessaoConta | null {
  const [corpo, sig] = token.split('.')
  if (!corpo || !sig) return null
  const esperado = Buffer.from(assinatura(corpo))
  const recebido = Buffer.from(sig)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  try {
    const { sub, cid, exp } = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as { sub: string; cid: string; exp: number }
    if (!sub || !cid || exp * 1000 < Date.now()) return null
    return { contaId: sub, clienteId: cid }
  } catch {
    return null
  }
}

// Middleware: exige "Authorization: Bearer <token>" e expõe a sessão em res.locals.sessao.
export function exigirConta(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const sessao = token ? verificarToken(token) : null
  if (!sessao) {
    res.status(401).json({ error: 'Faça login para continuar.' })
    return
  }
  res.locals.sessao = sessao
  next()
}

// Middleware para rotas da EQUIPE (chamadas pelo sistema): valida o token do
// Supabase Auth do usuário logado no sistema e exige perfil ativo.
export async function exigirEquipe(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Não autorizado.' })
    return
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    res.status(401).json({ error: 'Sessão do sistema inválida. Entre novamente.' })
    return
  }
  const { data: perfil } = await supabase.from('profiles').select('id, ativo').eq('id', data.user.id).maybeSingle()
  if (!perfil?.ativo) {
    res.status(403).json({ error: 'Usuário sem acesso.' })
    return
  }
  res.locals.usuarioEquipe = data.user.id
  next()
}
