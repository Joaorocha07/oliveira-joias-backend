import { z } from 'zod'

export const cadastrarLeadSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  telefone: z
    .string()
    .trim()
    .refine((v) => {
      const digits = v.replace(/\D/g, '')
      return digits.length >= 10 && digits.length <= 13
    }, 'Telefone inválido'),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  // Campo "isca" invisível no formulário: humanos deixam vazio, bots preenchem.
  website: z.string().optional(),
})

export type CadastrarLeadInput = z.infer<typeof cadastrarLeadSchema>
