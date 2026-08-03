import { supabase } from '../lib/supabase'
import { uploadImagemProduto } from '../lib/r2'
import type { CriarProdutoInput } from '../schemas/produto'

function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function gerarSlugUnico(nome: string): Promise<string> {
  const base = gerarSlug(nome)
  const { data } = await supabase.from('catalogo_produtos').select('slug').ilike('slug', `${base}%`)

  const existentes = new Set((data ?? []).map((p) => p.slug))
  if (!existentes.has(base)) return base

  let n = 2
  while (existentes.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

type ImagemUpload = { buffer: Buffer; mimetype: string; originalname: string }

export async function criarProduto(
  input: CriarProdutoInput,
  imagens: ImagemUpload[],
): Promise<{ data: { id: string; slug: string } | null; error: string | null }> {
  const slug = await gerarSlugUnico(input.nome)

  const urls = await Promise.all(imagens.map((imagem) => uploadImagemProduto(imagem, slug)))

  const { data, error } = await supabase
    .from('catalogo_produtos')
    .insert({
      nome: input.nome,
      slug,
      categoria: input.categoria,
      linha: input.linha ?? null,
      material: input.material,
      largura: input.largura ?? null,
      descricao: input.descricao,
      valor: input.valor,
      parcelas: input.parcelas ?? null,
      destaque: input.destaque,
      imagens: urls,
    })
    .select('id, slug')
    .single()

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export type ProdutoCatalogo = {
  id: string
  nome: string
  slug: string
  categoria: string
  linha: string | null
  material: string
  largura: string | null
  descricao: string
  valor: number
  parcelas: number | null
  imagens: string[]
  destaque: boolean
  ativo: boolean
  created_at: string
}

export async function listarProdutos(filtros: {
  categoria?: string
  destaque?: boolean
}): Promise<{ data: ProdutoCatalogo[] | null; error: string | null }> {
  let query = supabase
    .from('catalogo_produtos')
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  if (filtros.categoria) query = query.eq('categoria', filtros.categoria)
  if (filtros.destaque !== undefined) query = query.eq('destaque', filtros.destaque)

  const { data, error } = await query
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function buscarProdutoPorSlug(
  slug: string,
): Promise<{ data: ProdutoCatalogo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_produtos')
    .select('*')
    .eq('slug', slug)
    .eq('ativo', true)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}
