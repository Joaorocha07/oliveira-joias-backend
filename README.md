# oliveira-joias-backend

API para cadastro dos produtos exibidos no [oliveira-joias-portfolio](../oliveira-joias-portfolio), usando o mesmo projeto Supabase do [oliveira-joias-frontend](../oliveira-joias-frontend) (sistema/ERP) e Cloudflare R2 para as imagens.

## Setup

```bash
npm install
cp .env.example .env   # preencher as credenciais (ver abaixo)
```

1. Rode `migrations/001_catalogo_produtos.sql` no SQL Editor do Supabase (mesmo projeto do `oliveira-joias-frontend`) — cria a tabela `catalogo_produtos`, separada da `produtos` do ERP.
2. Preencha `.env`:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: em Supabase > Project Settings > API. Use a **service role key** (não a anon), pois o backend precisa ignorar RLS para inserir produtos.
   - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`: em Cloudflare > R2 > Manage API Tokens.
   - `R2_BUCKET_NAME`: nome do bucket criado no R2.
   - `R2_PUBLIC_URL`: domínio público do bucket (ative "Public Access" no bucket e copie a URL `https://pub-xxxx.r2.dev`, ou configure um domínio customizado).

```bash
npm run dev     # desenvolvimento (tsx watch)
npm run build   # compila para dist/
npm run start   # produção (roda dist/index.js)
```

## Endpoint

### `POST /api/produtos`

`multipart/form-data`

| Campo       | Tipo     | Obrigatório | Observação                                      |
|-------------|----------|:-----------:|--------------------------------------------------|
| `nome`      | string   | sim          |                                                    |
| `categoria` | string   | sim          | `alianças` \| `anéis` \| `correntes` \| `serviços` |
| `linha`     | string   | não          | ex: "Aurora"                                      |
| `material`  | string   | sim          | ex: "Prata"                                       |
| `largura`   | string   | não          | ex: "3mm"                                         |
| `descricao` | string   | sim          |                                                    |
| `valor`     | number   | sim          | preço à vista                                     |
| `parcelas`  | number   | não          | quantidade de parcelas                            |
| `imagens`   | file[]   | não          | até 10 imagens, 8MB cada — sobem para o R2         |

Resposta `201`:
```json
{ "data": { "id": "uuid", "slug": "nome-do-produto" } }
```

Exemplo com `curl`:
```bash
curl -X POST http://localhost:3001/api/produtos \
  -F "nome=Aurora Diamantada com Risco Lateral" \
  -F "categoria=alianças" \
  -F "linha=Aurora" \
  -F "material=Prata" \
  -F "largura=3mm" \
  -F "descricao=Aliança com acabamento diamantado e risco lateral." \
  -F "valor=400" \
  -F "parcelas=3" \
  -F "imagens=@./foto1.jpg" \
  -F "imagens=@./foto2.jpg"
```

## Notas

- Sem autenticação no endpoint por enquanto (decisão explícita) — qualquer requisição para a URL pode criar produtos. Se o serviço for exposto publicamente, considerar adicionar uma API key.
- Fora de escopo por ora: listagem, edição e remoção de produtos (só a criação foi pedida).
