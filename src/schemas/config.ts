import { z } from 'zod'

const faqItemSchema = z.object({
  pergunta: z.string().trim().min(1, 'Pergunta é obrigatória'),
  resposta: z.string().trim().min(1, 'Resposta é obrigatória'),
})

export const atualizarConfigSchema = z.object({
  info_produto: z.string().default(''),
  voce_sabia: z.string().default(''),
  faq: z.array(faqItemSchema).default([]),
})

export type AtualizarConfigInput = z.infer<typeof atualizarConfigSchema>
