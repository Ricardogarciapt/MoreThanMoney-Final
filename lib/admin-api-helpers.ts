/**
 * Helpers para APIs admin (server-side)
 * Validação, segurança e utilitários
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/** Cliente service role (singleton + fallbacks em lib/supabase-admin-client.ts) */
export { getSupabaseAdmin } from "./supabase-admin-client"

/**
 * Verifica se o utilizador é admin (server-side)
 */
export async function verifyAdminAccess(): Promise<{
  isAdmin: boolean
  userId?: string
  email?: string
  error?: string
}> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser()

    if (userError || !authUser) {
      return {
        isAdmin: false,
        error: "Não autenticado",
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_type, is_active")
      .eq("id", authUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('❌ [ADMIN API] Erro ao verificar perfil:', profileError)
      return {
        isAdmin: false,
        error: 'Erro ao verificar permissões'
      }
    }

    const isAdmin = profile?.user_type === 'admin' && profile?.is_active === true

    return {
      isAdmin,
      userId: authUser.id,
      email: authUser.email ?? undefined,
    }
  } catch (error: any) {
    console.error('❌ [ADMIN API] Erro ao verificar acesso:', error)
    return {
      isAdmin: false,
      error: error.message || 'Erro desconhecido'
    }
  }
}

/**
 * Middleware para proteger rotas admin
 */
export async function requireAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  const auth = await verifyAdminAccess()
  
  if (!auth.isAdmin) {
    return NextResponse.json(
      { 
        error: auth.error || 'Acesso negado',
        message: 'Apenas administradores podem aceder a este recurso'
      },
      { status: 403 }
    )
  }

  return null // Acesso permitido
}

/**
 * Validação de dados comum
 */
export function validateRequiredFields(
  body: any,
  requiredFields: string[]
): { valid: boolean; error?: string; missing?: string[] } {
  const missing = requiredFields.filter(field => !body[field])
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Campos obrigatórios em falta: ${missing.join(', ')}`,
      missing
    }
  }

  return { valid: true }
}

/**
 * Sanitiza string para prevenir SQL injection (básico)
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return ''
  return input.trim().replace(/[<>]/g, '')
}

/**
 * Valida email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Valida UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Rate limiting simples (em memória - para produção usar Redis)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minuto
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs
    })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs
    }
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt
    }
  }

  record.count++
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt
  }
}

