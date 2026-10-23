import { Router } from 'express'
import { emitirNotaFiscalSchema } from '../schemas/nota-fiscal'
import { emitirNotaFiscal, consultarNotaFiscal } from '../services/notas-fiscais'

export const notasFiscaisRouter = Router()

// POST /api/notas-fiscais/emitir — { venda_id }
notasFiscaisRouter.post('/emitir', async (req, res) => {
  const parsed = emitirNotaFiscalSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }

  try {
    const { data, error } = await emitirNotaFiscal(parsed.data.venda_id)
    if (error) {
      res.status(422).json({ error })
      return
    }
    res.status(201).json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao emitir nota fiscal' })
  }
})

// GET /api/notas-fiscais/venda/:vendaId
notasFiscaisRouter.get('/venda/:vendaId', async (req, res) => {
  try {
    const { data, error } = await consultarNotaFiscal(req.params.vendaId)
    if (error) {
      res.status(500).json({ error })
      return
    }
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao consultar nota fiscal' })
  }
})
