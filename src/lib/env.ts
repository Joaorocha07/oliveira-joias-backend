import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}

function focusNfeAmbiente(): 'homologacao' | 'producao' {
  const value = process.env.FOCUS_NFE_AMBIENTE ?? 'homologacao'
  if (value !== 'homologacao' && value !== 'producao') {
    throw new Error('FOCUS_NFE_AMBIENTE deve ser "homologacao" ou "producao"')
  }
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  r2AccountId: required('R2_ACCOUNT_ID'),
  r2AccessKeyId: required('R2_ACCESS_KEY_ID'),
  r2SecretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  r2BucketName: required('R2_BUCKET_NAME'),
  r2PublicUrl: required('R2_PUBLIC_URL').replace(/\/$/, ''),
  // Opcional na inicialização (não derruba o servidor inteiro se ainda não configurado) —
  // validado só na hora de emitir/consultar uma nota, em src/lib/focusnfe.ts.
  focusNfeToken: process.env.FOCUS_NFE_TOKEN,
  focusNfeAmbiente: focusNfeAmbiente(),
  // Segredo compartilhado com o frontend (header x-whatsapp-secret). Opcional.
  whatsappSecret: process.env.WHATSAPP_SECRET,
  focusNfeBaseUrl:
    focusNfeAmbiente() === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br',
}
