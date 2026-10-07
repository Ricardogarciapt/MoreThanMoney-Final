/**
 * A REFERÊNCIA DE UM MOVIMENTO DE SALDO NUMA CONTA MTM FUNDED — puro (o teste chama-o à mão).
 *
 * O formato não foi inventado aqui: é o dos créditos de 23/09, que ficaram na auditoria
 * (`mtm_funded_admin_audit.motivo`) assim:
 *
 *   PUPRIME-MT5-TO-MTMFUNDED · REF PP260923-PG-200     (depósito PU Prime do Pedro Gonçalves, 200)
 *   PUPRIME-MT5-TO-MTMFUNDED · REF PP260923-SV-125     (depósito PU Prime do Simão Varela, 125)
 *   Capital MoreThanMoney    · REF MTM-CAP-260923-RR-6000
 *   Transferência do PAMM MTM (VT Markets) · REF PAMM-VT-260923-NM-1200
 *
 * Ou seja: <PREFIXO><AAMMDD>-<INICIAIS>-<VALOR>, com a data em ano-mês-dia de dois dígitos (23/09/2026
 * → 260923), as iniciais do PRIMEIRO e do ÚLTIMO nome do titular, e o valor em USD sem casas (com
 * casas só se as tiver). Os prefixos longos (MTM-CAP-, PAMM-VT-) levam hífen antes da data; os
 * de duas letras (PP) não — mantém-se exactamente assim para a referência nova se ler ao lado das
 * antigas sem explicação.
 *
 * Prefixos novos (07/10), no mesmo molde:
 *   DL  divisão de lucros (cópia de trading)          → DL261007-PG-195
 *   TR  transferência entre contas da mesma pessoa      → TR261007-RG-1023.5
 *   RP  reposição de saldo negativo                     → RP261007-RG-1000
 *   AJ  correcção/ajuste do suporte                     → AJ261007-PG-195
 */

export interface OrigemAjuste {
  id: string
  /** O que vai à frente da data. */
  prefixo: string
  /** O texto longo que os registos antigos punham antes do «· REF». */
  descricao: string
}

export const ORIGENS_AJUSTE: readonly OrigemAjuste[] = [
  { id: 'DL', prefixo: 'DL', descricao: 'Divisão de lucros · cópia de trading' },
  { id: 'PP', prefixo: 'PP', descricao: 'PUPRIME-MT5-TO-MTMFUNDED' },
  { id: 'MTM-CAP', prefixo: 'MTM-CAP-', descricao: 'Capital MoreThanMoney' },
  { id: 'PAMM-VT', prefixo: 'PAMM-VT-', descricao: 'Transferência do PAMM MTM (VT Markets)' },
  { id: 'TR', prefixo: 'TR', descricao: 'Transferência entre contas' },
  { id: 'RP', prefixo: 'RP', descricao: 'Reposição de saldo' },
  { id: 'AJ', prefixo: 'AJ', descricao: 'Correcção do suporte' },
]

/** «Pedro Goncalves» → «PG»; «Fábio Rodrigues» → «FR»; um nome só → as duas primeiras letras. */
export function iniciaisDoNome(nome: string | null | undefined): string {
  const partes = String(nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return 'XX'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase().padEnd(2, 'X')
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** 2026-10-07 → «261007» (dia em Lisboa: um crédito às 00:30 de dia 8 é de dia 8). */
export function dataDaReferencia(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${v('year')}${v('month')}${v('day')}`
}

/** 195 → «195»; 1023.5 → «1023.5»; −195 → «195» (o sinal vive no valor, não na referência). */
export function valorDaReferencia(v: number): string {
  const a = Math.round(Math.abs(v) * 100) / 100
  return Number.isInteger(a) ? String(a) : String(a)
}

export function gerarReferencia(p: { origem: string; data: Date; nome: string | null | undefined; valor: number }): string {
  const o = ORIGENS_AJUSTE.find((x) => x.id === p.origem) ?? ORIGENS_AJUSTE[ORIGENS_AJUSTE.length - 1]
  return `${o.prefixo}${dataDaReferencia(p.data)}-${iniciaisDoNome(p.nome)}-${valorDaReferencia(p.valor)}`
}

/** A forma do registo antigo na auditoria: «<descrição> · REF <ref>». */
export function motivoComReferencia(origem: string | null | undefined, referencia: string, observacao?: string | null): string {
  const o = ORIGENS_AJUSTE.find((x) => x.id === origem)
  const frente = (observacao && observacao.trim()) || o?.descricao || 'Ajuste de saldo'
  return `${frente} · REF ${referencia}`.slice(0, 400)
}

/** Aceita as referências do formato e as antigas (letras, dígitos, ponto e hífen; 4 a 80). */
export const REFERENCIA_VALIDA = /^[A-Z0-9][A-Z0-9.\-]{3,79}$/

export function referenciaValida(r: string | null | undefined): boolean {
  return REFERENCIA_VALIDA.test(String(r ?? '').trim())
}
