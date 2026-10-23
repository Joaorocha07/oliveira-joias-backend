import { z } from 'zod'

export const criarCategoriaSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
})

export const atualizarCategoriaSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório').optional(),
  ativo: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
})

export type CriarCategoriaInput = z.infer<typeof criarCategoriaSchema>
export type AtualizarCategoriaInput = z.infer<typeof atualizarCategoriaSchema>
