import { supabase } from '../lib/supabase'
import { uploadImagemPopup } from '../lib/r2'
import type { CriarPopupInput, AtualizarPopupInput } from '../schemas/popup'

export type SitePopup = {
  id: string
  tipo: 'boas_vindas' | 'promocao' | 'saida'
  titulo: string
  mensagem: string
  imagem_url: string | null
  produto_slug: string | null
  cta_texto: string | null
  cta_url: string | null
  ativo: boolean
  delay_segundos: number
  created_at: string
  updated_at: string
}

type ImagemUpload = { buffer: Buffer; mimetype: string; originalname: string }

export async function listarPopups(): Promise<{ data: SitePopup[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('site_popups')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function listarPopupsAtivos(): Promise<{ data: SitePopup[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('site_popups')
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function criarPopup(
  input: CriarPopupInput,
  imagem?: ImagemUpload,
): Promise<{ data: SitePopup | null; error: string | null }> {
  const imagem_url = imagem ? await uploadImagemPopup(imagem) : null

  const { data, error } = await supabase
    .from('site_popups')
    .insert({
      tipo: input.tipo,
      titulo: input.titulo,
      mensagem: input.mensagem,
      imagem_url,
      produto_slug: input.produto_slug || null,
      cta_texto: input.cta_texto || null,
      cta_url: input.cta_url || null,
      ativo: input.ativo,
      delay_segundos: input.delay_segundos,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function atualizarPopup(
  id: string,
  input: AtualizarPopupInput,
  imagem?: ImagemUpload,
): Promise<{ data: SitePopup | null; error: string | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.tipo !== undefined) updates.tipo = input.tipo
  if (input.titulo !== undefined) updates.titulo = input.titulo
  if (input.mensagem !== undefined) updates.mensagem = input.mensagem
  if (input.produto_slug !== undefined) updates.produto_slug = input.produto_slug || null
  if (input.cta_texto !== undefined) updates.cta_texto = input.cta_texto || null
  if (input.cta_url !== undefined) updates.cta_url = input.cta_url || null
  if (input.ativo !== undefined) updates.ativo = input.ativo
  if (input.delay_segundos !== undefined) updates.delay_segundos = input.delay_segundos
  if (imagem) updates.imagem_url = await uploadImagemPopup(imagem)

  const { data, error } = await supabase
    .from('site_popups')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function excluirPopup(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_popups').delete().eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}
