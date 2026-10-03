/**
 * O ESPAÇO DO WEBTRADER — regras puras de ocupação do ecrã (telemóvel, tablet, secretária).
 *
 * Os componentes lêem a largura/altura com matchMedia e decidem aqui; o teste
 * (lib/webtrader/__tests__/layout.check.ts) fixa os cortes.
 */

/** < 768 telemóvel; 768–1179 tablet (iPad retrato/paisagem, Android 10"); ≥ 1180 secretária. */
export type FaixaLargura = "estreito" | "tablet" | "largo"
export const CORTE_TABLET = 768
export const CORTE_LARGO = 1180

export function faixaDeLargura(largura: number): FaixaLargura {
  if (!(largura >= CORTE_TABLET)) return "estreito"
  return largura >= CORTE_LARGO ? "largo" : "tablet"
}

/** Media queries equivalentes (para matchMedia), para o CSS e o JS não discordarem. */
export const MQ_TABLET_OU_MAIS = `(min-width: ${CORTE_TABLET}px)`
export const MQ_LARGO = `(min-width: ${CORTE_LARGO}px)`
/**
 * Modo Simple: o painel das posições passa para o LADO do gráfico em paisagem com largura para
 * isso (tablet deitado, telemóvel grande deitado não — fica com < 900 px úteis ou pouca altura).
 */
export const MQ_PAINEL_AO_LADO = "(min-width: 900px) and (orientation: landscape) and (min-height: 500px)"

export function painelAoLado(largura: number, altura: number): boolean {
  return largura >= 900 && largura > altura && altura >= 500
}

/** «Mostrar gráfico»: o valor guardado do modo, senão o antigo (sem modo), senão visível. */
export function graficoVisivelGuardado(doModo: string | null, antigo: string | null): boolean {
  if (doModo != null) return doModo !== "0"
  if (antigo != null) return antigo !== "0"
  return true
}
