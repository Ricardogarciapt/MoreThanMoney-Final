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

/**
 * Teto de tempo por pedido à Supabase (10/11/2026).
 *
 * Quando a base encrava (6/11 e 10/11, Disk IO esgotado), cada pedido fica pendurado até a
 * Vercel matar a função aos 60/300 s: ~3.000 «Task timed out» num dia, todos a cobrar memória e
 * CPU enquanto esperam. Com o teto, o pedido falha em segundos com um erro normal — o código já
 * trata `{ error }` — e a função termina. Storage (uploads de vídeo) tem teto mais largo.
 * Ajustável por SUPABASE_FETCH_TIMEOUT_MS / SUPABASE_STORAGE_TIMEOUT_MS.
 */
const REST_TIMEOUT_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS) || 25_000
const STORAGE_TIMEOUT_MS = Number(process.env.SUPABASE_STORAGE_TIMEOUT_MS) || 120_000

export const fetchComTeto: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const teto = AbortSignal.timeout(url.includes("/storage/v1/") ? STORAGE_TIMEOUT_MS : REST_TIMEOUT_MS)
  // AbortSignal.any só existe no Node ≥ 20.3; sem ele respeita-se o sinal de quem chama.
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  const signal = init?.signal ? (anyFn ? anyFn([init.signal, teto]) : init.signal) : teto
  return fetch(input, { ...init, signal })
}

let singleton: SupabaseClient | null = null
let anonSingleton: SupabaseClient | null = null

/**
 * Sem chave, devolve um cliente que só falha QUANDO É USADO.
 *
 * Há perto de 150 rotas que chamam isto ao nível do módulo, e o `next build` importa-as todas para
 * recolher dados de página. Com o `createClient` a rebentar logo à importação, um ambiente sem a
 * chave (as previews da Vercel) não chegava sequer a compilar — por causa de uma rota que nunca ia
 * ser chamada. Assim o build passa e o erro aparece no pedido, com a mesma mensagem clara.
 */
function clienteSemChave(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada neste ambiente")
    },
  })
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!ADMIN_SERVICE_KEY) return clienteSemChave()
  if (!singleton) {
    singleton = createClient(ADMIN_URL, ADMIN_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchComTeto },
    })
  }
  return singleton
}

/** Cliente anon no servidor (fallback igual ao browser) — RLS aplicável */
export function getSupabaseAnonServerClient(): SupabaseClient {
  if (!anonSingleton) {
    anonSingleton = createClient(ADMIN_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchComTeto },
    })
  }
  return anonSingleton
}
