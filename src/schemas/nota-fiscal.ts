import { z } from 'zod'

export const emitirNotaFiscalSchema = z.object({
  venda_id: z.string().uuid('venda_id inválido'),
})

export type EmitirNotaFiscalInput = z.infer<typeof emitirNotaFiscalSchema>
