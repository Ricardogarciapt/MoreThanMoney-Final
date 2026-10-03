/**
 * MTM Sensei (porte TS do estudo Pine «MTM Sensei v3»).
 *
 * - `calcularSensei` — motor puro (sem DOM), serve servidor, testes e browser.
 * - `./lightweight` — desenho no Lightweight Charts v5 (importar à parte: só no cliente).
 * - `./checklist` — painéis CHECKLIST / CONFIRMAÇÕES em React (cliente).
 */
export { calcularSensei, configAuto, dentroDaSessao, deduzirMintick, deduzirTf, reamostrar } from './motor'
export { INPUTS_SENSEI_DEFAULT, paletaSensei, corPine } from './inputs'
export type * from './tipos'
