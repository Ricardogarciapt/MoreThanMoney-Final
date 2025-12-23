import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Função para obter o cliente Supabase do servidor
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Função para obter a URL do Supabase
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url) {
    return url
  }
  // Fallback para a URL correta
  return "https://iwscxotvmtkphajmasof.supabase.co"
}

// Função para obter a chave anônima do Supabase
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (key) {
    return key
  }
  // Fallback para a chave correta
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"
}

// Função para obter a chave de serviço do Supabase
export function getSupabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) {
    return key
  }
  // Fallback para a chave de serviço correta
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY0MjM2MywiZXhwIjoyMDY1MjE4MzYzfQ.example"
}

// Função para obter variáveis de ambiente com fallback
function getEnvVar(key: string, fallback?: string): string {
  const isClient = typeof window !== "undefined"

  // Primeiro, tentar obter da variável de ambiente
  if (process.env[key]) {
    return process.env[key]!
  }

  // Se tiver fallback, usar ele
  if (fallback) {
    return fallback
  }

  // Se chegou aqui e estamos no cliente, tentar usar variáveis públicas hardcoded
  if (isClient) {
    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      return "https://iwscxotvmtkphajmasof.supabase.co"
    }
    if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
      return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"
    }
  }

  console.error(`Variável de ambiente ${key} não encontrada`)
  throw new Error(`Environment variable ${key} is not set`)
}

