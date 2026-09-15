/**
 * GESTÃO MTM Auto de uma posição aberta — sem IO. Fonte ÚNICA para:
 *
 *  · `gerirPosicao()` em `lib/motor.ts` (repositório mtm-auto, cron /api/cron/motor a cada 5 s);
 *  · o motor em tempo real do VPS (`services/motor-real` no repositório do site).
 *
 * O repositório do site tem uma cópia BYTE A BYTE deste ficheiro em `lib/gestao-real/mtmauto.ts`
 * (teste `lib/gestao-real/__tests__/copias-mtm-auto.check.ts` lá). Mudar aqui = copiar para lá.
 *
 * É o corpo de `gerirPosicao` e a conta de `espelharNoCliente` tal como estavam a 2026-09-15
 * (commit f13d62c), com o IO trocado por `ops.*`. Prova: `lib/gestao-real/__tests__/paridade.check.ts`
 * (mtm-auto) corre o motor ORIGINAL do git e o actual contra os mesmos cenários.
 */
import { arredondarLote, precoDaCorretora, tamanhoPip, trocouBem, type RespostaTradeMin } from './mtmauto-regras'

export interface PosicaoMtmAuto {
  id: string
  symbol: string
  type: string
  volume?: number
  openPrice: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
}

export interface ExecucaoMtmAuto {
  id: string
  user_id: string
  lote: number | null
  sl: number | null
  saidas_feitas: number
  trailing_sl: number | null
  pico_pips: number
}

export interface SinalMtmAuto {
  symbol: string
  direction: 'buy' | 'sell'
  tps: number[]
}

export interface OpcoesMtmAuto {
  beAtivo: boolean
  trailingAtivo: boolean
  trailingTempoReal?: boolean
  trailingDistanciaPips?: number | null
  trailingPassoPips?: number | null
  saidasPct: number[]
  trailingArrancaPips?: number | null
}

export interface ConfigMtmAuto {
  beBufferPips: number
  beRacio: number
  trailRacio: number
}

/** Mesmos valores por omissão do motor: MTMAUTO_BE_BUFFER_PIPS 5 · MTMAUTO_BE_RATIO 0.4 · MTMAUTO_TRAIL_RATIO 0.5. */
export function configMtmAutoDoAmbiente(env: Record<string, string | undefined>): ConfigMtmAuto {
  return {
    beBufferPips: Number(env.MTMAUTO_BE_BUFFER_PIPS) || 5,
    beRacio: Number(env.MTMAUTO_BE_RATIO) || 0.4,
    trailRacio: Number(env.MTMAUTO_TRAIL_RATIO) || 0.5,
  }
}

export interface AvisoMtmAuto {
  titulo: string
  corpo: string
  tag?: string
  unica?: string
}

export interface OperacoesMtmAuto {
  fechar: (positionId: string, volume?: number) => Promise<RespostaTradeMin | null>
  modificar: (positionId: string, stopLoss?: number | null, takeProfit?: number | null) => Promise<RespostaTradeMin | null>
  esquecer: () => void
  precoAoVivo?: (symbol: string) => Promise<number | null>
  avisar: (aviso: AvisoMtmAuto) => Promise<void>
}

function precoBE(entrada: number, direction: 'buy' | 'sell', symbol: string, bufferPips: number): number {
  const buf = bufferPips * tamanhoPip(symbol)
  return direction === 'buy' ? entrada + buf : entrada - buf
}

/**
 * Alvos + break-even + trailing. Devolve as notas e o patch da execução (com `updated_at`; o
 * chamador só grava quando o patch tem mais do que isso).
 */
