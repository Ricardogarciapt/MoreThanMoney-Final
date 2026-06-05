import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, getSupabaseAnonServerClient } from "@/lib/supabase-admin-client"
import { loginIqonic } from "@/lib/iqonic-auth"

/**
 * POST /api/auth/iqonic-login
 *
 * 1. Valida credenciais via shield.iqonic.life
 * 2. Cria/garante utilizador no Supabase Auth
 * 3. Gera magic-link → troca por sessão real (access_token + refresh_token)
 * 4. Retorna sessão ao cliente para setSession()
 */
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string; isEducator?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "Erro ao processar dados da requisição." },
        { status: 400 }
      )
    }

    const { email, password, isEducator = false } = body || {}

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email e password são obrigatórios" },
        { status: 400 }
      )
    }

    // ── 1. Validar com API IQONIC ──────────────────────────────────────────
    console.log("🔐 [IQONIC LOGIN] Validando credenciais no LMS IQONIC...")
    const iqonicResult = await loginIqonic(email, password, isEducator)

    if (!iqonicResult.success || !iqonicResult.user) {
      console.error("❌ [IQONIC LOGIN] Falha:", iqonicResult.error)
      return NextResponse.json(
        { success: false, error: iqonicResult.error || "Credenciais inválidas no LMS IQONIC" },
        { status: 401 }
      )
    }

    console.log("✅ [IQONIC LOGIN] IQONIC validado para:", email)

    const supabase = getSupabaseAdmin()
    const iqonicUser = iqonicResult.user
    const userEmail = iqonicUser.email || email
    const userName = iqonicUser.name || iqonicUser.firstName || userEmail.split("@")[0]
    const userUsername = iqonicUser.distid || iqonicUser.userid || userEmail.split("@")[0]
    const supabaseRole = isEducator ? "vip" : "member"

    // ── 2. Criar/obter utilizador no Supabase Auth ─────────────────────────
    let authUserId: string | null = null

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      user_metadata: { full_name: userName, user_type: supabaseRole, iqonic_user: true },
    })

    if (!createError) {
      authUserId = createData.user.id
      console.log("✅ [IQONIC LOGIN] Novo utilizador Supabase Auth criado:", authUserId)
    } else {
      // User already exists — find them
      console.log("ℹ️ [IQONIC LOGIN] Utilizador já existe no Auth, a procurar ID...")
      const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existingUser = usersData?.users?.find(
        (u: any) => u.email?.toLowerCase() === userEmail.toLowerCase()
      )
      if (existingUser) {
        authUserId = existingUser.id
        console.log("✅ [IQONIC LOGIN] Utilizador Supabase Auth encontrado:", authUserId)
      }
    }

    // ── 3. Gerar magic link ────────────────────────────────────────────────
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("❌ [IQONIC LOGIN] Falha ao gerar magic link:", linkError)
      return NextResponse.json(
        { success: false, error: "Erro ao criar sessão. Tenta novamente." },
        { status: 500 }
      )
    }

    // ── 4. Trocar token por sessão real ────────────────────────────────────
    const anonClient = getSupabaseAnonServerClient()
    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    })

    if (verifyError || !verifyData?.session) {
      console.error("❌ [IQONIC LOGIN] Falha ao verificar OTP:", verifyError)
      return NextResponse.json(
        { success: false, error: "Erro ao autenticar sessão. Tenta novamente." },
        { status: 500 }
      )
    }

    const verifiedUserId = verifyData.user?.id || authUserId
    console.log("✅ [IQONIC LOGIN] Sessão criada para auth ID:", verifiedUserId)

    // ── 5. Garantir perfil correto na tabela profiles ──────────────────────
    // Se existe perfil com email mas ID diferente, remover antes de inserir
    if (verifiedUserId) {
      const { data: existingByEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", userEmail)
        .maybeSingle()

      if (existingByEmail && existingByEmail.id !== verifiedUserId) {
        await supabase.from("profiles").delete().eq("id", existingByEmail.id)
        console.log("🔄 [IQONIC LOGIN] Perfil antigo removido, ID:", existingByEmail.id)
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: verifiedUserId,
          email: userEmail,
          full_name: userName,
          username: userUsername,
          user_type: supabaseRole,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select()
      .single()

    if (profileError) {
      console.error("❌ [IQONIC LOGIN] Erro ao guardar perfil:", profileError)
      // Don't fail — session is valid, profile can be re-synced
    }

    console.log("✅ [IQONIC LOGIN] Login completo para:", userEmail)

    // ── 6. Retornar sessão ao cliente ──────────────────────────────────────
    return NextResponse.json({
      success: true,
      session: {
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        expires_in: verifyData.session.expires_in,
        token_type: verifyData.session.token_type,
        user: verifyData.session.user,
      },
      user: {
        id: profile?.id || verifiedUserId,
        email: userEmail,
        full_name: userName,
        username: userUsername,
        user_type: supabaseRole,
        is_active: true,
      },
      iqonicUser: {
        id: iqonicUser.id || iqonicUser._id,
        email: iqonicUser.email || email,
        name: iqonicUser.name || iqonicUser.firstName,
        distid: iqonicUser.distid,
        role: isEducator ? "educator" : "student",
      },
      userType: isEducator ? "educator" : "student",
      supabaseRole,
    })
  } catch (error: any) {
    console.error("❌ [IQONIC LOGIN] Erro interno:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
