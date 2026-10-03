import { Router, Request, Response } from 'express'
import { getAllSlotsStatus, connectSlot, disconnectSlot } from '../lib/whatsapp-manager'
import { env } from '../lib/env'

export const whatsappRouter = Router()

// Proteção simples: verifica o segredo compartilhado com o frontend
function verificarSegredo(req: Request, res: Response): boolean {
  if (!env.whatsappSecret) return true // sem segredo configurado: rota aberta (não recomendado em prod)
  const secret = req.headers['x-whatsapp-secret']
  if (secret !== env.whatsappSecret) {
    res.status(401).json({ error: 'Não autorizado.' })
    return false
  }
  return true
}

// GET /api/whatsapp/status
whatsappRouter.get('/status', (_req, res) => {
  res.json({ slots: getAllSlotsStatus() })
})

// POST /api/whatsapp/connect
// Body: { slot: 0 | 1 }
whatsappRouter.post('/connect', (req, res) => {
  if (!verificarSegredo(req, res)) return

  const slot = typeof req.body?.slot === 'number' ? req.body.slot : 0
  if (slot < 0 || slot > 1) {
    res.status(400).json({ error: 'Slot inválido. Use 0 ou 1.' })
    return
  }

  const adminId = typeof req.headers['x-admin-id'] === 'string'
    ? req.headers['x-admin-id']
    : undefined

  connectSlot(slot, adminId)
  res.json({ slots: getAllSlotsStatus() })
})

// POST /api/whatsapp/disconnect
// Body: { slot: 0 | 1 }
whatsappRouter.post('/disconnect', async (req, res) => {
  if (!verificarSegredo(req, res)) return

  const slot = typeof req.body?.slot === 'number' ? req.body.slot : 0
  if (slot < 0 || slot > 1) {
    res.status(400).json({ error: 'Slot inválido. Use 0 ou 1.' })
    return
  }

  await disconnectSlot(slot)
  res.json({ slots: getAllSlotsStatus() })
})
