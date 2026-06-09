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
const IQONIC_WEBHOOK = "ite5r9Qtin82q"
const IQONIC_SHIELD_URL = "https://shield.iqonic.life/outerinfo.dhtml"

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
 * Função de login IQONIC via shield.iqonic.life
 * Endpoint: GET https://shield.iqonic.life/outerinfo.dhtml?webhook=...&action=verifylogin&distid=EMAIL&password=PASSWORD
 */
export async function loginIqonic(
  email: string,
  password: string,
  isEducator: boolean = false
): Promise<{ success: boolean; user?: IqonicUser; token?: string; error?: string }> {
  try {
    const params = new URLSearchParams({
      webhook: IQONIC_WEBHOOK,
      action: "verifylogin",
      distid: email,
      password: password,
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    let response: Response
    try {
      response = await fetch(`${IQONIC_SHIELD_URL}?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === "AbortError") {
        return { success: false, error: "Timeout: A API IQONIC demorou muito a responder" }
      }
      throw fetchError
    }

    const rawText = await response.text()
    console.log(`[IQONIC AUTH] status=${response.status} body=${rawText.substring(0, 200)}`)

    // Try parsing as JSON first
    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      // Plain text response
      const lower = rawText.trim().toLowerCase()
      if (lower === "true" || lower === "1" || lower === "yes" || lower === "success" || lower === "ok") {
        return {
          success: true,
          user: { email, distid: email, name: email.split("@")[0], role: isEducator ? "educator" : "student" },
          token: email,
        }
      }
      return { success: false, error: "Credenciais inválidas. Verifica o teu email e password IQONIC." }
    }

    // HTTP error
    if (!response.ok) {
      const msg = data?.message || data?.error || data?.msg || `Erro ${response.status}`
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Credenciais inválidas. Verifica o teu email e password IQONIC." }
      }
      return { success: false, error: msg }
    }

    // Detect success from various JSON patterns
    const isSuccess =
      data?.success === true ||
      data?.success === 1 ||
      data?.success === "1" ||
      data?.status === "success" ||
      data?.status === "ok" ||
      data?.verified === true ||
      data?.login === true ||
      data?.login === "true" ||
      data?.login === "yes" ||
      data?.valid === true ||
      data?.code === 200 ||
      // If response has user-identifying fields, treat as success
      !!(data?.distid || data?.userid || (data?.email && data?.email !== "") || data?.id || data?._id)

    if (isSuccess) {
      const userObj = data?.user || data
      const user: IqonicUser = {
        id: userObj?.id || userObj?._id || userObj?.userid || userObj?.distid || email,
        _id: userObj?._id,
        distid: userObj?.distid || userObj?.userid || email,
        userid: userObj?.userid || userObj?.distid || email,
        email: userObj?.email || email,
        name: userObj?.name || userObj?.firstName || userObj?.fullname || userObj?.full_name || email.split("@")[0],
        firstName: userObj?.firstName || userObj?.name,
        role: isEducator ? "educator" : "student",
      }
      const token = userObj?.token || userObj?.access_token || user.id || email
      return { success: true, user, token }
    }

    const failMsg = data?.message || data?.error || data?.msg || data?.reason || "Credenciais inválidas"
    return { success: false, error: failMsg }
  } catch (error: any) {
    console.error("❌ [IQONIC AUTH] Erro no login:", error)
    return { success: false, error: error.message || "Falha no login com IQONIC" }
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

