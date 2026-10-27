/**
 * A REGRA DA PORTA DOS GRUPOS DE SINAIS — módulo puro (sem base, sem rede), para os testes.
 *
 * Pedido do dono (27/10/2026): nos grupos de sinais do Telegram só entra quem
 *   1) tem a conta da corretora validada (UID PU Prime + depósito → `telegram_leads.stage = 'granted'`), ou
 *   2) se confirma membro MTM (conta do site ativa — pack ou Premium — ou direito ao MTM Auto).
 *
 * O resto não é recusado de vez: o pedido fica PENDENTE e o bot explica-lhe os dois caminhos. Quando
 * a pessoa valida a conta ou confirma que é membro, os pedidos pendentes são aprovados sozinhos.
 */

export type ViaDeEntrada = 'corretora' | 'membro' | 'mtmauto' | 'admin'

export interface FactosDaPessoa {
  /** `telegram_leads.stage` da pessoa (o chat privado tem o id do utilizador). */
  stageLead?: string | null
  /** Perfil MTM ligado a esta conta do Telegram (por código no email), se houver. */
  perfil?: { is_active?: boolean | null; user_type?: string | null } | null
  /** Direito ao MTM Auto (pela ligação do Telegram na app MTM Auto ou pelo perfil ligado). */
  direitoMtmAuto?: boolean
  /** É o chat de admin do bot. */
  ehAdmin?: boolean
}

export function decidirEntrada(f: FactosDaPessoa): { pode: true; via: ViaDeEntrada } | { pode: false } {
  if (f.ehAdmin) return { pode: true, via: 'admin' }
  if (f.stageLead === 'granted') return { pode: true, via: 'corretora' }
  // Membro = conta do site ATIVA. `is_active` só é true com pack/Premium pago, VIP ou admin
  // (é o mesmo campo que abre o chat da app — lib/chat-channel-permissions › canReadChannel).
  if (f.perfil?.is_active === true) return { pode: true, via: 'membro' }
  if (f.direitoMtmAuto) return { pode: true, via: 'mtmauto' }
  return { pode: false }
}

export type ModoPorta = 'aviso' | 'expulsar'

export function lerModoPorta(v: unknown): ModoPorta {
  const modo = (v as { modo?: unknown } | null)?.modo
  return modo === 'expulsar' ? 'expulsar' : 'aviso'
}

/** `/membro email@x.pt` → o email (minúsculas) ou null. */
export function lerComandoMembro(texto: string): { email: string | null } | null {
  const m = texto.trim().match(/^\/membro(?:@\w+)?(?:\s+(\S+))?$/i)
  if (!m) return null
  const email = (m[1] ?? '').toLowerCase()
  return { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null }
}

/** `/codigo 123456` → o código ou null. Tem prefixo de propósito: 6 dígitos soltos são um UID. */
export function lerComandoCodigo(texto: string): { codigo: string | null } | null {
  const m = texto.trim().match(/^\/c[oó]digo(?:@\w+)?(?:\s+(\d{6}))?$/i)
  if (!m) return null
  return { codigo: m[1] ?? null }
}

/** Esconde o email no que se diz no Telegram: ri***@gmail.com. */
export function mascararEmail(email: string): string {
  const [u, d] = email.split('@')
  if (!d) return '***'
  return `${u.slice(0, 2)}***@${d}`
}

export function textoDoPedidoPendente(tituloGrupo: string | null, botUsername: string): string {
  const grupo = tituloGrupo ? `«${tituloGrupo}»` : 'o grupo de sinais'
  return (
    `👋 Recebi o teu pedido para entrar em ${grupo}.\n\n` +
    `Os grupos de sinais são só para quem já está connosco. Há dois caminhos:\n\n` +
    `1️⃣ <b>Já és membro MTM</b> (pack ou Premium)? Escreve aqui:\n<code>/membro o-teu-email@exemplo.com</code>\n` +
    `Mando-te um código para o email da tua conta e entras logo a seguir.\n\n` +
    `2️⃣ <b>Ainda não és membro?</b> Abre conta na corretora parceira com o nosso link, faz o depósito e valida aqui — ` +
    `tens educação gratuita e acesso aos grupos. Começa em https://t.me/${botUsername}?start=broker\n\n` +
    `O teu pedido fica guardado: assim que validares, aprovo-o sozinho. ✅`
  )
}
