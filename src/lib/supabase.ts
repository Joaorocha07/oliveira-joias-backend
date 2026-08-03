import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Service role key: uso exclusivo no servidor, nunca exposta ao cliente.
// Ignora RLS — a validação de acesso acontece nas rotas do backend.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