// Criar cliente Supabase com tratamento de erro
function createSupabaseClient() {
  try {
    // Obter URLs e chaves
    const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL")
    const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    // Verificar se as variáveis são válidas
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase URL or Anon Key is missing")
    }

    // Criar e retornar o cliente
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    console.error("Erro ao criar cliente Supabase:", error)

    // Fallback para valores hardcoded em caso de erro
    const fallbackUrl = "https://iwscxotvmtkphajmasof.supabase.co"
    const fallbackKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"

    return createClient(fallbackUrl, fallbackKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
}

export interface User {
  id: string
  email: string
  username?: string
  full_name?: string
  phone?: string
  whatsapp?: string
  social_media?: string
  jifu_id?: string
  jifu_affiliate_link?: string
  birth_date?: string
  avatar_url?: string
  user_type: "member" | "affiliate" | "admin" | "trial" | "guest" | "presentation"
  membership_level?: "basic" | "premium" | "vip"
  package?: "basic" | "education" | "automation"
  affiliate_code?: string
  is_active: boolean
  trial_expires_at?: string
  trial_expired?: boolean
  created_at?: string
  updated_at?: string
}

export class AuthService {
  // Login com email/username e senha
  async signIn(emailOrUsername: string, password: string) {
    try {
      if (!emailOrUsername || !password) {
        return {
          success: false,
          error: "Email/Username e senha são obrigatórios",
        }
      }

      // Primeiro tenta login com email
      let authResult = await supabase.auth.signInWithPassword({
        email: emailOrUsername,
        password,
      })

      // Se falhar e não for um email válido, busca o email pelo username
      if (authResult.error && !emailOrUsername.includes("@")) {
        try {
          // Buscar email pelo username usando uma query mais simples
          const { data: userData } = await supabase.rpc("get_user_email_by_username", {
            username_param: emailOrUsername,
          })

          if (userData) {
            // Tenta login com o email encontrado
            authResult = await supabase.auth.signInWithPassword({
              email: userData,
              password,
            })
          }
        } catch (usernameError) {
          console.error("Erro ao buscar por username:", usernameError)
        }
      }

      if (authResult.error) throw authResult.error

      // Buscar dados completos do usuário
      const userData = await this.getUserProfile(authResult.data.user.id)

      return {
        success: true,
        user: userData,
        session: authResult.data.session,
      }
    } catch (error: any) {
      console.error("Erro no login:", error)
      return {
        success: false,
        error: error.message || "Erro ao fazer login",
      }
    }
  }

  // Login com Google - usando PKCE flow
  async signInWithGoogle(redirectTo?: string) {
    try {
      // Construir URL de callback com redirect preservado
      const baseCallback = `${window.location.origin}/auth/callback`
      const callbackUrl = redirectTo 
        ? `${baseCallback}?redirect=${encodeURIComponent(redirectTo)}`
        : baseCallback
      
      console.log('🔍 Iniciando login com Google (PKCE flow)')
      console.log('Callback URL:', callbackUrl)
      console.log('Redirect final:', redirectTo || 'scanner-access')
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account', // Sempre mostrar seleção de conta
          },
          skipBrowserRedirect: false,
        },
      })

      if (error) {
        console.error('❌ Erro ao iniciar OAuth:', error)
        throw error
      }

      console.log('✅ OAuth iniciado')
      console.log('URL Google:', data.url?.substring(0, 80) + '...')

      return {
        success: true,
        url: data.url,
      }
    } catch (error: any) {
      console.error("Erro no login com Google:", error)
      return {
        success: false,
        error: error.message || "Erro ao fazer login com Google",
      }
    }
  }

  // Processar callback do OAuth (Google)
  async handleOAuthCallback() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error) throw error
      if (!user) throw new Error("Nenhum utilizador encontrado após login")

      // Verificar se já existe perfil
      const existingProfile = await this.getUserProfile(user.id)

      // Se não existe perfil, criar um
      if (!existingProfile || !existingProfile.email) {
        console.log("🔍 Criando perfil para utilizador OAuth:", user.id)
        
        const username = user.email?.split('@')[0] || `user_${Math.floor(Math.random() * 10000)}`
        
        await this.createUserProfile(user.id, {
          email: user.email!,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'Utilizador',
          username: username,
          user_type: 'member',
          is_active: true,
          membership_level: 'basic',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        })
        
        console.log("✅ Perfil criado com sucesso para utilizador OAuth")
      }

      // Atualizar último login
      await this.updateLastLogin(user.id)

      // Buscar perfil completo
      const userProfile = await this.getUserProfile(user.id)

      return {
        success: true,
        user: userProfile,
      }
    } catch (error: any) {
      console.error("Erro ao processar callback OAuth:", error)
      return {
        success: false,
        error: error.message || "Erro ao processar login",
      }
    }
  }

  // Verificar se username já existe
  async usernameExists(username: string): Promise<boolean> {
    try {
      if (!username) return false

      const { data, error } = await supabase.rpc("check_username_exists", { username_param: username })

      if (error) throw error
      return data || false
    } catch (error) {
      console.error("Erro ao verificar username:", error)
      return false
    }
  }

  // Verificar se JIFU ID já existe
  async jifuIdExists(jifuId: string): Promise<boolean> {
    try {
      if (!jifuId) return false

      const { data, error } = await supabase.rpc("check_jifu_id_exists", { jifu_id_param: jifuId })

      if (error) throw error
      return data || false
    } catch (error) {
      console.error("Erro ao verificar JIFU ID:", error)
      return false
    }
  }

  // Registro de novo usuário com campos expandidos
  async signUp(
    email: string,
    password: string,
    userData: {
      fullName: string
      username: string
      birthDate?: string
      jifuId?: string
      whatsapp?: string
      phone?: string
      socialMedia?: string
      userType?: "member" | "affiliate"
    },
  ) {
    try {
      console.log("🔍 Iniciando registo de usuário:", { email, username: userData.username })
      
      if (!email || !password || !userData.fullName || !userData.username) {
        console.error("❌ Dados obrigatórios em falta:", { email, fullName: userData.fullName, username: userData.username })
        return {
          success: false,
          error: "Email, senha, nome completo e nome de usuário são obrigatórios",
        }
      }

      const userType = userData.userType || "member"

      // Verificar se username já existe
      if (userData.username) {
        console.log("🔍 Verificando se username existe:", userData.username)
        const usernameExists = await this.usernameExists(userData.username)
        if (usernameExists) {
          console.error("❌ Username já existe:", userData.username)
          return {
            success: false,
            error: "Nome de usuário já está em uso",
          }
        }
      }

      // Verificar se JIFU ID já existe (se fornecido)
      if (userData.jifuId) {
        console.log("🔍 Verificando se JIFU ID existe:", userData.jifuId)
        const jifuIdExists = await this.jifuIdExists(userData.jifuId)
        if (jifuIdExists) {
          console.error("❌ JIFU ID já existe:", userData.jifuId)
          return {
            success: false,
            error: "ID JIFU já está registrado",
          }
        }
      }

      // Criar usuário no Auth
      console.log("🔍 Criando usuário no Supabase Auth...")
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: userData.fullName,
            username: userData.username,
            user_type: userType,
          },
        },
      })

      if (error) {
        console.error("❌ Erro ao criar usuário no Auth:", error)
        throw error
      }

      console.log("✅ Usuário criado no Auth com sucesso:", data.user?.id)

      // Criar perfil do usuário após registro
      if (data.user) {
        console.log("🔍 Criando perfil do usuário na tabela...")
        const profileResult = await this.createUserProfile(data.user.id, {
          email: data.user.email!,
          full_name: userData.fullName,
          username: userData.username,
          user_type: userType,
          is_active: true,
          membership_level: "basic",
          birth_date: userData.birthDate,
          jifu_id: userData.jifuId,
          phone: userData.phone,
          whatsapp: userData.whatsapp,
          social_media: userData.socialMedia,
        })
        
        if (!profileResult.success) {
          console.error("❌ Erro ao criar perfil:", profileResult.error)
          // Não falhar o registo se o perfil não for criado
          console.warn("⚠️ Registro criado no Auth mas perfil não foi criado na tabela")
        } else {
          console.log("✅ Perfil criado com sucesso")
        }
      }

      // Verificar se aprovação automática está ativada
      if (data.user) {
        try {
          console.log("🔍 Verificando configurações de aprovação...")
          const settingsResponse = await fetch('/api/admin/settings')
          const settingsResult = await settingsResponse.json()
          
          if (settingsResult.data?.auto_approve_users) {
            console.log("✅ Aprovação automática ativada, aprovando utilizador...")
            // Aprovar automaticamente
            const { error: approveError } = await supabase
              .from('profiles')
              .update({
                user_type: 'member',
                is_active: true,
                is_verified: true
              })
              .eq('id', data.user.id)
            
            if (!approveError) {
              console.log("✅ Utilizador aprovado automaticamente")
              return {
                success: true,
                user: data.user,
                message: "Conta criada e aprovada automaticamente! Pode fazer login agora.",
              }
            }
          }
        } catch (error) {
          console.warn("⚠️ Erro ao verificar aprovação automática:", error)
        }
      }

      // Enviar email de notificação para admin (se aprovação automática não estiver ativa)
      if (data.user) {
        try {
          console.log("🔍 Enviando email de notificação para admin...")
          const response = await fetch('/api/admin/notify-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: data.user.id })
          })
          
          if (response.ok) {
            console.log("✅ Email de notificação enviado com sucesso")
          } else {
            console.warn("⚠️ Erro ao enviar email de notificação")
          }
        } catch (emailError) {
          console.warn("⚠️ Erro ao enviar email de notificação:", emailError)
        }
      }

      console.log("✅ Registro concluído com sucesso")
      return {
        success: true,
        user: data.user,
        message: "Conta criada com sucesso! O teu pedido será analisado pela nossa equipa e receberás um email em breve.",
      }
    } catch (error: any) {
      console.error("❌ Erro geral no registo:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  // Buscar perfil do usuário com tratamento de erro
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      if (!userId) return null

      // Usar RPC para buscar perfil sem problemas de RLS
      const { data, error } = await supabase.rpc("get_user_profile", { user_id_param: userId })

      if (error) {
        console.error("Erro na query:", error)
        return await this.createBasicProfile(userId)
      }

      // Se não encontrou nenhum registro, criar um
      if (!data) {
        console.log("Usuário não encontrado, criando perfil básico...")
        return await this.createBasicProfile(userId)
      }

      return data
    } catch (error) {
      console.error("Erro ao buscar perfil:", error)
      // Fallback: criar perfil básico
      return await this.createBasicProfile(userId)
    }
  }

  // Criar perfil básico quando não existe
  async createBasicProfile(userId: string): Promise<User> {
    try {
      // Buscar dados do auth
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const basicProfile: User = {
        id: userId,
        email: user?.email || "user@example.com",
        full_name: user?.user_metadata?.full_name || "Usuário",
        username: user?.user_metadata?.username || `user_${Math.floor(Math.random() * 10000)}`,
        user_type: user?.user_metadata?.user_type || "member",
        membership_level: "basic",
        is_active: true,
      }

      // Tentar criar na tabela se ela existir
      try {
        await this.createUserProfile(userId, basicProfile)
      } catch (error) {
        console.log("Erro ao criar perfil na tabela, usando perfil temporário")
      }

      return basicProfile
    } catch (error) {
      console.error("Erro ao criar perfil básico:", error)
      // Perfil mínimo de emergência
      return {
        id: userId,
        email: "user@example.com",
        full_name: "Usuário",
        username: `user_${Math.floor(Math.random() * 10000)}`,
        user_type: "member",
        membership_level: "basic",
        is_active: true,
      }
    }
  }

  // Criar perfil do usuário
  async createUserProfile(userId: string, profileData: Partial<User>) {
    try {
      if (!userId) throw new Error("User ID é obrigatório")

      // Tentar inserir diretamente na tabela (sem RPC para evitar erros de coluna inexistente)
      const insertData: any = {
        id: userId,
        email: profileData.email,
        username: profileData.username,
        full_name: profileData.full_name,
        phone: profileData.phone,
        whatsapp: profileData.whatsapp,
        user_type: profileData.user_type || 'member',
        membership_level: profileData.membership_level || 'basic',
        is_active: profileData.is_active !== undefined ? profileData.is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Remover campos undefined
      Object.keys(insertData).forEach(key => {
        if (insertData[key] === undefined) {
          delete insertData[key]
        }
      })

      const { data, error } = await supabase
        .from('profiles')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error("Erro ao inserir perfil:", error)
        throw error
      }
      
      return { success: true, user: data }
    } catch (error: any) {
      console.error("Erro ao criar perfil:", error)
      return { success: false, error: error.message }
    }
  }

  // Logout
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { success: !error, error: error?.message }
  }

  // Verificar sessão atual
  async getCurrentSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session
    } catch (error) {
      console.error("Erro ao verificar sessão:", error)
      return null
    }
  }

  // Atualizar perfil
  async updateProfile(userId: string, updates: Partial<User>) {
    try {
      if (!userId) throw new Error("User ID é obrigatório")

      const { data, error } = await supabase.rpc("update_user_profile", {
        user_id_param: userId,
        updates_data: updates,
      })

      if (error) throw error
      return { success: true, user: data }
    } catch (error: any) {
      console.error("Erro ao atualizar perfil:", error)
      return { success: false, error: error.message }
    }
  }

  // Verificar se usuário é admin com validação mais robusta
  async isAdmin(userId: string): Promise<boolean> {
    try {
      if (!userId) return false

      // Verificar no banco de dados
      const { data: user, error } = await supabase
        .from("profiles")
        .select("user_type, is_active")
        .eq("id", userId)
        .single()

      if (error) throw error

      // Verificar se é admin e está ativo
      return user?.user_type === "admin" && user?.is_active === true
    } catch (error) {
      console.error("Erro ao verificar status de admin:", error)
      return false
    }
  }

  // Criar admin com validações adicionais
  async createAdmin(email: string, password: string, fullName: string, username: string) {
    try {
      if (!email || !password || !fullName || !username) {
        return {
          success: false,
          error: "Email, senha, nome completo e nome de usuário são obrigatórios",
        }
      }

      // Validar força da senha
      if (password.length < 8) {
        return {
          success: false,
          error: "A senha deve ter pelo menos 8 caracteres",
        }
      }

      // Verificar se o email já existe
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("email")
        .eq("email", email)
        .single()

      if (existingUser) {
        return {
          success: false,
          error: "Este email já está em uso",
        }
      }

      // Criar o usuário
      const signUpResult = await this.signUp(email, password, {
        fullName,
        username,
        userType: "member", // Criar como member primeiro, depois atualizar para admin
      })

      if (!signUpResult.success) {
        throw new Error(signUpResult.error)
      }

      // Se o usuário foi criado, atualizar para admin
      if (signUpResult.user?.id) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            user_type: "admin",
            membership_level: "vip",
            is_active: true,
            last_login: new Date().toISOString(),
          })
          .eq("id", signUpResult.user.id)

        if (updateError) throw updateError
      }

      return {
        success: true,
        message: "Admin criado com sucesso",
      }
    } catch (error: any) {
      console.error("Erro ao criar admin:", error)
      return { success: false, error: error.message }
    }
  }

  // Criar admin padrão com validações adicionais
  async createDefaultAdmin() {
    try {
      // Verificar se já existe algum admin
      const { data: admins, error: adminError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_type", "admin")
        .eq("is_active", true)
        .limit(1)

      if (adminError) {
        console.error("Erro ao verificar admins:", adminError)
        return { success: false, error: "Erro ao verificar admins" }
      }

      if (admins && admins.length > 0) {
        console.log("Já existe um admin ativo, pulando criação do admin padrão")
        return { success: true, message: "Já existe um admin ativo" }
      }

      // Criar o admin padrão
      const email = process.env.DEFAULT_ADMIN_EMAIL
      const password = process.env.DEFAULT_ADMIN_PASSWORD
      const fullName = "Admin Padrão"
      const username = "admin"

      if (!email || !password) {
        console.warn("Credenciais do admin padrão não definidas. Defina as variáveis DEFAULT_ADMIN_EMAIL e DEFAULT_ADMIN_PASSWORD no .env")
        return { success: false, error: "Credenciais do admin padrão não definidas" }
      }

      const createResult = await this.createAdmin(email, password, fullName, username)

      if (!createResult.success) {
        console.error("Erro ao criar admin padrão:", createResult.error)
        return { success: false, error: createResult.error }
      }

      console.log("Admin padrão criado com sucesso")
      return { success: true, message: "Admin padrão criado com sucesso" }
    } catch (error: any) {
      console.error("Erro ao criar admin padrão:", error)
      return { success: false, error: error.message }
    }
  }

  // Atualizar último login
  async updateLastLogin(userId: string) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("id", userId)

      if (error) throw error
      return true
    } catch (error) {
      console.error("Erro ao atualizar último login:", error)
      return false
    }
  }
}

export const authService = new AuthService()
