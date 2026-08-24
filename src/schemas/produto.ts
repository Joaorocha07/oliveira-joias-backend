import { z } from 'zod'

// multipart/form-data chega sempre como string — campo vazio ("") vira
// undefined antes da validação, e os campos numéricos são coagidos.
const optionalText = () =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(1).optional())

const optionalNumber = () =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  )

const optionalDecimal = () =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.coerce.number().positive().optional(),
  )

const faqItem = z.object({ pergunta: z.string(), resposta: z.string() })

export const criarProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
  categoria: z.string().trim().min(1, 'Categoria é obrigatória'),
  linha: optionalText(),
  material: z.string().trim().min(1, 'Material é obrigatório'),
  largura: optionalText(),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória'),
  valor: z.coerce.number().min(0, 'Valor deve ser maior ou igual a zero'),
  parcelas: optionalNumber(),
  valor_parcela: optionalDecimal(),
  destaque: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  info_produto: optionalText(),
  voce_sabia: optionalText(),
  faq: z.preprocess(
    (v) => {
      if (!v || v === '') return []
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      if (Array.isArray(v)) return v
      return []
    },
    z.array(faqItem).default([]),
  ),
})

export type CriarProdutoInput = z.infer<typeof criarProdutoSchema>

// imagens_manter chega como string JSON (array de URLs das imagens existentes que devem
// permanecer) — o que não estiver nessa lista é descartado; novas imagens enviadas no
// multipart são anexadas a essa lista.
export const atualizarProdutoSchema = criarProdutoSchema.extend({
  imagens_manter: z.preprocess((v) => {
    if (v === undefined) return []
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v)
        return Array.isArray(parsed) ? parsed : [v]
      } catch {
        return [v]
      }
    }
    return v
  }, z.array(z.string())),
})

export type AtualizarProdutoInput = z.infer<typeof atualizarProdutoSchema>
