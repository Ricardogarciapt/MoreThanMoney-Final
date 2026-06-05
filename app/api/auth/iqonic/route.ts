import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { loginIqonic } from "@/lib/iqonic-auth"

const IQONIC_WEBHOOK = "ite5r9Qtin82q"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e password são obrigatórios" },
        { status: 400 }
      )
    }

    // 1. Validar credenciais no IQONIC
    const iqonicResult = await loginIqonic(email, password, false)

    if (!iqonicResult.success || !iqonicResult.user) {
      // Tentar também com shield.iqonic.life como fallback
      try {
        const shieldUrl = `https://shield.iqonic.life/outerinfo.dhtml?webhook=${IQONIC_WEBHOOK}&action=verifylogin&distid=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        const shieldRes = await fetch(shieldUrl, { signal: AbortSignal.timeout(5000) })
        const shieldData = await shieldRes.json()

        if (Array.isArray(shieldData) && !shieldData[0]?.error) {
          const shieldUser = shieldData[0] || {}
          return await createOrSignInSupabaseUser(email, shieldUser)
        }
      } catch (shieldErr) {
        console.error("IQONIC Shield fallback falhou:", shieldErr)
      }

      return NextResponse.json(
        { error: iqonicResult.error || "Credenciais IQONIC inválidas. Verifica o teu email e password." },
        { status: 401 }
      )
    }

    return await createOrSignInSupabaseUser(email, iqonicResult.user)
  } catch (error) {
    console.error("IQONIC AUTH Erro:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

async function createOrSignInSupabaseUser(email, iqonicUser) {
  const supabaseAdmin = getSupabaseAdmin()
  const deterministicPassword = `iqonic_${email}_${IQONIC_WEBHOOK}`

  const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: deterministicPassword,
  })

  if (signInData?.session) {
    console.log("IQONIC AUTH Login Supabase OK:", email)
    return NextResponse.json({ session: signInData.session, iqonic: iqonicUser })
  }

  console.log("IQONIC AUTH Criar utilizador Supabase:", email)
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: deterministicPassword,
    email_confirm: true,
    user_metadata: {
      full_name: iqonicUser.name || iqonicUser.firstName || email.split("@")[0],
      iqonic_id: iqonicUser.distid || iqonicUser.userid || iqonicUser.id || null,
      auth_provider: "iqonic",
    },
  })

  if (createError) {
    console.error("IQONIC AUTH Erro ao criar utilizador:", createError)
    return NextResponse.json(
      { error: "Erro ao criar conta. Tenta novamente." },
      { status: 500 }
    )
  }

  const { data: newSignIn, error: newSignInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: deterministicPassword,
  })

  if (newSignInError || !newSignIn?.session) {
    return NextResponse.json(
      { error: "Erro de autenticação após criação. Tenta novamente." },
      { status: 500 }
    )
  }

  console.log("IQONIC AUTH Utilizador criado e autenticado:", email)
  return NextResponse.json({ session: newSignIn.session, iqonic: iqonicUser })
}
