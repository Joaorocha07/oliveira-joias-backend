import { Router } from 'express'
import { buscarConfig, atualizarConfig } from '../services/config'
import { atualizarConfigSchema } from '../schemas/config'

export const configRouter = Router()

configRouter.get('/', async (_req, res) => {
  const { data, error } = await buscarConfig()
  if (error) return res.status(500).json({ error })
  res.json({ data })
})

configRouter.put('/', async (req, res) => {
  const result = atualizarConfigSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0]?.message ?? 'Dados inválidos' })
  }
  const { error } = await atualizarConfig(result.data)
  if (error) return res.status(500).json({ error })
  res.json({ data: { ok: true } })
})
