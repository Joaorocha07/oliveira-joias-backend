import type { NextFunction, Request, Response } from 'express'

// Limite simples por IP, em memória (suficiente para uma instância no Render).
export function limitarPorIp(limite: number, janelaMs: number, mensagem = 'Muitas tentativas. Tente novamente em alguns minutos.') {
  const tentativas = new Map<string, number[]>()
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'desconhecido'
    const agora = Date.now()
    const recentes = (tentativas.get(ip) ?? []).filter((t) => agora - t < janelaMs)
    recentes.push(agora)
    tentativas.set(ip, recentes)
    if (tentativas.size > 5000) tentativas.clear()
    if (recentes.length > limite) {
      res.status(429).json({ error: mensagem })
      return
    }
    next()
  }
}
