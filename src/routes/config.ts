import { Router } from 'express'
import { buscarConfig, atualizarConfig } from '../services/config'
import { atualizarConfigSchema } from '../schemas/config'

export const configRouter = Router()

configRouter.get('/', async (_req, res) => {
  const { data, error } = await buscarConfig()
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

configRouter.put('/', async (req, res) => {
  const result = atualizarConfigSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: result.error.flatten().fieldErrors })
    return
  }
  const { error } = await atualizarConfig(result.data)
  if (error) { res.status(500).json({ error }); return }
  res.json({ data: { ok: true } })
})
