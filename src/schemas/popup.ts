import { z } from 'zod'

const TIPOS = ['boas_vindas', 'promocao', 'saida'] as const

export const criarPopupSchema = z.object({
  tipo: z.enum(TIPOS),
  titulo: z.string().trim().min(1, 'Título é obrigatório'),
  mensagem: z.string().trim().min(1, 'Mensagem é obrigatória'),
  produto_slug: z.string().trim().optional(),
  cta_texto: z.string().trim().optional(),
  cta_url: z.string().trim().optional(),
  ativo: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(true),
  delay_segundos: z.preprocess((v) => Number(v), z.number().int().min(0).max(60)).default(2),
})

export const atualizarPopupSchema = criarPopupSchema.partial()

export type CriarPopupInput = z.infer<typeof criarPopupSchema>
export type AtualizarPopupInput = z.infer<typeof atualizarPopupSchema>
