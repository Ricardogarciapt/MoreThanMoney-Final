import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { loginIqonic } from "@/lib/iqonic-auth"

/**
 * API Route para login via IQONIC.VIP
 * Cria/atualiza perfil no Supabase e retorna sessão
 */
export async function POST(request: NextRequest) {
  try {
    // Ler body apenas uma vez - Next.js permite apenas uma leitura
    let body: { email?: string; password?: string; isEducator?: boolean }
    
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error("❌ [IQONIC LOGIN] Erro ao fazer parse do body:", parseError.message || parseError)
      
      // Se o erro for sobre body já lido, retornar erro específico
      if (parseError.message?.includes("already been read") || 
          parseError.message?.includes("Body has already been read") ||
          parseError.message?.includes("unusable") ||
          parseError.message?.includes("body stream")) {
        return NextResponse.json(
          { success: false, error: "Erro ao processar requisição. Por favor, recarregue a página e tente novamente." },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: "Erro ao processar dados da requisição. Verifique se os dados foram enviados corretamente." },
        { status: 400 }
      )
    }

    const { email, password, isEducator } = body || {}

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email e senha são obrigatórios" },
        { status: 400 }
      )
    }

    // 1. Autenticar com API IQONIC (LMS) - VALIDAÇÃO PRIMÁRIA
    const supabase = getSupabaseAdmin()
    const crypto = await import('crypto')
    
    console.log('🔐 [IQONIC API] Validando login no LMS IQONIC...')
    
    // Primeiro validar login no LMS IQONIC
    const iqonicResult = await loginIqonic(email, password, isEducator || false)

    // VALIDAÇÃO CRÍTICA: Se o login no LMS falhou, NÃO autorizar
    if (!iqonicResult.success || !iqonicResult.user || !iqonicResult.token) {
      console.error('❌ [IQONIC API] Login no LMS IQONIC falhou:', iqonicResult.error)
      return NextResponse.json(
        { success: false, error: iqonicResult.error || "Credenciais inválidas no LMS IQONIC" },
        { status: 401 }
      )
    }
    
    console.log('✅ [IQONIC API] Login no LMS IQONIC validado:', iqonicResult.user.email)
    
    // Agora buscar perfil existente (se houver)
    const existingProfileResult = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single()

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

    // Inserir ou atualizar perfil (apenas se login LMS foi bem-sucedido)
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
        { success: false, error: "Erro ao autorizar perfil no sistema" },
        { status: 500 }
      )
    }
    
    // VALIDAÇÃO FINAL: Verificar que o perfil foi criado/atualizado corretamente
    if (!profile || !profile.is_active) {
      console.error("❌ [IQONIC LOGIN] Perfil criado mas inativo ou inválido")
      return NextResponse.json(
        { success: false, error: "Perfil não autorizado. Contacta o suporte." },
        { status: 403 }
      )
    }
    
    console.log('✅ [IQONIC API] Perfil autorizado no sistema:', profile.email)

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

