import { temDireitoSinaisPagos, type PerfilSinais } from "@/lib/direito-sinais"
export type ChatChannelUser = {
  id?: string
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  membership_level?: string | null
  is_active?: boolean
  created_at?: string | null
}

/**
 * Quem lê e quem escreve num canal — CONFIGURADO NO ADMIN (tabela `chat_channels`, migração 117).
 *
 * Cada função recebe o canal como veio da tabela. Colunas a null (ou a migração ainda por aplicar)
 * caem nas regras de sempre, escritas aqui em baixo — as MESMAS que as funções da RLS
 * `chat_nivel_leitura` / `chat_nivel_escrita` usam. Web, iOS nativo e Android nativo aplicam
 * assim uma regra só: a web por estas funções, as apps nativas pela RLS (inserem directo na base)
 * e pelo `/api/chat/canais`, que lhes devolve `pode_ler` / `pode_escrever` já calculados.
 */
export type NivelLeitura = "membros" | "premium" | "admin"
export type NivelEscrita = "membros" | "vip" | "ninguem"

export interface ChatChannelConfig {
  slug: string
  leitura?: string | null
  escrita?: string | null
  exige_uid_corretora?: boolean | null
}

export const NIVEIS_LEITURA: readonly NivelLeitura[] = ["membros", "premium", "admin"]
export const NIVEIS_ESCRITA: readonly NivelEscrita[] = ["membros", "vip", "ninguem"]

/** Regra de sempre (sem configuração): canais pagos. */
const LEITURA_PREMIUM_POR_OMISSAO = new Set(["premium-ideas", "sensei-scanner", "sinais-goldkiller"])

/** Canais de sinais: Premium · Ouro, Sensei Scanner e Ideias de Índices — publicam admin e VIP. */
export const SIGNAL_PUBLISH_CHANNELS = ["premium-ideas", "sensei-scanner", "trade-ideas"] as const

/** Canais alimentados pelo sistema — ninguém publica à mão (regra de sempre). */
const SO_SISTEMA_POR_OMISSAO = new Set([
  "trade-ideas-setup",
  // `ideias-e-sinais` saiu daqui a 04/10/2026 (canal fechado, hidden=true na BD).
  "sinais-goldkiller",
  "sinais-scanner-mtm",
])

/** Canais de comunidade abertos a todos os membros ativos (ler e publicar). */
export const OPEN_COMMUNITY_CHANNELS = [
  "geral",
  "trading",
  "cripto",
  "etf-stocks",
  "social-ugc",
  "ia",
  "fitness",
  "mindset",
  "lideranca",
] as const

const UID_POR_OMISSAO = new Set(["trade-ideas", "trade-ideas-setup", "premium-ideas", "sinais-scanner-mtm"])

function cfgDe(slug: string, cfg?: ChatChannelConfig | null): ChatChannelConfig | null {
  return cfg && cfg.slug === slug ? cfg : null
}

/** Nível de leitura efectivo do canal. */
export function nivelLeitura(slug: string, cfg?: ChatChannelConfig | null): NivelLeitura {
  const v = cfgDe(slug, cfg)?.leitura
  if (v && (NIVEIS_LEITURA as readonly string[]).includes(v)) return v as NivelLeitura
  return LEITURA_PREMIUM_POR_OMISSAO.has(slug) ? "premium" : "membros"
}

/**
 * Nível de escrita efectivo do canal.
 *
 * Sem configuração, um canal que não está em nenhuma lista fica FECHADO na web (era assim) —
 * a RLS é mais larga nesses casos (`membros`), por isso a migração 117 preenche os canais de
 * sinais com `ninguem`. Configurado no admin, manda o que lá estiver.
 */
export function nivelEscrita(slug: string, cfg?: ChatChannelConfig | null): NivelEscrita {
  const v = cfgDe(slug, cfg)?.escrita
  if (v && (NIVEIS_ESCRITA as readonly string[]).includes(v)) return v as NivelEscrita
  if ((SIGNAL_PUBLISH_CHANNELS as readonly string[]).includes(slug)) return "vip"
  if (SO_SISTEMA_POR_OMISSAO.has(slug)) return "ninguem"
  if ((OPEN_COMMUNITY_CHANNELS as readonly string[]).includes(slug)) return "membros"
  return "ninguem"
}

/** Só de leitura para um membro comum (mostra o rodapé «só leitura»). */
export function isReadOnlyChannel(slug: string, cfg?: ChatChannelConfig | null) {
  if (cfgDe(slug, cfg)?.escrita) return nivelEscrita(slug, cfg) !== "membros"
  return (
    slug === "trade-ideas-setup" ||
    slug === "premium-ideas" ||
    slug === "sensei-scanner" ||
    slug === "sinais-goldkiller" ||
    slug === "sinais-scanner-mtm"
  )
}

export function isPremiumChannel(slug: string, cfg?: ChatChannelConfig | null) {
  return nivelLeitura(slug, cfg) === "premium"
}

export function requiresBrokerUidChannel(slug: string, cfg?: ChatChannelConfig | null) {
  const v = cfgDe(slug, cfg)?.exige_uid_corretora
  if (typeof v === "boolean") return v
  return UID_POR_OMISSAO.has(slug)
}

/**
 * VIP, seja por que campo for.
 *
 * O VIP está marcado em DOIS sítios — `user_type` e `member_category` — e o resto do site
 * aceita qualquer um deles. Aqui só se lia a categoria, e isso deixava de fora quem foi
 * marcado VIP pelo tipo: entrava no site, via os canais na lista e não lia nenhum sinal.
 *
 * O VIP é uma decisão nossa, tomada à margem do pack que a pessoa paga. Fazê-la depender do
 * plano é desfazê-la sem ninguém a desfazer.
 */
function ehVip(user: ChatChannelUser): boolean {
  return user.user_type === "vip" || user.member_category === "vip"
}

// A mesma regra dos sinais pagos (lib/direito-sinais.ts, RLS 115/117): Premium/Fundador em qualquer
// campo, VIP em qualquer campo, IQ, admin. O direito MTM Auto só a RLS e o servidor o vêem.
function ehPremium(user: ChatChannelUser): boolean {
  return user.user_type === "admin" || temDireitoSinaisPagos(user as PerfilSinais)
}

export function canReadChannel(
  slug: string,
  user: ChatChannelUser | null | undefined,
  cfg?: ChatChannelConfig | null,
): boolean {
  if (!user?.is_active) return false
  const nivel = nivelLeitura(slug, cfg)
  if (nivel === "admin") return user.user_type === "admin"
  if (nivel === "premium") return ehPremium(user)
  return true
}

/**
 * Publicação em canais de sinais: apenas admin e VIP. O "sistema"
 * (webhook / reencaminhamento Telegram) insere server-side com user_id null,
 * contornando esta verificação — o reencaminhamento existente mantém-se.
 */
export function canPublishSignalChannel(user: ChatChannelUser | null | undefined): boolean {
  if (!user?.is_active) return false
  return user.user_type === "admin" || ehVip(user)
}

export function canWriteChannel(
  slug: string,
  user: ChatChannelUser | null | undefined,
  cfg?: ChatChannelConfig | null,
): boolean {
  if (!user?.is_active) return false
  // Quem não lê o canal também não escreve nele.
  if (!canReadChannel(slug, user, cfg)) return false
  const nivel = nivelEscrita(slug, cfg)
  if (nivel === "vip") return canPublishSignalChannel(user)
  if (nivel === "ninguem") return false
  return true
}
