"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Definir as variáveis de ambiente que queremos disponibilizar no cliente
interface EnvVars {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  NEXT_PUBLIC_BASE_URL: string
  [key: string]: string
}

// Valores padrão hardcoded para fallback
const defaultEnvVars: EnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: "https://iwscxotvmtkphajmasof.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg",
  NEXT_PUBLIC_BASE_URL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
}

// Criar o contexto
const EnvContext = createContext<EnvVars>(defaultEnvVars)

// Hook para usar as variáveis de ambiente
export const useEnv = () => useContext(EnvContext)

// Provider para disponibilizar as variáveis de ambiente
export function EnvProvider({ children }: { children: ReactNode }) {
  const [envVars, setEnvVars] = useState<EnvVars>(defaultEnvVars)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Carregar variáveis de ambiente do localStorage se disponíveis
    const loadEnvVars = () => {
      const storedVars: Partial<EnvVars> = {}
      let hasStoredVars = false

      // Verificar cada variável no localStorage
      Object.keys(defaultEnvVars).forEach((key) => {
        const storedValue = localStorage.getItem(`env_${key}`)
        if (storedValue) {
          storedVars[key] = storedValue
          hasStoredVars = true
        }
      })

      // Se encontrou variáveis armazenadas, usar elas
      if (hasStoredVars) {
        setEnvVars((prev) => ({ ...prev, ...storedVars }))
      }

      // Verificar se as variáveis estão disponíveis no window
      if ((window as any).__ENV__) {
        setEnvVars((prev) => ({ ...prev, ...(window as any).__ENV__ }))
      }

      // Salvar as variáveis padrão no localStorage para uso futuro
      Object.entries(defaultEnvVars).forEach(([key, value]) => {
        if (!localStorage.getItem(`env_${key}`)) {
          localStorage.setItem(`env_${key}`, value)
        }
      })

      // Disponibilizar as variáveis no window para outros scripts
      if (!(window as any).__ENV__) {
        ;(window as any).__ENV__ = { ...defaultEnvVars, ...storedVars }
      }

      setIsLoaded(true)
    }

    loadEnvVars()
  }, [])

  // Só renderizar os filhos quando as variáveis estiverem carregadas
  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center">Carregando configurações...</div>
  }

  return <EnvContext.Provider value={envVars}>{children}</EnvContext.Provider>
}
