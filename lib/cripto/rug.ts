/**
 * AGENTE CRIPTO: o FILTRO DE SCAM / RUGPULL. Puro, com VETO absoluto.
 *
 * Regra da casa: o que não se sabe conta contra. Um token sem dados de liquidez bloqueada não é
 * "provavelmente bom": fica de fora. Perde-se uma oportunidade; não se perde o capital todo.
 */
import type { DadosRug } from './tipos'

export const LIMIARES_RUG = {
  /** Pontuação RugCheck acima disto = fora (a escala do summary vai de 0 a milhares). */
  rugcheckMax: 500,
  liquidezMinUsd: 50_000,
  /** As 10 maiores carteiras não podem ter mais do que isto (exclui-se a pool na fonte). */
  top10Max: 0.35,
  lpBloqueadaMin: 0.9,
  idadeMinHoras: 24,
  /** Vender agora não pode custar mais do que isto (honeypot / taxa escondida). */
  impactoVendaMaxPct: 5,
} as const

/**
 * Perfil «pump»: tokens da Pump.fun JÁ GRADUADOS (fora da curva, numa pool). Nascem novos e com
 * pouca liquidez, por isso só a liquidez e a idade mínimas descem; autoridades, concentração, LP
 * bloqueada, RugCheck e o teste de honeypot ficam iguais.
 */
export const LIMIARES_RUG_PUMP = { ...LIMIARES_RUG, liquidezMinUsd: 15_000, idadeMinHoras: 0.25 } as const

export function avaliarRug(d: DadosRug, l: typeof LIMIARES_RUG | typeof LIMIARES_RUG_PUMP = LIMIARES_RUG): { aprovado: boolean; motivos: string[] } {
  const m: string[] = []
  const desconhecido = (x: unknown) => x === undefined || x === null || (typeof x === 'number' && !Number.isFinite(x))

  if (d.mintAuthorityAtiva !== false) m.push(d.mintAuthorityAtiva ? 'Mint authority ativa: podem imprimir mais tokens.' : 'Mint authority desconhecida.')
  if (d.freezeAuthorityAtiva !== false) m.push(d.freezeAuthorityAtiva ? 'Freeze authority ativa: podem congelar a tua carteira.' : 'Freeze authority desconhecida.')
  if (desconhecido(d.liquidezUsd)) m.push('Liquidez desconhecida.')
  else if (d.liquidezUsd! < l.liquidezMinUsd) m.push(`Liquidez ${Math.round(d.liquidezUsd!)} $ < ${l.liquidezMinUsd} $.`)
  if (desconhecido(d.top10Fraccao)) m.push('Distribuição dos detentores desconhecida.')
  else if (d.top10Fraccao! > l.top10Max) m.push(`Top 10 carteiras com ${(d.top10Fraccao! * 100).toFixed(0)}% da oferta.`)
  if (desconhecido(d.lpBloqueadaFraccao)) m.push('Liquidez bloqueada desconhecida.')
  else if (d.lpBloqueadaFraccao! < l.lpBloqueadaMin) m.push(`Só ${(d.lpBloqueadaFraccao! * 100).toFixed(0)}% da liquidez bloqueada/queimada.`)
  if (desconhecido(d.idadeHoras)) m.push('Idade da pool desconhecida.')
  else if (d.idadeHoras! < l.idadeMinHoras) m.push(`Pool com ${d.idadeHoras!.toFixed(0)} h (mínimo ${l.idadeMinHoras} h).`)
  if (desconhecido(d.impactoVendaPct)) m.push('Não foi possível cotar a venda (possível honeypot).')
  else if (d.impactoVendaPct! > l.impactoVendaMaxPct) m.push(`Vender custa ${d.impactoVendaPct!.toFixed(1)}% (possível honeypot).`)
  if (!desconhecido(d.rugcheckScore) && d.rugcheckScore! > l.rugcheckMax) m.push(`RugCheck ${d.rugcheckScore} (máx. ${l.rugcheckMax}).`)
  for (const r of d.rugcheckRiscos ?? []) {
    if (/rug|honeypot|freeze|mint|copycat|scam/i.test(r)) m.push(`RugCheck: ${r}.`)
  }
  return { aprovado: m.length === 0, motivos: m }
}
