/**
 * FONTE DE PREÇOS: O TERMINAL MT5 DO CONECTOR — a mais fresca que temos.
 *
 * O problema que resolve: hoje o motor vai BUSCAR preços por REST (Binance ~2 s, âncora do ouro
 * ~3 s, Yahoo ~3,5–4 s, TradeLocker ~2–3,5 s) e a TradeLocker não tem stream público de cotações,
 * por isso por aí nunca se chega à fluidez que o dono vê na app deles.
 *
 * O terminal MetaTrader não vai buscar nada: RECEBE os ticks da corretora. O EA MTMConector
 * publica uma fotografia de todos os símbolos do Market Watch de 50 em 50 ms num ficheiro, e isto
 * lê-a. Medido no VPS a 2026-09-23: idade do tick (hora da corretora → memória do motor) **p50
 * 94 ms, p95 127 ms**, contra os 2–4 s de hoje. Como é a mesma ligação que executa as ordens, o
 * preço que o motor vê é o preço da conta onde a ordem vai entrar.
 *
 * Lê o ficheiro directamente em vez de passar pela ponte: motor e terminais estão no mesmo VPS e
 * cada salto a mais é latência que não se recupera. A ponte serve quem está longe.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface OpcoesConectorTicks {
  /** o preço do principal para este símbolo está velho? (só então se injeta) */
  precisa: (sym: string) => boolean
  /**
   * `emMercado` é a HORA DA CORRETORA (`time_msc` do tick), não a da leitura: esta é a única das
   * nossas fontes de recurso que a sabe dizer ao milissegundo, e é por isso que é ela que abre o
   * caminho rápido do preenchimento (lib/mtmfunded/precos/preenchimento.ts).
   */
  injetar: (sym: string, bid: number, ask: number, em: number, emMercado: number | null, origem: string) => void
  log: (...a: unknown[]) => void
}

export interface FonteConectorTicks {
  parar(): void
  resumo(): { ticks: number; ligada: boolean; terminais: number; idadeP50Ms: number | null }
}

/**
 * Nome da corretora → nome canónico. Tira sufixos (`XAUUSD.s`, `EURUSD.pro`, `US30-STD`) e aplica
 * o mapa explícito do ambiente. Um sufixo mal tirado dava preço do instrumento errado, por isso
 * só se tira o que vem depois de um separador — nunca letras do próprio nome.
 */
export function canonizar(bruto: string, mapa: Map<string, string>): string {
  const s = bruto.trim().toUpperCase()
  const doMapa = mapa.get(s)
  if (doMapa) return doMapa
  const cortado = s.replace(/[.\-_+][A-Z0-9]{1,6}$/i, '')
  return mapa.get(cortado) ?? cortado
}

export function lerMapa(texto: string | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const par of (texto ?? '').split(',')) {
    const [de, para] = par.split(':').map((x) => x?.trim().toUpperCase())
    if (de && para) m.set(de, para)
  }
  return m
}

/** Uma fotografia do ficheiro de ticks, já canonizada. */
export function lerFotografia(
  bruto: string,
  mapa: Map<string, string>,
): Array<{ sym: string; bid: number; ask: number; em: number }> {
  let j: { p?: Array<{ s: string; b: number; a: number; t: number }> }
  try {
    j = JSON.parse(bruto)
  } catch {
    return []
  }
  const saida: Array<{ sym: string; bid: number; ask: number; em: number }> = []
  for (const p of j.p ?? []) {
    if (!p?.s || !(p.b > 0 || p.a > 0)) continue
    saida.push({ sym: canonizar(p.s, mapa), bid: p.b, ask: p.a, em: p.t })
  }
  return saida
}

export function iniciarFonteConectorMt5(o: OpcoesConectorTicks): FonteConectorTicks | null {
  // `CONECTOR_TICKS_RAIZES` = pastas raiz dos terminais, separadas por vírgula.
  const raizes = (process.env.CONECTOR_TICKS_RAIZES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!raizes.length || process.env.CONECTOR_TICKS === '0') return null

  const trabalho = process.env.CONECTOR_TICKS_TRABALHO ?? 'mtm-conector'
  const ritmoMs = Number(process.env.CONECTOR_TICKS_MS ?? 25)
  // Por omissão respeita o `precisa()` como as outras fontes de recurso. A 1, manda sempre —
  // é o que se liga depois de comparar, porque este preço É o da corretora onde negociamos.
  const prioritario = process.env.CONECTOR_TICKS_PRIORIDADE === '1'
  const mapa = lerMapa(process.env.CONECTOR_TICKS_MAPA)
  const ficheiros = raizes.map((r) => path.join(r, 'MQL5', 'Files', trabalho, 'ticks.json'))

  let ticks = 0
  let ligada = false
  const ultimo = new Map<string, number>()   // símbolo → time_msc do último tick entregue
  const idades: number[] = []

  const relogio = setInterval(() => {
    void (async () => {
      for (const f of ficheiros) {
        let bruto: string
        try {
          bruto = await fs.readFile(f, 'utf8')
        } catch {
          continue
        }
        ligada = true
        for (const t of lerFotografia(bruto, mapa)) {
          // A fotografia repete-se entre leituras: só o tick NOVO conta.
          if (ultimo.get(t.sym) === t.em) continue
          ultimo.set(t.sym, t.em)
          if (!prioritario && !o.precisa(t.sym)) continue
          ticks++
          if (idades.length < 5000) idades.push(Date.now() - t.em)
          // `t.em` é o `time_msc` do tick na corretora: serve de carimbo E de hora de mercado.
          o.injetar(t.sym, t.bid, t.ask, t.em, t.em, 'conector-mt5')
        }
      }
    })()
  }, Math.max(5, ritmoMs))
  relogio.unref?.()

  o.log(
    `[conector-mt5] ticks de ${ficheiros.length} terminal(is) a cada ${ritmoMs} ms` +
      (prioritario ? ' (PRIORITÁRIO)' : ' (só quando o principal está velho)'),
  )

  return {
    parar: () => clearInterval(relogio),
    resumo: () => {
      const ord = [...idades].sort((a, b) => a - b)
      return {
        ticks,
        ligada,
        terminais: ficheiros.length,
        idadeP50Ms: ord.length ? ord[Math.floor(ord.length / 2)] : null,
      }
    },
  }
}
