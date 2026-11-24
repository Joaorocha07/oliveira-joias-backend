import { z } from 'zod'

const telefone = z
  .string()
  .trim()
  .refine((v) => {
    const digits = v.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 13
  }, 'Telefone inválido')

const senha = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(128)

export const cadastrarContaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  telefone,
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  senha,
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})

export const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  telefone,
  cidade: z.string().trim().max(80).nullable().optional(),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
})

export const alterarSenhaSchema = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual'),
  nova_senha: senha,
})

export const criarPedidoSchema = z.object({
  itens: z
    .array(
      z.object({
        slug: z.string().trim().min(1),
        quantidade: z.number().int().min(1).max(20),
        observacao: z.string().trim().max(200).optional(),
        // Aros escolhidos no site (1 ou 2, conforme o produto).
        aros: z.array(z.number().int().min(1).max(40)).max(2).optional(),
      }),
    )
    .min(1, 'Seu carrinho está vazio')
    .max(30),
  cupom_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().trim().max(500).optional(),
})

export type CadastrarContaInput = z.infer<typeof cadastrarContaSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type AtualizarPerfilInput = z.infer<typeof atualizarPerfilSchema>
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>
export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>