export async function gerirAlvosEProtecao(a: {
  execucao: ExecucaoMtmAuto
  sinal: SinalMtmAuto
  posicao: PosicaoMtmAuto
  opcoes: OpcoesMtmAuto
  cfg: ConfigMtmAuto
  ops: OperacoesMtmAuto
}): Promise<{ notas: string[]; patch: Record<string, unknown> }> {
  const { execucao, sinal, posicao, cfg, ops } = a
  const opts = a.opcoes
  const notas: string[] = []
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const preco = posicao.currentPrice
  if (preco == null || !(preco > 0)) return { notas, patch }

  const pip = tamanhoPip(sinal.symbol)
  const ref = posicao.openPrice
  const compra = sinal.direction === 'buy'
  const lucroPips = (compra ? preco - ref : ref - preco) / pip
  const riscoPips = execucao.sl ? Math.abs(ref - execucao.sl) / pip : 0

  if (lucroPips > execucao.pico_pips) patch.pico_pips = Math.round(lucroPips * 10) / 10

  // ── Alvos: realiza a fatia de cada um ──────────────────────────────────────
  const proximo = execucao.saidas_feitas + 1
  const alvo = sinal.tps[proximo - 1]
  const volumeAtual = posicao.volume ?? 0
  if (alvo != null && volumeAtual > 0) {
    const tocou = compra ? preco >= alvo : preco <= alvo
    if (tocou) {
      const pct = opts.saidasPct[proximo - 1] ?? 100
      const ultimo = proximo >= sinal.tps.length
      const querido = arredondarLote((execucao.lote ?? volumeAtual) * (pct / 100))
      const podePartir = querido < volumeAtual - 1e-9
      if (ultimo || !podePartir) {
        if (ultimo) {
          const r = await ops.fechar(posicao.id)
          if (trocouBem(r)) {
            notas.push(`${sinal.symbol}: alvo final · +${lucroPips.toFixed(0)}p`)
            patch.estado = 'closed'
            patch.saidas_feitas = proximo
          }
        } else {
          patch.saidas_feitas = proximo
          notas.push(`${sinal.symbol}: alvo ${proximo} sem lote para partir → segue com o stop protegido`)
        }
      } else {
        const r = await ops.fechar(posicao.id, querido)
        if (trocouBem(r)) {
          ops.esquecer()
          patch.saidas_feitas = proximo
          notas.push(`${sinal.symbol}: alvo ${proximo} · fecha ${pct}%`)
          await ops.avisar({
            titulo: `${sinal.symbol} · TP${proximo} hit`,
            corpo: `${pct}% of the position closed. The rest keeps running.`,
            tag: `tp-${execucao.id}`,
            unica: `tp${proximo}:${execucao.id}`,
          })
        }
      }
    }
  }

  // ── Proteção e trailing (correm sempre: protegem, não decidem saídas) ─────────
  const gatilho = opts.trailingArrancaPips ?? (riscoPips > 0 ? cfg.beRacio * riscoPips : Infinity)
  if (lucroPips >= gatilho && (opts.beAtivo || opts.trailingAtivo)) {
    const piso = precoBE(ref, sinal.direction, sinal.symbol, cfg.beBufferPips)

    let precoTrail = preco
    if (opts.trailingTempoReal && ops.precoAoVivo) {
      const vivo = await ops.precoAoVivo(posicao.symbol)
      if (vivo != null) precoTrail = vivo
    }

    const distancia = (opts.trailingDistanciaPips && opts.trailingDistanciaPips > 0
      ? opts.trailingDistanciaPips
      : (riscoPips > 0 ? cfg.trailRacio * riscoPips : lucroPips / 2)) * pip
    const candidato = compra ? precoTrail - distancia : precoTrail + distancia
    const alvoSl = precoDaCorretora(
      opts.trailingAtivo ? (compra ? Math.max(candidato, piso) : Math.min(candidato, piso)) : piso,
      sinal.symbol,
    )!
    const atual = execucao.trailing_sl ?? posicao.stopLoss ?? null
    const passo = (opts.trailingPassoPips && opts.trailingPassoPips > 0 ? opts.trailingPassoPips : 0.5) * pip
    const melhora = atual == null ? true : compra ? alvoSl > atual + passo : alvoSl < atual - passo
    if (melhora) {
      const r = await ops.modificar(posicao.id, alvoSl, posicao.takeProfit ?? null)
      if (trocouBem(r)) {
        const primeiraVez = execucao.trailing_sl == null
        patch.trailing_sl = alvoSl
        notas.push(`${sinal.symbol}: stop → ${alvoSl} (${lucroPips.toFixed(0)}p de lucro)`)
        if (primeiraVez) {
          await ops.avisar({
            titulo: `${sinal.symbol} · risk removed`,
            corpo: `Stop moved to break-even at ${alvoSl.toFixed(5)}. This trade can no longer lose.`,
            tag: `be-${execucao.id}`,
            unica: `be:${execucao.id}`,
          })
        }
      }
    }
  }

  return { notas, patch }
}

// ── Espelho das saídas do educador (a conta, sem IO) ──────────────────────────────────────────

export interface EstadoDoEducadorMin {
  aberta: boolean
  fracaoRestante: number
}

export type DecisaoEspelho =
  | { tipo: 'nada' }
  /** O educador fechou: fecha tudo (volume undefined = sem volume conhecido, fecha a posição toda). */
  | { tipo: 'fechar_tudo'; volume: number | undefined }
  | { tipo: 'parcial'; volume: number; porCopiar: number; eleFechou: number }

/** Proporção, nunca o lote; <5% ignora-se; nunca mais do que está aberto; sem volume aberto não há parcial. */
export function decidirEspelho(a: {
  educador: EstadoDoEducadorMin
  abertoNoCliente: number
  loteOriginalCliente: number
  jaEspelhado: number
}): DecisaoEspelho {
  if (!a.educador.aberta) return { tipo: 'fechar_tudo', volume: a.abertoNoCliente || undefined }
  const eleFechou = 1 - a.educador.fracaoRestante
  const porCopiar = eleFechou - a.jaEspelhado
  if (porCopiar < 0.05) return { tipo: 'nada' }
  const aFechar = Math.round(a.loteOriginalCliente * porCopiar * 100) / 100
  if (!(aFechar >= 0.01)) return { tipo: 'nada' }
  if (!(a.abertoNoCliente > 0)) return { tipo: 'nada' }
  return { tipo: 'parcial', volume: Math.min(aFechar, a.abertoNoCliente), porCopiar, eleFechou }
}
