/**
 * MTM Scanner (porte TS do estudo Pine oficial «MoreThanMoney - Scanner V3.5», docs/pine/mtm-scanner-v3.5.pine).
 *
 * - `calcularMTMScanner` — motor puro (sem DOM), serve servidor, testes e browser.
 * - `./lightweight` — desenho no Lightweight Charts v5 (importar à parte: só no cliente).
 * - `./legenda` — linha de estado + níveis do último sinal em React (cliente).
 */
export { calcularMTMScanner, pocMTMScanner, fasesMTMScanner, swingsMTMScanner, roundPrice, MAX_ESTRUTURA_MS } from './motor'
export { INPUTS_MTMSCANNER_DEFAULT, PINE5_MS, linhaDeEstadoMS } from './inputs'
export type * from './tipos'
