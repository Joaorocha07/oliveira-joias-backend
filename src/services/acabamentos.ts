import { supabase } from '../lib/supabase'
import type { CriarAcabamentoInput, AtualizarAcabamentoInput } from '../schemas/acabamento'

export type AcabamentoCatalogo = {
  id: string
  nome: string
  ativo: boolean
  created_at: string
}

export async function listarAcabamentos(): Promise<{ data: AcabamentoCatalogo[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_acabamentos')
    .select('*')
    .order('nome', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function criarAcabamento(
  input: CriarAcabamentoInput,
): Promise<{ data: AcabamentoCatalogo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_acabamentos')
    .insert({ nome: input.nome })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return { data: null, error: 'Já existe um acabamento com esse nome.' }
    return { data: null, error: error.message }
  }
  return { data, error: null }
}

export async function atualizarAcabamento(
  id: string,
  input: AtualizarAcabamentoInput,
): Promise<{ data: AcabamentoCatalogo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_acabamentos')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return { data: null, error: 'Já existe um acabamento com esse nome.' }
    return { data: null, error: error.message }
  }
  return { data, error: null }
}

export async function excluirAcabamento(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('catalogo_acabamentos')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}
