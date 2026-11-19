/** Puro: sem base, sem rede. Usado por lib/sinais/premium-scanner-webhook.ts. */

/**
 * HORAS SEM ENTRADAS (19/11/2026, afinação pedida pelo Ricardo). Medido na mestre Premium II 77710365,
 * 183 trades de 29/10 a 19/11, por hora de Londres da abertura: 14h −4,0 R e 15h −2,9 R (46 trades,
 * −6,9 R, a abertura de Nova Iorque e os dados dos EUA), contra +18 R no resto do dia. As 14h e 15h
 * de Londres deixam de abrir e de publicar. Ajusta-se sem deploy em
 * `mtmauto_providers.sinais_config.horasBloqueadasLondres` do mtm-auto-premium-ii (lista de horas 0–23;
 * [] desliga o filtro).
 */
export const HORAS_BLOQUEADAS_LONDRES_OMISSAO = [14, 15]

export function horaDeLondres(quando: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(quando)
  return Number(h) % 24
}

/** O sinal cai numa hora sem entradas? `horas` inválido usa a omissão. Puro. */
export function foraDaJanelaPremiumII(quando: Date, horas: unknown): boolean {
  const lista = Array.isArray(horas)
    ? horas.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    : HORAS_BLOQUEADAS_LONDRES_OMISSAO
  return lista.includes(horaDeLondres(quando))
}

