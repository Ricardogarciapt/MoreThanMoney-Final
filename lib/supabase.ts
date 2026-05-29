import { SupabaseClient } from "@supabase/supabase-js"
import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseAdmin as getServiceRoleClient } from "./supabase-admin-client"

// URLs e chaves do Supabase (trim para evitar newline no env que quebra Realtime/WebSocket)
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co").trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg").trim()

// Singleton: criar apenas UMA instância do cliente Supabase
let supabaseInstance: SupabaseClient | null = null

// Cliente público do Supabase (para uso no frontend)
// Usa createBrowserClient do @supabase/ssr para PKCE correto com Next.js
// O createBrowserClient gerencia automaticamente os cookies para o code verifier
export const supabase = (() => {
  if (typeof window === 'undefined') {
    // No servidor, retornar null (não deve ser usado)
    return null as any
  }
  
  if (!supabaseInstance) {
    console.log('🔧 Criando instância SINGLETON do Supabase Client (Browser)')
    // Usar createBrowserClient do @supabase/ssr para PKCE correto
    // O createBrowserClient gerencia automaticamente os cookies para o code verifier
    // Não precisa de configuração explícita de cookies - já faz isso automaticamente
    supabaseInstance = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseInstance
})()

export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    return supabase
  }
  return getServiceRoleClient()
}

// Export para compatibilidade (só cria no servidor)
export const supabaseAdmin = typeof window === 'undefined' 
  ? getSupabaseAdmin()
  : supabase

// Tipos para as tabelas do Supabase
export interface User {
  id: string
  email: string
  name: string
  role: "user" | "admin" | "member"
  membership_type?: string
  created_at: string
  updated_at: string
}

export interface Portfolio {
  id: string
  name: string
  description: string
  performance: number
  risk_level: "low" | "medium" | "high"
  created_at: string
  updated_at: string
}

// Funções utilitárias para autenticação
export const auth = {
  signUp: async (email: string, password: string, userData?: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    })
    return { data, error }
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  getCurrentUser: async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    return { user, error }
  },
}

// Funções para gerenciar usuários (admin)
export const userService = {
  getUsers: async () => {
    const { data, error } = await supabaseAdmin.from("users").select("*").order("created_at", { ascending: false })
    return { data, error }
  },

  updateUserRole: async (userId: string, role: string) => {
    const { data, error } = await supabaseAdmin.from("users").update({ role }).eq("id", userId)
    return { data, error }
  },
}

// Funções para portfólios
export const portfolioService = {
  getPortfolios: async () => {
    const { data, error } = await supabase.from("portfolios").select("*").order("created_at", { ascending: false })
    return { data, error }
  },
}

// Função para obter o cliente Supabase do servidor
export function createServerClient() {
  return supabaseAdmin
}
