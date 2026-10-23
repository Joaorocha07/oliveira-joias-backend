import { Router } from 'express'
import { env } from '../lib/env'
import { SLOT_COUNT, connect, disconnect, getAllStatus } from '../services/whatsapp'

export const whatsappRouter = Router()

// Chamado só pelas rotas /api/whatsapp/* do frontend (Next.js), que validam
// que o usuário é admin. Quando WHATSAPP_SECRET está definido, exige o mesmo
// valor no header para ninguém conectar/desconectar chamando o backend direto.
whatsappRouter.use((req, res, next) => {
  if (env.whatsappSecret && req.header('x-whatsapp-secret') !== env.whatsappSecret) {
    res.status(401).json({ error: 'Não autorizado.' })
    return
  }
  next()
})

function parseSlot(value: unknown): number | null {
  const slot = Number(value)
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT ? slot : null
}

// GET /api/whatsapp/status — estado dos 2 números
whatsappRouter.get('/status', (_req, res) => {
  res.json(getAllStatus())
})

// POST /api/whatsapp/connect { slot } — inicia a conexão (o QR aparece no status)
whatsappRouter.post('/connect', async (req, res) => {
  const slot = parseSlot(req.body?.slot)
  if (slot === null) {
    res.status(400).json({ error: 'Slot inválido.' })
    return
  }
  try {
    await connect(slot, req.header('x-admin-id') ?? undefined)
    res.json(getAllStatus())
  } catch (err) {
    console.error('[WhatsApp] Erro ao conectar:', err)
    res.status(500).json({ error: 'Não foi possível iniciar a conexão com o WhatsApp.' })
  }
})

// POST /api/whatsapp/disconnect { slot } — desconecta e apaga a sessão salva
whatsappRouter.post('/disconnect', async (req, res) => {
  const slot = parseSlot(req.body?.slot)
  if (slot === null) {
    res.status(400).json({ error: 'Slot inválido.' })
    return
  }
  try {
    await disconnect(slot)
    res.json(getAllStatus())
  } catch (err) {
    console.error('[WhatsApp] Erro ao desconectar:', err)
    res.status(500).json({ error: 'Não foi possível desconectar o WhatsApp.' })
  }
})
