/**
 * Depósito mínimo para o broker-gate, em USD.
 *
 * É a ÚNICA fonte deste número — o `telegram-broker-gate` e o `escada-precos` reexportam-no em vez
 * de o repetir. Havia duas constantes independentes com 300, e mais quatro sítios com o valor
 * escrito à mão nos guiões do bot e dos closers: mudar a regra obrigava a acertar seis sítios, e
 * bastava esquecer um para o bot prometer uma coisa e a validação exigir outra.
 *
 * Vive num ficheiro sem dependências para poder ser lido também do browser (o onboarding e o
 * ecrã de abertura de conta mostram-no) sem arrastar o cliente de administração do Supabase.
 *
 * 350 desde 2026-09-01 (era 300), para bater certo com o bónus da PU Prime.
 */
export const MIN_DEPOSIT = 350
