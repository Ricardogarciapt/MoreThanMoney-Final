"use client"

import { supabase } from "@/lib/supabase"

/**
 * Acesso ao access_token SEM passar pelo lock do `navigator.locks` em cada chamada.
 *
 * Cada `supabase.auth.getSession()` adquire um Web Lock exclusivo; no Safari (Web Locks
 * + ITP) isto é lento e serializa todas as chamadas de auth. Como dezenas de componentes
 * pedem o token a cada fetch (e alguns em polling), isso empilha e torna a app lenta.
 *
 * Este helper mantém o token em memória e subscreve `onAuthStateChange` UMA vez para o
 * atualizar nos eventos de refresh/login/logout. Só vai ao `getSession()` (lock) quando
 * não há token em cache ou está a <60s de expirar. NÃO altera a lógica de refresh do
 * Supabase — apenas lê o token atual de forma barata.
 */

let cachedToken: string | null = null
let cachedExp = 0 // epoch em segundos
let cachedUserId: string | null = null
let subscribed = false

function decodePayload(token: string): { exp?: number; sub?: string } {
  try {
    return JSON.parse(atob(token.split(".")[1] ?? "")) ?? {}
  } catch {
    return {}
  }
}

function setFromSession(token: string | null | undefined) {
  cachedToken = token ?? null
  if (cachedToken) {
    const payload = decodePayload(cachedToken)
    cachedExp = typeof payload.exp === "number" ? payload.exp : 0
    cachedUserId = typeof payload.sub === "string" ? payload.sub : null
  } else {
    cachedExp = 0
    cachedUserId = null
  }
}

function ensureSubscription() {
  if (subscribed || !supabase?.auth) return
  subscribed = true
  supabase.auth.onAuthStateChange((_event: unknown, session: { access_token?: string } | null) => {
    setFromSession(session?.access_token)
  })
}

/** Token atual (refresca via getSession só quando necessário). */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase?.auth) return null
  ensureSubscription()

  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedExp - now > 60) return cachedToken

  const {
    data: { session },
  } = await supabase.auth.getSession()
  setFromSession(session?.access_token)
  return cachedToken
}

/** User id atual (sub do JWT), lido do token em cache — sem lock e sempre coerente. */
export async function getCurrentUserId(): Promise<string | null> {
  await getAccessToken() // garante token/cache atualizados
  return cachedUserId
}

/** Cabeçalhos de autorização prontos (vazio se não houver sessão). */
export async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
