/**
 * PrimeGate — o que se diz ao cliente (PURO).
 *
 * Honesto acima de tudo: «undetermined» não é recusa e não pode soar a recusa. O cliente fica a
 * saber o que falta, quando voltamos a verificar e o que pode estar errado do lado dele (link,
 * email ou UID) — sem prometer o que o PrimeGate não confirma (KYC, depósito, trading).
 */
import type { EstadoPrimeGate } from './resultado'

export const LINK_ABRIR_CONTA = 'https://www.morethanmoney.pt/abrir-conta'

/** «daqui a 1 hora», «daqui a 6 horas», «amanhã». */
export function quandoVoltamos(proxima: Date | string | null | undefined, agoraMs = Date.now()): string | null {
  if (!proxima) return null
  const ms = (typeof proxima === 'string' ? Date.parse(proxima) : proxima.getTime()) - agoraMs
  if (!Number.isFinite(ms)) return null
  const h = Math.max(1, Math.round(ms / 3600_000))
  if (ms < 50 * 60_000) return 'dentro de alguns minutos'
  if (h >= 20) return 'dentro de cerca de 24 horas'
  return h === 1 ? 'dentro de cerca de 1 hora' : `dentro de cerca de ${h} horas`
}

export function mensagemParaCliente(
  estado: EstadoPrimeGate,
  proxima: Date | string | null | undefined,
  formato: 'texto' | 'html' = 'texto',
): string {
  const b = (s: string) => (formato === 'html' ? `<b>${s}</b>` : s)
  if (estado === 'confirmed') {
    return `✅ ${b('Registo confirmado no ramo MTM.')} A tua conta PU Prime está ligada a nós.`
  }
  const quando = quandoVoltamos(proxima)
  const volta = quando ? `Volto a verificar automaticamente ${quando}.` : 'Vamos voltar a verificar e avisamos-te.'
  if (estado === 'erro') {
    return `⏳ ${b('Não consegui verificar agora')} (o serviço de verificação não respondeu). Não é nada contigo. ${volta}`
  }
  return (
    `⏳ ${b('O teu registo ainda não aparece no nosso ramo.')} Isto NÃO é uma recusa: os registos ` +
    `entram na PrimeVerse por carregamentos e podem demorar. ${volta}\n\n` +
    `Entretanto confirma: abriste a conta pelo link MTM (${LINK_ABRIR_CONTA})? O email e o UID ` +
    `são exactamente os da tua conta PU Prime?`
  )
}
