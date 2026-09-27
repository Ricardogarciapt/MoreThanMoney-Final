import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { validateHubLogin } from "@/lib/primeverse-auth"
import { sendNewMemberWelcomeIfEligible } from "@/lib/new-member-welcome"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const admin = getSupabaseAdmin()

function randomPassword(): string {
  return `pv_${crypto.randomUUID()}${crypto.randomUUID()}`
}

/**
 * POST /api/auth/primeverse-login  { username, password }
 * Valida contra o hub PrimeVerse. Em sucesso, provisiona (ou reencontra) a conta MTM
 * como MEMBER VIA PRIMEVERSE (broker OK, app grátis, sem upsell) e inicia sessão MTM.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || "").trim()
    const password = String(body.password || "")
    if (!username || !password) {
      return NextResponse.json({ error: "Indica o utilizador e a password PrimeVerse." }, { status: 400 })
    }

    const hubUser = await validateHubLogin(username, password)
    if (!hubUser) {
      return NextResponse.json({ error: "Credenciais PrimeVerse inválidas." }, { status: 401 })
    }

    const email = (hubUser.email || "").toLowerCase()
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A tua conta PrimeVerse não tem um email associado. Contacta o suporte." },
        { status: 422 },
      )
    }

    // Perfil MTM já existe?
    const { data: existing } = await admin
      .from("profiles")
      .select("id, member_category, login_provider")
      .eq("email", email)
      .maybeSingle()

    let userId = existing?.id as string | undefined
    let isNew = false

    if (!userId) {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { full_name: hubUser.name || "", login_provider: "primeverse" },
      })
      if (cErr || !created?.user) {
        // Corrida: pode ter sido criado entretanto
        // Anotado: sem tipo, a linha vem como `any`, e atribuir `any` a `userId`
        // repoe-lhe o tipo declarado (string | undefined) — o TS deixava de saber
        // que, depois deste bloco, o userId esta sempre preenchido.
        const { data: again }: { data: { id: string } | null } =
          await admin.from("profiles").select("id").eq("email", email).maybeSingle()
        if (!again?.id) return NextResponse.json({ error: cErr?.message || "Erro ao criar conta." }, { status: 500 })
        userId = again.id
      } else {
        userId = created.user.id
        isNew = true
      }
    }

    // Provisiona/atualiza o perfil.
    const patch: Record<string, unknown> = {
      id: userId,
      email,
      broker_verified: true, // cliente PrimeVerse + PU Prime → requisito broker cumprido
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (hubUser.name) patch.full_name = hubUser.name
    if (isNew) {
      // Member via PrimeVerse: acesso Member + app grátis, SEM opção de upgrade.
      patch.login_provider = "primeverse"
      patch.user_type = "member"
      patch.member_category = "standard"
      patch.subscription_plan = "app_member"
      patch.subscription_status = "active"
      patch.subscription_platform = "primeverse"
    } else if (!existing?.login_provider) {
      patch.login_provider = "primeverse" // marca origem sem mexer num tier pago existente
    }

    const { error: pErr } = await admin.from("profiles").upsert(patch, { onConflict: "id" })
    if (pErr) return NextResponse.json({ error: "Erro ao preparar o perfil: " + pErr.message }, { status: 500 })

    if (isNew) {
      try {
        await sendNewMemberWelcomeIfEligible({ userId, source: 'primeverse', notifyTeam: true })
      } catch {
        /* best-effort */
      }
    }

    // Sessão MTM (Supabase) sem expor password: magiclink → verifyOtp (define cookies).
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email })
    const tokenHash = (link as any)?.properties?.hashed_token
    if (lErr || !tokenHash) return NextResponse.json({ error: "Falha a iniciar sessão." }, { status: 500 })

    const cookieStore = await cookies()
    const server = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(list) {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )
    const { error: vErr } = await server.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash })
    if (vErr) return NextResponse.json({ error: "Falha a validar a sessão: " + vErr.message }, { status: 500 })

    return NextResponse.json({ success: true, isNew, redirect: "/member-area" })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 })
  }
}
