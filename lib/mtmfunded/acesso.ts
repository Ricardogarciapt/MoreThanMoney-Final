/**
 * QUEM VÊ O QUÊ no MTM Funded e nos torneios.
 *
 * Há um papel novo — `tournament` — para quem se inscreve num torneio sem ser cliente.
 * Não é um membro a meio: é uma pessoa que entrou por uma porta lateral e a quem se abre
 * exactamente aquilo de que precisa para competir, e nada mais. Misturá-la com os membros
 * era dar-lhe os alertas e os scanners que os outros pagam.
 *
 * O que o participante de torneio vê:
 *   · /mtmfunded e /mtmfunded/tradingtournament (e o painel dele)
 *   · Terminal MTM
 *   · Scanner — SÓ o GoldKiller
 *
 * O que NÃO vê: alertas MTM, os restantes scanners, o T2T, os chats de sinais.
 * Membro (ou acima) vê tudo o que já via, mais o torneio.
 */

export type PapelMtmFunded = 'visitante' | 'torneio' | 'membro' | 'admin'

export interface PerfilAcesso {
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
}

/** O scanner que um participante de torneio pode usar. Um só, de propósito. */
export const SCANNERS_TORNEIO = ['GoldKiller'] as const

export function papelMtmFunded(perfil: PerfilAcesso | null | undefined): PapelMtmFunded {
  if (!perfil) return 'visitante'
  const tipo = String(perfil.user_type ?? '').toLowerCase()
  const categoria = String(perfil.member_category ?? '').toLowerCase()
  const plano = String(perfil.subscription_plan ?? '').toLowerCase()

  if (tipo === 'admin') return 'admin'
  // Membro é quem paga: plano activo OU categoria acima de standard OU vip.
  if (tipo === 'vip' || categoria === 'vip' || categoria === 'premium') return 'membro'
  if (plano === 'premium' || plano === 'app_member') return 'membro'
  if (tipo === 'tournament') return 'torneio'
  if (tipo === 'member' && perfil.is_active) return 'membro'
  return 'visitante'
}

/** Pode entrar nas páginas do MTM Funded / torneios? */
export function podeVerMtmFunded(perfil: PerfilAcesso | null | undefined): boolean {
  return papelMtmFunded(perfil) !== 'visitante'
}

/** Pode abrir o Terminal MTM? */
export function podeVerTerminal(perfil: PerfilAcesso | null | undefined): boolean {
  return papelMtmFunded(perfil) !== 'visitante'
}

/** Os alertas MTM ficam FORA para quem só entrou pelo torneio. */
export function podeVerAlertas(perfil: PerfilAcesso | null | undefined): boolean {
  const papel = papelMtmFunded(perfil)
  return papel === 'membro' || papel === 'admin'
}

/**
 * Os scanners que este perfil pode usar.
 * `null` = todos (membro/admin). Lista = só esses. Vazio = nenhum.
 */
export function scannersPermitidos(perfil: PerfilAcesso | null | undefined): readonly string[] | null {
  const papel = papelMtmFunded(perfil)
  if (papel === 'membro' || papel === 'admin') return null
  if (papel === 'torneio') return SCANNERS_TORNEIO
  return []
}

export function podeUsarScanner(perfil: PerfilAcesso | null | undefined, scanner: string): boolean {
  const permitidos = scannersPermitidos(perfil)
  if (permitidos === null) return true
  return permitidos.some((s) => s.toLowerCase() === scanner.trim().toLowerCase())
}

/**
 * Censura do email na classificação pública.
 *
 * A classificação é pública e mostra pessoas reais: o nome fica, o email não. Guarda-se as
 * primeiras letras para quem se reconhece se reconhecer, e esconde-se o resto — incluindo o
 * domínio, que num universo pequeno chega para identificar alguém.
 */
export function censurarEmail(email: string | null | undefined): string {
  const e = String(email ?? '').trim()
  const at = e.indexOf('@')
  if (at < 1) return '***'
  const local = e.slice(0, at)
  const dominio = e.slice(at + 1)
  const ponto = dominio.lastIndexOf('.')
  const tld = ponto > 0 ? dominio.slice(ponto) : ''
  // Máscara de tamanho FIXO. Repetir um asterisco por letra escondida contava ao mundo
  // quantas letras tem o email — num universo de umas centenas de pessoas, isso ajuda a
  // adivinhar quem é. Formato pedido pelo Ricardo: jkjhk****@***.com
  const visivel = local.slice(0, Math.min(5, Math.max(1, local.length - 1)))
  return `${visivel}****@***${tld}`
}
