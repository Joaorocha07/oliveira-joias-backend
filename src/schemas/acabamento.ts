import { z } from 'zod'

export const criarAcabamentoSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
})

export const atualizarAcabamentoSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório').optional(),
  ativo: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
})

export type CriarAcabamentoInput = z.infer<typeof criarAcabamentoSchema>
export type AtualizarAcabamentoInput = z.infer<typeof atualizarAcabamentoSchema>
