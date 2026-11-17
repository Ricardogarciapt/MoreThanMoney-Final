/**
 * A CADÊNCIA DO SEGUIMENTO — quatro toques e depois email (decisão do dono, 16/11/2026).
 *
 * «Não 3 mensagens, mas sim 4: uma no dia, uma passadas 24 horas, outra passadas 48 horas, outra
 * passadas 72 horas e depois, se já tivermos os contactos, passar para e-mail campaign.»
 *
 * ═══ AS REGRAS DAS PLATAFORMAS GANHAM À CADÊNCIA ═══════════════════════════════════════════
 *
 * No Telegram a conversa é do bot e a cadência corre inteira. No Instagram e no WhatsApp a Meta só
 * deixa escrever texto livre até 24 h depois da ÚLTIMA mensagem da pessoa: fora disso é bloqueio
 * (Instagram) ou template pago com opt-in (WhatsApp). O toque das 48 h e o das 72 h nessas duas só
 * saem se a pessoa tiver voltado a escrever entretanto — senão a cadência segue por onde for legal
 * (Telegram com opt-in, ou email com consentimento). A tag HUMAN_AGENT não serve para automação
 * (`setter-persona.ts`).
 *
 * Depois do 4.º toque: email, mas SÓ com consentimento de email ou se já for cliente (Lei 41/2004,
 * art. 13.º-A). Sem isso, pára. «Sair» é para sempre.
 *
 * Puro: a guarda (`cadencia-seguimento.check.ts`) prova os prazos e as janelas sem rede.
 */

export const TOQUES = 4

/**
 * Horas de silêncio antes de cada toque, contadas desde o toque anterior (o 1.º desde a última
 * mensagem da pessoa). O 1.º é «no dia»: quatro horas de silêncio, para não parecer um robô a
 * responder a uma conversa que ainda está viva.
 */
export const HORAS_ENTRE_TOQUES = [4, 24, 24, 24] as const

/** Margem dentro da janela de 24 h da Meta: não se tenta à 23h59. */
export const JANELA_META_HORAS = 23

export type CanalSeguimento = 'telegram' | 'instagram' | 'whatsapp'

/** Já é altura do toque `n` (1-based)? `desdeIso` = toque anterior, ou a última mensagem dela no 1.º. */
export function toqueDevido(n: number, desdeIso: string | null, agora = Date.now()): boolean {
  if (!Number.isInteger(n) || n < 1 || n > TOQUES) return false
  if (!desdeIso) return false
  const desde = Date.parse(desdeIso)
  if (!Number.isFinite(desde)) return false
  return agora - desde >= HORAS_ENTRE_TOQUES[n - 1] * 3_600_000
}

/**
 * Pode sair um toque neste canal agora? No Instagram e no WhatsApp só dentro da janela de 24 h desde
 * a última mensagem DA PESSOA (não a nossa).
 */
export function podeTocarNoCanal(canal: CanalSeguimento, ultimaMensagemDelaIso: string | null, agora = Date.now()): boolean {
  if (canal === 'telegram') return true
  if (!ultimaMensagemDelaIso) return false
  const t = Date.parse(ultimaMensagemDelaIso)
  if (!Number.isFinite(t)) return false
  return agora - t < JANELA_META_HORAS * 3_600_000
}

export type DepoisDosToques = 'email' | 'parar'

/** O que acontece quando os quatro toques acabam (ou o canal deixa de poder). */
export function depoisDosToques(p: { temEmail: boolean; consentiuEmail: boolean; ehCliente: boolean; saiu: boolean }): DepoisDosToques {
  if (p.saiu || !p.temEmail) return 'parar'
  return p.consentiuEmail || p.ehCliente ? 'email' : 'parar'
}
