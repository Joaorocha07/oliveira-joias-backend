import { Router } from 'express'
import { cadastrarLeadSchema } from '../schemas/lead'
import { cadastrarLeadSite } from '../services/leads'
import { limitarPorIp } from '../lib/rate-limit'

export const leadsRouter = Router()

// Rota pública (chamada pelo site): no máximo 5 cadastros por IP a cada 15 minutos.
leadsRouter.post('/', limitarPorIp(5, 15 * 60 * 1000), async (req, res) => {
  const result = cadastrarLeadSchema.safeParse(req.body)
  if (!result.success) {
    const campos = result.error.flatten().fieldErrors
    const primeiro = Object.values(campos).flat()[0]
    res.status(400).json({ error: primeiro ?? 'Dados inválidos', detalhes: campos })
    return
  }

  // Bot preencheu o campo invisível: responde "ok" sem gravar nada.
  if (result.data.website) {
    res.status(201).json({ data: { existente: false, primeiro_nome: result.data.nome.split(' ')[0], cupom_codigo: null } })
    return
  }

  try {
    const data = await cadastrarLeadSite(result.data)
    res.status(201).json({ data })
  } catch (err) {
    console.error('[Leads] Erro ao cadastrar lead do site:', err)
    res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' })
  }
})
