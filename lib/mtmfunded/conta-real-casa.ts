/**
 * CONTA REAL DA CASA — a marca única `mtm_trading_accounts.conta_real_casa` (migração 109).
 *
 * Decisão do dono (17/09): as contas MTM Funded dele que seguem as estratégias, a de T2T, a
 * «Todos os sinais» e as quatro contas-espelho das estratégias da The Trading Master são contas
 * REAIS da casa e apresentam negociação real.
 *
 * Porque é uma coluna e não mais um valor em `metricas.analise`:
 *  · `analise` já quer dizer uma coisa que continua verdadeira nestas contas — «as regras do
 *    programa não a quebram» (motor da VPS, trigger `funded_forcar_analise` da 092, barras do
 *    painel). Desligá-la para mudar o aviso punha as regras de avaliação a rebentar contas que o
 *    dono quer «sem regras». As duas perguntas separam-se: `analise` = sem regras;
 *    `conta_real_casa` = negociação real da casa.
 *  · `metricas` é reescrita pelo motor da VPS a cada minuto (ler → juntar → gravar): uma chave
 *    posta por migração entre a leitura e a gravação perdia-se. Uma coluna não passa por lá.
 *
 * Quem a lê: o aviso do WebTrader (lib/mtmfunded/aviso-conta.ts), o tipo do email de entrega
 * (email-tipo-conta.ts), os números/etiquetas do dono e do admin (numeros-conta.ts) e a equidade
 * (lib/equidade-mtm.ts, lib/equidade-casa.ts). Nenhum outro sítio decide «esta conta é real».
 *
 * Sem a 109 aplicada a coluna não existe: as leituras usam `selecionarComOpcionais` e tudo se
 * comporta como antes (nenhuma conta é real da casa).
 */

export const COLUNA_CONTA_REAL = 'conta_real_casa' as const

/** Aceita qualquer linha de `mtm_trading_accounts` (com ou sem a coluna — sem ela, não é real). */
export function ehContaRealDaCasa(linha: object | null | undefined): boolean {
  return (linha as { conta_real_casa?: unknown } | null | undefined)?.conta_real_casa === true
}
