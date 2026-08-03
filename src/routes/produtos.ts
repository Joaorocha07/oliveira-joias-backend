import { Router } from 'express'
import multer from 'multer'
import { criarProdutoSchema } from '../schemas/produto'
import { criarProduto, listarProdutos, buscarProdutoPorSlug } from '../services/produtos'

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

// GET /api/produtos — lista produtos ativos do catálogo
// Query params opcionais: categoria, destaque=true|false
produtosRouter.get('/', async (req, res) => {
  const categoria = typeof req.query.categoria === 'string' ? req.query.categoria : undefined
  const destaqueRaw = typeof req.query.destaque === 'string' ? req.query.destaque : undefined
  const destaque = destaqueRaw === undefined ? undefined : destaqueRaw === 'true'

  const { data, error } = await listarProdutos({ categoria, destaque })
  if (error) {
    res.status(500).json({ error })
    return
  }
  res.json({ data })
})

// GET /api/produtos/:slug — busca um produto ativo pelo slug
produtosRouter.get('/:slug', async (req, res) => {
  const { data, error } = await buscarProdutoPorSlug(req.params.slug)
  if (error) {
    res.status(500).json({ error })
    return
  }
  if (!data) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }
  res.json({ data })
})

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
