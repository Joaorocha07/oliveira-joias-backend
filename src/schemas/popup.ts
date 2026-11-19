import { z } from 'zod'

const TIPOS = ['boas_vindas', 'promocao', 'saida', 'cadastro'] as const

export const criarPopupSchema = z.object({
  tipo: z.enum(TIPOS),
  titulo: z.string().trim().min(1, 'Título é obrigatório'),
  mensagem: z.string().trim().min(1, 'Mensagem é obrigatória'),
  produto_slug: z.string().trim().optional(),
  cta_texto: z.string().trim().optional(),
  cta_url: z.string().trim().optional(),
  // Só para tipo = 'cadastro': cupom liberado depois que o visitante se cadastra.
  cupom_codigo: z.string().trim().max(40).optional(),
  cupom_percentual: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(100).optional(),
  ),
  ativo: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(true),
  delay_segundos: z.preprocess((v) => Number(v), z.number().int().min(0).max(60)).default(2),
})

export const atualizarPopupSchema = criarPopupSchema.partial()

export type CriarPopupInput = z.infer<typeof criarPopupSchema>
export type AtualizarPopupInput = z.infer<typeof atualizarPopupSchema>
