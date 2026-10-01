/**
 * O LOGIN DO ESTÚDIO — uma caixa de entrada, duas passwords aceitáveis.
 *
 * ═══ PORQUÊ DUAS ═══════════════════════════════════════════════════════════════════════════
 *
 * O estúdio nasceu com password própria (`lms_educators.password_hash`, bcrypt), separada do
 * Supabase Auth do site. Para um educador que também é membro — a Mafalda é — isso eram duas
 * passwords para a mesma pessoa, e a segunda é a que se esquece.
 *
 * Por isso, quando a password própria não serve (não existe, ou não corresponde), tenta-se a
 * PASSWORD DO SITE: a conta de site ligada ao educador por `profile_id`. Não se copia hash nenhum
 * entre os dois sistemas — copiar o hash era mais rápido e deixava um laço invisível: no dia em
 * que ela mudasse a password do site, o estúdio ficava com a antiga e ninguém sabia porquê.
 *
 * A pessoa continua a ver UMA caixa de email e password. Escreve a que tem.
 *
 * ═══ O QUE NÃO PODE ACONTECER ══════════════════════════════════════════════════════════════
 *
 * Aceitar credenciais do site válidas... de outra pessoa. É por isso que nunca se autentica o
 * email que foi escrito no formulário: autentica-se o email da conta que o `profile_id` do
 * educador aponta, e `podeEntrarPelaContaDoSite` confirma depois que a sessão obtida é mesmo
 * dessa conta. Quem não tem `profile_id` não tem esta porta — fica só com a password própria.
 * As decisões estão em `lib/lms-educator-entrada.ts`, com guarda em `*.check.ts`.
 */
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, signEducatorToken } from "@/lib/lms-educator-auth"
import { pareceHashUtilizavel, podeEntrarPelaContaDoSite } from "@/lib/lms-educator-entrada"

const supabase = getSupabaseAdmin()

/** A password própria do estúdio. Um hash que não é bcrypt não corresponde a password nenhuma. */
async function passwordDoEstudio(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!pareceHashUtilizavel(hash)) return false
  try {
    return await bcrypt.compare(password, String(hash))
  } catch {
    return false
  }
}

/**
 * A password DO SITE da conta ligada a este educador.
 *
 * O email vem do `profile_id`, nunca do formulário: é isso que impede alguém de entrar no estúdio
 * de outra pessoa com credenciais de site que são verdadeiras mas suas.
 */
async function passwordDoSite(profileId: string | null | undefined, password: string): Promise<string | null> {
  const perfil = String(profileId ?? "").trim()
  if (!perfil) return null

  const { data } = await supabase.auth.admin.getUserById(perfil)
  const email = data?.user?.email
  if (!email) return null
  // Sem identidade de email não há password para comparar (conta só de OAuth, por exemplo).
  if (!(data?.user?.identities ?? []).some((i) => i.provider === "email")) return null

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
  if (!url || !anon) return null

  const cliente = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: sessao } = await cliente.auth.signInWithPassword({ email, password })
  const id = sessao?.user?.id ?? null
  // A sessão fecha-se logo: serviu só para provar a password, não para o estúdio a usar.
  await cliente.auth.signOut().catch(() => {})
  return id
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json({ error: "Email e password são obrigatórios" }, { status: 400 })
    }

    const { data: educator, error } = await supabase
      .from("lms_educators")
      .select("id, email, display_name, password_hash, is_active, profile_id")
      .eq("email", email)
      .maybeSingle()

    if (error || !educator) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }
    if (!educator.is_active) {
      return NextResponse.json({ error: "Educador inativo" }, { status: 403 })
    }

    let porta: "estudio" | "site" | null = null

    if (await passwordDoEstudio(educator.password_hash, password)) {
      porta = "estudio"
    } else {
      const utilizador = await passwordDoSite(educator.profile_id, password)
      const veredicto = podeEntrarPelaContaDoSite(educator, utilizador)
      if (veredicto.pode) porta = "site"
      else if (utilizador) console.warn(`[estudio/login] recusado: ${veredicto.porque}`)
    }

    if (!porta) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }

    const token = signEducatorToken({
      educatorId: educator.id,
      email: educator.email,
      displayName: educator.display_name,
    })

    const response = NextResponse.json({
      success: true,
      // Qual das portas abriu: serve para o ecrã poder dizer «entraste com a conta do site».
      porta,
      educator: {
        id: educator.id,
        email: educator.email,
        display_name: educator.display_name,
      },
    })

    response.cookies.set(getEducatorCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
