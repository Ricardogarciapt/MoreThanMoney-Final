/**
 * Serviço de autenticação IQONIC.VIP
 * Integração com a API do iqonic.vip para login de educadores e estudantes
 */

export interface IqonicUser {
  id?: string
  _id?: string
  distid?: string
  userid?: string
  email?: string
  name?: string
  firstName?: string
  role?: "student" | "educator"
  [key: string]: any
}

export interface IqonicSession {
  user: IqonicUser
  token: string
  userType: "student" | "educator"
  expiresAt?: number
  iqonicUserId?: string
}

const IQONIC_SESSION_KEY = "iqonic_vip_session"
// Suporta ambas as variáveis de ambiente para compatibilidade
const IQONIC_API_URL = process.env.NEXT_PUBLIC_IQONIC_API_URL || 
                       process.env.NEXT_PUBLIC_API_URL || 
                       "https://edu-backend-bafjgsfbapfxdecb.westus2-01.azurewebsites.net"

/**
 * Salva a sessão do usuário IQONIC no localStorage
 */
export function saveIqonicSession(
  user: IqonicUser,
  token: string,
  userType: "student" | "educator"
): void {
  if (typeof window === "undefined") return

  const session: IqonicSession = {
    user,
    token,
    userType,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 dias
    iqonicUserId: user.id || user._id || user.userid || user.distid,
  }

  try {
    localStorage.setItem(IQONIC_SESSION_KEY, JSON.stringify(session))
  } catch (error) {
    console.error("❌ [IQONIC AUTH] Erro ao salvar sessão:", error)
  }
}

/**
 * Carrega a sessão do usuário IQONIC do localStorage
 */
export function loadIqonicSession(): IqonicSession | null {
  if (typeof window === "undefined") return null

  try {
    const sessionData = localStorage.getItem(IQONIC_SESSION_KEY)
    if (!sessionData) return null

    const session: IqonicSession = JSON.parse(sessionData)

    // Verificar se a sessão expirou
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearIqonicSession()
      return null
    }

    return session
  } catch (error) {
    console.error("❌ [IQONIC AUTH] Erro ao carregar sessão:", error)
    return null
  }
}

/**
 * Limpa a sessão do usuário IQONIC
 */
export function clearIqonicSession(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem(IQONIC_SESSION_KEY)
  } catch (error) {
    console.error("❌ [IQONIC AUTH] Erro ao limpar sessão:", error)
  }
}

/**
 * Verifica se o usuário está autenticado via IQONIC
 */
export function isIqonicAuthenticated(): boolean {
  const session = loadIqonicSession()
  return session !== null && session.user !== null && session.token !== null
}

/**
 * Função de login IQONIC
 */
export async function loginIqonic(
  email: string,
  password: string,
  isEducator: boolean = false
): Promise<{ success: boolean; user?: IqonicUser; token?: string; error?: string }> {
  try {
    const endpoint = isEducator
      ? `${IQONIC_API_URL}/api/v1/educator/login`
      : `${IQONIC_API_URL}/api/v1/user/details`

    // Timeout de 4 segundos para evitar esperas longas
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    let response: Response

    try {
      if (isEducator) {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        })
      } else {
        response = await fetch(
          `${endpoint}?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
          }
        )
      }
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        return { success: false, error: "Timeout: A API IQONIC demorou muito a responder" }
      }
      throw fetchError
    }

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`
      
      try {
        const errorData = await response.json()
        errorMessage = errorData.message || errorData.error || errorMessage
      } catch {
        const errorText = await response.text()
        if (errorText) {
          errorMessage = errorText
        }
      }
      
      console.error(`❌ [IQONIC AUTH] HTTP error! status: ${response.status}`, errorMessage)
      
      // Mensagens de erro mais específicas
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: "Credenciais inválidas. Verifique seu email e senha.",
        }
      }
      
      if (response.status === 404) {
        return {
          success: false,
          error: "Usuário não encontrado. Verifique se o email está correto.",
        }
      }
      
      return {
        success: false,
        error: `Erro de autenticação: ${errorMessage}`,
      }
    }

    const data = await response.json()

    // Tratar diferentes formatos de resposta da API
    if (data && (data.user || data.email || data._id || data.id || data.userid || data.distid)) {
      // Formato 1: Com objeto user
      // Formato 2: Dados diretos no objeto
      const user: IqonicUser = data.user || {
        id: data._id || data.id || data.userid || data.distid,
        _id: data._id,
        distid: data.distid || data.userid,
        userid: data.userid || data.distid,
        email: data.email || email,
        name: data.name || data.firstName || email.split("@")[0],
        firstName: data.firstName || data.name,
        role: isEducator ? "educator" : "student",
        // Incluir todos os campos adicionais da resposta
        ...data,
      }

      // Token pode vir em diferentes campos
      const token = data.token || data._id || data.id || data.userid || data.distid || user.id || email

      if (!token) {
        return { success: false, error: "Token não encontrado na resposta do servidor" }
      }

      return { success: true, user, token }
    }

    return { success: false, error: "Resposta inválida do servidor: dados de usuário não encontrados" }
  } catch (error: any) {
    console.error("❌ [IQONIC AUTH] Erro no login:", error)
    return { success: false, error: error.message || "Falha no login" }
  }
}

/**
 * Login como estudante
 * Aceita email ou distid como identificador
 */
export async function loginAsStudent(
  emailOrDistid: string,
  password: string
): Promise<{ success: boolean; user?: IqonicUser; token?: string; error?: string }> {
  return loginIqonic(emailOrDistid, password, false)
}

/**
 * Login como educador
 */
export async function loginAsEducator(
  email: string,
  password: string
): Promise<{ success: boolean; user?: IqonicUser; token?: string; error?: string }> {
  return loginIqonic(email, password, true)
}

/**
 * Recuperar senha
 */
export async function forgotPasswordIqonic(
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${IQONIC_API_URL}/api/v1/user/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!response.ok) {
      return { success: false, error: `HTTP error! status: ${response.status}` }
    }

    const data = await response.json()
    return { success: true, message: data.message || "Email de recuperação enviado" }
  } catch (error: any) {
    console.error("❌ [IQONIC AUTH] Erro ao recuperar senha:", error)
    return { success: false, error: error.message || "Falha ao enviar email de recuperação" }
  }
}

/**
 * Obter URL de registro
 */
export function getIqonicRegisterUrl(): string {
  return "https://iqonic.vip/register"
}

