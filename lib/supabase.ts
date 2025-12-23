import { createClient, SupabaseClient } from "@supabase/supabase-js"

// URLs e chaves do Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY0MjM2MywiZXhwIjoyMDY1MjE4MzYzfQ.OSFUPZLlx4IaETqqfQPnt-pnYG-hau5NOJ_GHonpuOk"

// Singleton: criar apenas UMA instância do cliente Supabase
let supabaseInstance: SupabaseClient | null = null

// Cliente público do Supabase (para uso no frontend)
export const supabase = (() => {
  if (!supabaseInstance) {
    if (typeof window !== 'undefined') {
      console.log('🔧 Criando instância SINGLETON do Supabase Client')
    }
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' 
          ? {
              getItem: (key: string) => {
                // Tentar localStorage primeiro
                try {
                  return window.localStorage.getItem(key)
                } catch {
                  // Se localStorage falhar, retornar null
                  return null
                }
              },
              setItem: (key: string, value: string) => {
                try {
                  window.localStorage.setItem(key, value)
                } catch {
                  // Silenciosamente ignorar se localStorage não disponível
                }
              },
              removeItem: (key: string) => {
                try {
                  window.localStorage.removeItem(key)
                } catch {
                  // Silenciosamente ignorar se localStorage não disponível
                }
              },
            }
          : undefined,
        flowType: 'pkce',
      },
    })
  }
  return supabaseInstance
})()

// Cliente com service role (APENAS para uso no servidor/API routes)
// Só é criado no servidor para evitar múltiplas instâncias GoTrueClient
let supabaseAdminInstance: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  // No cliente, retornar o mesmo que supabase
  if (typeof window !== 'undefined') {
    return supabase
  }
  
  // No servidor, criar instância admin
  if (!supabaseAdminInstance) {
    console.log('🔧 Criando instância SINGLETON do Supabase Admin (servidor)')
    supabaseAdminInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return supabaseAdminInstance
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

export interface TradingIdea {
  id: string
  title: string
  description: string
  symbol: string
  direction: "buy" | "sell"
  entry_price: number
  stop_loss?: number
  take_profit?: number
  status: "active" | "closed" | "cancelled"
  created_by: string
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

// Funções para trading ideas
export const tradingIdeasService = {
  getIdeas: async () => {
    const { data, error } = await supabase.from("trading_ideas").select("*").order("created_at", { ascending: false })
    return { data, error }
  },

  createIdea: async (idea: Omit<TradingIdea, "id" | "created_at" | "updated_at">) => {
    const { data, error } = await supabase.from("trading_ideas").insert(idea).select()
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
