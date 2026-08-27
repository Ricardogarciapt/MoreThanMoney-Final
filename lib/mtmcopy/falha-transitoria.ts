/**
 * A falha é da CONTA ou é nossa?
 *
 * O painel marcava a conta a vermelho — e escondia-lhe o saldo — sempre que uma operação
 * falhasse, fosse qual fosse a razão. Um timeout da MetaApi, uma quota esgotada ou um socket
 * cortado passavam a "conta com erro", e quem olhava concluía que o cliente tinha um problema
 * quando o problema era nosso e durava trinta segundos.
 *
 * A distinção importa porque as duas coisas pedem respostas opostas: uma conta inválida exige
 * falar com o cliente; um timeout exige esperar. Marcar as duas da mesma maneira garante que se
 * perde tempo na primeira e se assusta gente na segunda.
 *
 * Na dúvida trata-se como transitória: é o lado seguro. Uma conta realmente partida volta a
 * falhar no minuto seguinte e acaba por ser marcada; uma conta boa marcada por engano fica com
 * uma etiqueta vermelha que ninguém sabe tirar.
 */
const NOSSAS = [
  /timed?\s*out/i,
  /timeout/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN/i,
  /socket hang up|network|fetch failed|aborted|AbortError/i,
  /rate limit|too many requests|cpu credits|quota/i,
  /\b(429|500|502|503|504)\b/,
  /internal server error|bad gateway|service unavailable/i,
  /not synchronized|synchronization|not connected to broker/i,
]

/** Problemas que são MESMO da conta — e que justificam marcá-la. */
const DA_CONTA = [
  /invalid account|account not found|no such account|unknown account/i,
  /unauthoriz|invalid credentials|wrong password|login failed/i,
  /trade (is )?disabled|trading disabled|account disabled|read.?only|investor/i,
  /not enough money|insufficient|no money|margin/i,
]

export function falhaEhNossa(mensagem: string | null | undefined): boolean {
  const m = String(mensagem ?? '').trim()
  if (!m) return true
  if (DA_CONTA.some((r) => r.test(m))) return false
  if (NOSSAS.some((r) => r.test(m))) return true
  // Sem sinal claro: não se marca a conta. Ver o comentário do topo.
  return true
}

/**
 * O que gravar no estado da ligação depois de uma falha.
 *
 * `last_error` fica sempre — é informação útil e não pinta nada de vermelho por si. O que só se
 * escreve quando o problema é da conta é o `mt5_status`.
 */
export function estadoAposFalha(mensagem: string | null | undefined): Record<string, unknown> {
  const texto = String(mensagem ?? '').slice(0, 500) || null
  return falhaEhNossa(texto) ? { last_error: texto } : { mt5_status: 'error', last_error: texto }
}
