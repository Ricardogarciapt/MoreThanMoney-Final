/**
 * MTM GoldKiller (porte TS do estudo Pine «MTM Gold Killer - Alertas», docs/pine/mtm-goldkiller-alertas.pine).
 *
 * - `calcularGoldKiller` — motor puro (sem DOM), serve servidor, testes e browser.
 * - `./lightweight` — desenho no Lightweight Charts v5 (importar à parte: só no cliente).
 * - `./legenda` — linha de estado + níveis da perna atual em React (cliente).
 */
export { calcularGoldKiller, niveisVisiveis, supertrendGK, fonteSmooth } from './motor'
export { INPUTS_GOLDKILLER_DEFAULT, PINE5, TRANSP_NIVEL, linhaDeEstadoGK } from './inputs'
export type * from './tipos'
