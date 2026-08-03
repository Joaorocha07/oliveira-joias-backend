import { Router } from 'express'
import multer from 'multer'
import { criarProdutoSchema } from '../schemas/produto'
import { criarProduto } from '../services/produtos'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Apenas arquivos de imagem são permitidos'))
      return
    }
    cb(null, true)
  },
})

export const produtosRouter = Router()

// POST /api/produtos — multipart/form-data
// Campos: nome, categoria, linha?, material, largura?, descricao, valor, parcelas?
// Arquivos: imagens (0..10)
produtosRouter.post('/', upload.array('imagens', 10), async (req, res) => {
  const parsed = criarProdutoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }

  const arquivos = (req.files as Express.Multer.File[] | undefined) ?? []

  const { data, error } = await criarProduto(parsed.data, arquivos)
  if (error) {
    res.status(500).json({ error })
    return
  }

  res.status(201).json({ data })
})
