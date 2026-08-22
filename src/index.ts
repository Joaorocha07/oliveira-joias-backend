import express from 'express'
import cors from 'cors'
import { env } from './lib/env'
import { produtosRouter } from './routes/produtos'
import { categoriasRouter } from './routes/categorias'
import { configRouter } from './routes/config'
import { popupsRouter } from './routes/popups'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/produtos', produtosRouter)
app.use('/api/categorias', categoriasRouter)
app.use('/api/config', configRouter)
app.use('/api/popups', popupsRouter)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(400).json({ error: err.message })
})

app.listen(env.port, () => {
  console.log(`oliveira-joias-backend rodando em http://localhost:${env.port}`)
})
