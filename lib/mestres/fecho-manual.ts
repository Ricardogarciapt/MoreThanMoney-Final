/**
 * FECHO À MÃO NA MESTRE → AS SEGUIDORAS ACOMPANHAM (24/10, pedido do Ricardo).
 *
 * Um sinal abre na mestre e em cada conta SIM que a segue DIRECTAMENTE (encaminharSinalParaMestre:
 * uma ponte `funded_sinal_posicoes` por conta, todas com a mesma `estrategia` + `chave`). Não há
 * rota mestre→seguidora no meio — na Premium a rota é «só manuais» (206) precisamente para não
 * duplicar o sinal. Por isso, quando o dono fechava à mão na mestre uma trade de sinal, nada
 * chegava às seguidoras: ficavam com a posição aberta à espera de um alvo que ele já não esperava.
 *
 * Agora o fecho manual na mestre fecha as posições do MESMO sinal nas seguidoras. Uma parcial à mão
 * copia-se pela PROPORÇÃO (fechou metade → cada seguidora fecha metade da dela), nunca pelo lote.
 *
 * Fica de fora, de propósito:
 *  · trades abertas à mão na mestre: já seguem pela rota «só manuais» (aberturas E fechos);
 *  · fechos do motor (SL, TP, trailing, `estrategia`): cada seguidora tem a sua gestão gravada;
 *  · contas que não são mestre de nenhuma estratégia (a «Todos os sinais», as dos clientes).
 *
 * Este ficheiro é a decisão (pura, testada em __tests__/fecho-manual.check.ts). A execução está em
 * ./servidor/fecho-manual.ts, chamada por `fecharPosicao` quando o motivo é `manual`.
 */

export interface PassoDoLote {
  volume_min: number
  volume_step: number
}

export type AccaoSeguidora =
  | { tipo: 'fechar_tudo' }
  | { tipo: 'parcial'; volume: number }
  | { tipo: 'nada'; motivo: string }

/**
 * O que fazer na posição de uma seguidora quando a mestre fechou `fracao` (0–1] da dela.
 *
 *  · fracao ≥ 1 (a mestre fechou tudo) → fecha tudo;
 *  · senão, o volume da seguidora × fracao, arredondado para BAIXO ao passo;
 *  · abaixo do lote mínimo → nada (não se arredonda para cima: era fechar mais do que a mestre);
 *  · o que sobraria abaixo do lote mínimo → fecha tudo (uma posição de 0,00 lote não existe).
 */
export function accaoNaSeguidora(fracao: number, volumeSeguidora: number, s: PassoDoLote): AccaoSeguidora {
  if (!(volumeSeguidora > 0)) return { tipo: 'nada', motivo: 'seguidora sem volume aberto' }
  if (!(fracao > 0)) return { tipo: 'nada', motivo: 'a mestre não fechou nada' }
  if (fracao >= 1 - 1e-9) return { tipo: 'fechar_tudo' }
  const passo = s.volume_step > 0 ? s.volume_step : 0.01
  const minimo = s.volume_min > 0 ? s.volume_min : passo
  const passos = Math.floor((volumeSeguidora * fracao) / passo + 1e-9)
  const volume = Math.round(passos * passo * 1e8) / 1e8
  if (volume < minimo - 1e-9) return { tipo: 'nada', motivo: `${Math.round(fracao * 100)}% de ${volumeSeguidora} lote fica abaixo do mínimo (${minimo})` }
  if (volumeSeguidora - volume < minimo - 1e-9) return { tipo: 'fechar_tudo' }
  return { tipo: 'parcial', volume }
}

/** Só um fecho MANUAL de uma posição de SINAL (não aberta à mão) passa às seguidoras. */
export function propagaFechoManual(p: { motivo: string; origem?: string | null; ideiaRef?: string | null }): boolean {
  if (p.motivo !== 'manual') return false
  if ((p.origem ?? '') === 'manual') return false
  return typeof p.ideiaRef === 'string' && p.ideiaRef.startsWith('sinal:')
}
