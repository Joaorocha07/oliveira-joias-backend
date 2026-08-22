import { Router } from 'express'
import multer from 'multer'
import { criarPopupSchema, atualizarPopupSchema } from '../schemas/popup'
import {
  listarPopups, listarPopupsAtivos,
  criarPopup, atualizarPopup, excluirPopup,
} from '../services/popups'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Apenas arquivos de imagem são permitidos'))
      return
    }
    cb(null, true)
  },
})

export const popupsRouter = Router()

// IMPORTANTE: /ativos deve vir antes de /:id
popupsRouter.get('/ativos', async (_req, res) => {
  const { data, error } = await listarPopupsAtivos()
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

popupsRouter.get('/', async (_req, res) => {
  const { data, error } = await listarPopups()
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

popupsRouter.post('/', upload.single('imagem'), async (req, res) => {
  const result = criarPopupSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: result.error.flatten().fieldErrors })
    return
  }
  const imagem = req.file
    ? { buffer: req.file.buffer, mimetype: req.file.mimetype ?? 'image/jpeg', originalname: req.file.originalname ?? 'image' }
    : undefined
  const { data, error } = await criarPopup(result.data, imagem)
  if (error) { res.status(500).json({ error }); return }
  res.status(201).json({ data })
})

popupsRouter.put('/:id', upload.single('imagem'), async (req, res) => {
  const result = atualizarPopupSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: result.error.flatten().fieldErrors })
    return
  }
  const imagem = req.file
    ? { buffer: req.file.buffer, mimetype: req.file.mimetype ?? 'image/jpeg', originalname: req.file.originalname ?? 'image' }
    : undefined
  const { data, error } = await atualizarPopup(req.params.id, result.data, imagem)
  if (error) { res.status(500).json({ error }); return }
  res.json({ data })
})

popupsRouter.delete('/:id', async (req, res) => {
  const { error } = await excluirPopup(req.params.id)
  if (error) { res.status(500).json({ error }); return }
  res.status(204).send()
})
