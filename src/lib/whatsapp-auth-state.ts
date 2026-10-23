import { AuthenticationCreds, AuthenticationState, BufferJSON, SignalDataTypeMap, initAuthCreds, proto } from 'baileys'
import { supabase } from './supabase'

// Versão em banco do useMultiFileAuthState do Baileys (que grava em arquivos e
// perde a sessão a cada deploy). Cada chave vira uma linha em whatsapp_auth,
// então a conexão sobrevive a reinícios sem ler o QR Code de novo.

const TABLE = 'whatsapp_auth'
const CREDS_KEY = 'creds'
const WRITE_BATCH_SIZE = 200

async function readValue(slot: number, key: string) {
  const { data, error } = await supabase.from(TABLE).select('value').eq('slot', slot).eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? JSON.parse(data.value, BufferJSON.reviver) : null
}

async function writeValue(slot: number, key: string, value: unknown) {
  const { error } = await supabase.from(TABLE).upsert({
    slot,
    key,
    value: JSON.stringify(value, BufferJSON.replacer),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function clearStoredSession(slot: number): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('slot', slot)
  if (error) throw new Error(error.message)
}

export async function listSlotsWithSession(): Promise<number[]> {
  const { data, error } = await supabase.from(TABLE).select('slot').eq('key', CREDS_KEY)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.slot as number)
}

export async function useDatabaseAuthState(slot: number): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const creds: AuthenticationCreds = (await readValue(slot, CREDS_KEY)) ?? initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {}
          if (ids.length === 0) return data
          const prefix = `${type}-`
          const { data: rows, error } = await supabase
            .from(TABLE)
            .select('key, value')
            .eq('slot', slot)
            .in('key', ids.map((id) => prefix + id))
          if (error) throw new Error(error.message)
          for (const row of rows ?? []) {
            let value = JSON.parse(row.value, BufferJSON.reviver)
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value)
            data[(row.key as string).slice(prefix.length)] = value
          }
          return data
        },
        // No pareamento o Baileys manda centenas de pre-keys de uma vez:
        // remoções num delete só e upserts em lotes.
        set: async (data) => {
          const upserts: { slot: number; key: string; value: string; updated_at: string }[] = []
          const deletes: string[] = []
          const now = new Date().toISOString()
          for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            for (const [id, value] of Object.entries(data[category] ?? {})) {
              const key = `${category}-${id}`
              if (value) upserts.push({ slot, key, value: JSON.stringify(value, BufferJSON.replacer), updated_at: now })
              else deletes.push(key)
            }
          }
          if (deletes.length) {
            const { error } = await supabase.from(TABLE).delete().eq('slot', slot).in('key', deletes)
            if (error) throw new Error(error.message)
          }
          for (let i = 0; i < upserts.length; i += WRITE_BATCH_SIZE) {
            const { error } = await supabase.from(TABLE).upsert(upserts.slice(i, i + WRITE_BATCH_SIZE))
            if (error) throw new Error(error.message)
          }
        },
      },
    },
    saveCreds: () => writeValue(slot, CREDS_KEY, creds),
  }
}
