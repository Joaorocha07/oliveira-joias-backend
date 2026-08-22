import { Router } from 'express'
import multer from 'multer'
import { criarProdutoSchema, atualizarProdutoSchema } from '../schemas/produto'
import { criarProduto, listarProdutos, buscarProdutoPorSlug, atualizarProduto, excluirProduto, reordenarProdutos } from '../services/produtos'

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

// PUT /api/produtos/reordenar — atualiza a ordem de exibição dos produtos
// Body: { itens: [{ id: string, ordem: number }] }
produtosRouter.put('/reordenar', async (req, res) => {
  const { itens } = req.body as { itens?: { id: string; ordem: number }[] }
  if (!Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'itens é obrigatório e deve ser um array não vazio.' })
    return
  }
  const { error } = await reordenarProdutos(itens)
  if (error) { res.status(500).json({ error }); return }
  res.status(204).send()
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

  try {
    const { data, error } = await criarProduto(parsed.data, arquivos)
    if (error) {
      res.status(500).json({ error })
      return
    }
    res.status(201).json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao cadastrar produto' })
  }
})

// PUT /api/produtos/:id — multipart/form-data
// Mesmos campos do POST + imagens_manter (JSON com URLs das imagens existentes a preservar).
// Novas imagens enviadas em "imagens" são anexadas às de imagens_manter.
produtosRouter.put('/:id', upload.array('imagens', 10), async (req, res) => {
  const parsed = atualizarProdutoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    return
  }

  const { id } = req.params
  if (!id) {
    res.status(400).json({ error: 'ID do produto é obrigatório' })
    return
  }

  const arquivos = (req.files as Express.Multer.File[] | undefined) ?? []

  try {
    const { data, error } = await atualizarProduto(id, parsed.data, arquivos)
    if (error) {
      res.status(500).json({ error })
      return
    }
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar produto' })
  }
})

// DELETE /api/produtos/:id
produtosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params
  if (!id) {
    res.status(400).json({ error: 'ID do produto é obrigatório' })
    return
  }

  const { error } = await excluirProduto(id)
  if (error) {
    res.status(500).json({ error })
    return
  }
  res.status(204).send()
})
