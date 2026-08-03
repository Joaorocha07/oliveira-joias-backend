import { z } from 'zod'

export const categoriaProduto = ['alianças', 'anéis', 'correntes', 'serviços'] as const

// multipart/form-data chega sempre como string — campo vazio ("") vira
// undefined antes da validação, e os campos numéricos são coagidos.
const optionalText = () =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(1).optional())

const optionalNumber = () =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  )

export const criarProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
  categoria: z.enum(categoriaProduto, { error: 'Categoria é obrigatória' }),
  linha: optionalText(),
  material: z.string().trim().min(1, 'Material é obrigatório'),
  largura: optionalText(),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória'),
  valor: z.coerce.number().min(0, 'Valor deve ser maior ou igual a zero'),
  parcelas: optionalNumber(),
})

export type CriarProdutoInput = z.infer<typeof criarProdutoSchema>
