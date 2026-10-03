/**
 * Cliente Supabase com service role — um único sítio para fallbacks (build sem .env completo).
 * Em produção: define NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const ADMIN_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co").trim()
// SEM valor de recurso: a chave de service role dá acesso total à base. Escrita no código, ia
// para o git e para qualquer bundle que um dia importasse este ficheiro por engano. Sem a
// variável de ambiente, falha-se alto — um erro claro é melhor do que uma chave exposta.
const ADMIN_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()

const ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"
).trim()

let singleton: SupabaseClient | null = null
let anonSingleton: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!singleton) {
    singleton = createClient(ADMIN_URL, ADMIN_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return singleton
}

/** Cliente anon no servidor (fallback igual ao browser) — RLS aplicável */
export function getSupabaseAnonServerClient(): SupabaseClient {
  if (!anonSingleton) {
    anonSingleton = createClient(ADMIN_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return anonSingleton
}
