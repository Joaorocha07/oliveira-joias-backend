import { Router } from 'express'
import { criarCategoriaSchema, atualizarCategoriaSchema } from '../schemas/categoria'
import { listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria } from '../services/categorias'

export const categoriasRouter = Router()

// GET /api/categorias
categoriasRouter.get('/', async (_req, res) => {
  const { data, error } = await listarCategorias()
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

// POST /api/categorias
categoriasRouter.post('/', async (req, res) => {
  const parsed = criarCategoriaSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }
  const { data, error } = await criarCategoria(parsed.data)
  if (error) { res.status(400).json({ error }); return }
  res.status(201).json({ data })
})

// PUT /api/categorias/:id
categoriasRouter.put('/:id', async (req, res) => {
  const parsed = atualizarCategoriaSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }
  const { data, error } = await atualizarCategoria(req.params.id!, parsed.data)
  if (error) { res.status(400).json({ error }); return }
  res.json({ data })
})

// DELETE /api/categorias/:id
categoriasRouter.delete('/:id', async (req, res) => {
  const { error } = await excluirCategoria(req.params.id!)
  if (error) { res.status(500).json({ error }); return }
  res.status(204).send()
})
