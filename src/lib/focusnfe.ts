import { env } from './env'

// Basic Auth: token da empresa como usuário, senha vazia (ver doc.focusnfe.com.br/reference/autenticacao).
function authHeader(): string {
  if (!env.focusNfeToken) {
    throw new Error(
      'FOCUS_NFE_TOKEN não configurado — cadastre a empresa no painel da Focus NFe e preencha o .env',
    )
  }
  return `Basic ${Buffer.from(`${env.focusNfeToken}:`).toString('base64')}`
}

type FocusNfeResult<T> = { status: number; body: T }

export async function focusNfeRequest<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<FocusNfeResult<T>> {
  const res = await fetch(`${env.focusNfeBaseUrl}/v2${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = (await res.json().catch(() => ({}))) as T
  return { status: res.status, body: json }
}

// Alguns campos de resposta (ex: caminho_danfe) vêm como path relativo ao ambiente —
// esta função monta a URL absoluta antes de salvar no banco.
export function focusNfeUrl(path: string): string {
  return `${env.focusNfeBaseUrl}${path}`
}
