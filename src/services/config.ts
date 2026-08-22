import { supabase } from '../lib/supabase'
import type { AtualizarConfigInput } from '../schemas/config'

const CONFIG_ID = 'default'

export type CatalogoConfig = {
  id: string
  info_produto: string
  voce_sabia: string
  faq: Array<{ pergunta: string; resposta: string }>
  updated_at: string
}

const DEFAULT_CONFIG: CatalogoConfig = {
  id: CONFIG_ID,
  info_produto: '',
  voce_sabia: '',
  faq: [],
  updated_at: new Date().toISOString(),
}

export async function buscarConfig(): Promise<{ data: CatalogoConfig | null; error: string | null }> {
  const { data, error } = await supabase
    .from('catalogo_config')
    .select('*')
    .eq('id', CONFIG_ID)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data ?? DEFAULT_CONFIG, error: null }
}

export async function atualizarConfig(
  input: AtualizarConfigInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('catalogo_config').upsert({
    id: CONFIG_ID,
    info_produto: input.info_produto,
    voce_sabia: input.voce_sabia,
    faq: input.faq,
    updated_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }
  return { error: null }
}
