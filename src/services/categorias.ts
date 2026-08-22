import { supabase } from '../lib/supabase'
import type { CriarCategoriaInput, AtualizarCategoriaInput } from '../schemas/categoria'

export type CategoriaCatalogo = {
  id: string
  nome: string
  ativo: boolean
  created_at: string
}

export async function listarCategorias(): Promise<{ data: CategoriaCatalogo[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_categorias')
    .select('*')
    .order('nome', { ascending: true })

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function criarCategoria(
  input: CriarCategoriaInput,
): Promise<{ data: CategoriaCatalogo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_categorias')
    .insert({ nome: input.nome })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { data: null, error: 'Já existe uma categoria com esse nome.' }
    return { data: null, error: error.message }
  }
  return { data, error: null }
}

export async function atualizarCategoria(
  id: string,
  input: AtualizarCategoriaInput,
): Promise<{ data: CategoriaCatalogo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_categorias')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { data: null, error: 'Já existe uma categoria com esse nome.' }
    return { data: null, error: error.message }
  }
  return { data, error: null }
}

export async function excluirCategoria(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('catalogo_categorias')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  return { error: null }
}
