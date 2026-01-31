import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { loginIqonic } from "@/lib/iqonic-auth"

/**
 * API Route para login via IQONIC.VIP
 * Cria/atualiza perfil no Supabase e retorna sessão
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, isEducator } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email e senha são obrigatórios" },
        { status: 400 }
      )
    }

    // 1. Autenticar com API IQONIC e preparar dados em paralelo
    const supabase = getSupabaseAdmin()
    const crypto = await import('crypto')
    
    // Fazer autenticação IQONIC e verificação de perfil em paralelo
    const [iqonicResult, existingProfileResult] = await Promise.all([
      loginIqonic(email, password, isEducator || false),
      supabase.from("profiles").select("*").eq("email", email).single()
    ])

    if (!iqonicResult.success || !iqonicResult.user || !iqonicResult.token) {
      return NextResponse.json(
        { success: false, error: iqonicResult.error || "Falha na autenticação IQONIC" },
        { status: 401 }
      )
    }

    const iqonicUser = iqonicResult.user
    const userType = isEducator ? "educator" : "student"
    const { data: existingProfile } = existingProfileResult
    
    // 2. Mapear role: educator → VIP, student → Member
    const supabaseRole = isEducator ? "vip" : "member"
    
    // 3. Gerar UUID determinístico baseado no email para manter consistência
    // Formato UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const hash = crypto.createHash('sha256').update(`iqonic_${email}`).digest('hex')
    const userId = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
      hash.substring(20, 32)
    ].join('-')

    // Garantir que temos email válido (pode ser distid para estudantes)
    const userEmail = iqonicUser.email || email
    const userName = iqonicUser.name || iqonicUser.firstName || userEmail.split("@")[0]
    const userUsername = iqonicUser.distid || iqonicUser.userid || userEmail.split("@")[0]

    const profileData = {
      id: existingProfile?.id || userId,
      email: userEmail,
      full_name: userName,
      username: userUsername,
      user_type: supabaseRole,
      is_active: true,
      updated_at: new Date().toISOString(),
      // Campos adicionais para identificar como usuário IQONIC
      phone: iqonicUser.phone || null,
      avatar_url: iqonicUser.avatar_url || null,
    }

    // Inserir ou atualizar perfil
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData, {
        onConflict: existingProfile?.id ? "id" : "email",
      })
      .select()
      .single()

    if (profileError) {
      console.error("❌ [IQONIC LOGIN] Erro ao criar/atualizar perfil:", profileError)
      return NextResponse.json(
        { success: false, error: "Erro ao criar perfil no sistema" },
        { status: 500 }
      )
    }

    // 4. Retornar dados da sessão
    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        username: profile.username,
        user_type: profile.user_type,
        is_active: profile.is_active,
        avatar_url: profile.avatar_url,
      },
      iqonicUser: {
        id: iqonicUser.id || iqonicUser._id,
        email: iqonicUser.email || email,
        name: iqonicUser.name || iqonicUser.firstName,
        distid: iqonicUser.distid,
        role: userType,
      },
      token: iqonicResult.token,
      userType: userType,
      supabaseRole: supabaseRole,
    })
  } catch (error: any) {
    console.error("❌ [IQONIC LOGIN] Erro:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

