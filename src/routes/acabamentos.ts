import { Router } from 'express'
import { criarAcabamentoSchema, atualizarAcabamentoSchema } from '../schemas/acabamento'
import { listarAcabamentos, criarAcabamento, atualizarAcabamento, excluirAcabamento } from '../services/acabamentos'

export const acabamentosRouter = Router()

// GET /api/acabamentos
acabamentosRouter.get('/', async (_req, res) => {
  const { data, error } = await listarAcabamentos()
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

// POST /api/acabamentos
acabamentosRouter.post('/', async (req, res) => {
  const parsed = criarAcabamentoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }
  const { data, error } = await criarAcabamento(parsed.data)
  if (error) { res.status(400).json({ error }); return }
  res.status(201).json({ data })
})

// PUT /api/acabamentos/:id
acabamentosRouter.put('/:id', async (req, res) => {
  const parsed = atualizarAcabamentoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }
  const { data, error } = await atualizarAcabamento(req.params.id!, parsed.data)
  if (error) { res.status(400).json({ error }); return }
  res.json({ data })
})

// DELETE /api/acabamentos/:id
acabamentosRouter.delete('/:id', async (req, res) => {
  const { error } = await excluirAcabamento(req.params.id!)
  if (error) { res.status(500).json({ error }); return }
  res.status(204).send()
})
