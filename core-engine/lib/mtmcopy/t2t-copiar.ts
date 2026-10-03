/**
 * TAP TO COPY — os PARÂMETROS de um sinal em texto que se cola no MT5 (ou noutra plataforma).
 *
 * Serve quem NÃO quer executar connosco mas quer replicar a trade à mão: símbolo, direcção,
 * entrada, stop e alvos, escritos sempre da mesma maneira. É um módulo PURO (sem imports de
 * servidor nem de React) de propósito — as duas superfícies que mostram sinais têm de dizer os
 * mesmos números pela mesma ordem:
 *   · o separador Tap to Trade da app-mobile (components/mobile/tap-to-trade-feed.tsx);
 *   · o /sinais da app MTM Auto (repo mtm-auto, lib/t2t-copiar.ts é o espelho deste ficheiro).
 *
 * Antes isto só existia para os PERPÉTUOS, dentro do modal, a ler o texto do sinal com expressões
 * regulares próprias. Fora dos perpétuos não havia maneira nenhuma de tirar os parâmetros da app
 * — copiava-se à mão do cartão, com os erros de transcrição que isso traz num campo de preço.
 */

/**
 * Um preço como se escreve — nunca com a precisão inventada de um indicador.
 *
 * Os scanners calculam stops a partir do ATR: o GoldKiller chegou a mandar 4452.9733242788, que
 * não é um preço que exista no ouro. Copiado assim para o MT5, é um preço que a corretora recusa.
 * A origem já arredonda; isto cobre o que ficou gravado antes e qualquer fonte nova que volte a
 * fazê-lo. É a MESMA regra do cartão — o que se copia tem de ser o que se lê.
 */
export function precoLegivel(v: number | string | null | undefined, simbolo: string): string {
  const n = Number(v)
  if (v == null || v === '' || !Number.isFinite(n)) return '—'
  const casas = /JPY|XAG|SILVER/i.test(simbolo)
    ? 3
    : /XAU|GOLD|BTC|ETH|SOL|XRP|NAS|US30|US500|GER|SPX|DOW/i.test(simbolo)
      ? 2
      : 5
  // `parseFloat` para não pôr zeros que ninguém escreveu: 4435.80 lê-se (e cola-se) 4435.8.
  return String(parseFloat(n.toFixed(casas)))
}

export interface ParametrosSinal {
  simbolo: string
  /** 'buy' / 'sell' (ou 'BUY' / 'COMPRA' / 'LONG'…). Null quando não se conseguiu ler. */
  direcao?: string | null
  /** Preço de entrada. Null + `mercado` a falso = não há nível escrito. */
  entrada?: number | string | null
  /** A entrada é a mercado (sem preço). */
  mercado?: boolean | null
  sl?: number | string | null
  tps?: Array<number | string | null | undefined> | null
}

export interface CampoCopiavel {
  rotulo: string
  valor: string
}

/** COMPRA / VENDA — o vocabulário do cartão, não o do parser. */
export function rotuloDirecao(d?: string | null): 'COMPRA' | 'VENDA' | null {
  const s = String(d ?? '').trim().toUpperCase()
  if (!s) return null
  if (/^(BUY|LONG|COMPRA|B)$/.test(s) || s === '🔵') return 'COMPRA'
  if (/^(SELL|SHORT|VENDA|S)$/.test(s) || s === '🔴') return 'VENDA'
  return null
}

const naoVazio = (v: unknown): boolean => v != null && v !== '' && Number.isFinite(Number(v))

/**
 * Os campos do sinal, um a um — é assim que se preenche uma ordem: campo a campo.
 *
 * Um campo só aparece quando existe: um sinal sem stop escrito não deve copiar «Stop loss: —»
 * para dentro de uma ordem.
 */
export function camposDoSinal(p: ParametrosSinal): CampoCopiavel[] {
  const campos: CampoCopiavel[] = []
  const sim = String(p.simbolo ?? '').trim()
  if (sim) campos.push({ rotulo: 'Símbolo', valor: sim })
  const dir = rotuloDirecao(p.direcao)
  if (dir) campos.push({ rotulo: 'Direção', valor: dir })
  if (naoVazio(p.entrada)) campos.push({ rotulo: 'Entrada', valor: precoLegivel(p.entrada, sim) })
  else if (p.mercado) campos.push({ rotulo: 'Entrada', valor: 'Mercado' })
  if (naoVazio(p.sl)) campos.push({ rotulo: 'Stop loss', valor: precoLegivel(p.sl, sim) })
  const tps = (p.tps ?? []).filter(naoVazio)
  tps.forEach((tp, i) => campos.push({ rotulo: `TP${i + 1}`, valor: precoLegivel(tp, sim) }))
  return campos
}

/**
 * O bloco inteiro, para colar de uma vez.
 *
 * Uma linha por parâmetro, `Rótulo: valor` — legível por uma pessoa e por qualquer plataforma que
 * se cole. Devolve string vazia quando não há nada de jeito para copiar (nem símbolo nem preços):
 * é melhor não haver botão do que copiar um texto que não serve para abrir nada.
 */
export function textoParaColar(p: ParametrosSinal): string {
  const campos = camposDoSinal(p)
  // Só símbolo e direcção não chegam para replicar uma trade — falta o preço.
  if (!campos.some((c) => c.rotulo === 'Entrada' || c.rotulo === 'Stop loss' || c.rotulo.startsWith('TP'))) return ''
  return campos.map((c) => `${c.rotulo}: ${c.valor}`).join('\n')
}

/**
 * Copia para a área de transferência. Devolve `false` quando o browser recusa (sem HTTPS, sem
 * permissão, webview antiga) — nesse caso quem chama mostra os campos para copiar à mão em vez de
 * fingir que correu bem.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (!texto) return false
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}
