/**
 * Capital e equity nas listas de contas — o MESMO formato em todo o lado.
 *
 * O problema (print do dono, 27/10): «10 020,10 $» partia em duas linhas na coluna estreita (o «$»
 * caía sozinho para baixo) e «1000,00» vinha sem separador ao lado de «10 000,00», porque o pt-PT só
 * agrupa a partir de 5 dígitos. Aqui o separador dos milhares é SEMPRE um espaço que não parte
 * (U+00A0), também antes do «$», e o número sai sempre com 2 casas. A célula leva `whitespace-nowrap`
 * na mesma — o texto já não tem onde partir, mas a classe diz a intenção a quem ler o JSX.
 */

const NBSP = ' '

/** «10 020,10» · «1 000,00» · «−25,40». null/NaN → «—». */
export function fmtValor(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const [int, dec] = Math.abs(v).toFixed(casas).split('.')
  const agrupado = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return `${v < 0 && Number(Math.abs(v).toFixed(casas)) !== 0 ? '−' : ''}${agrupado}${dec ? `,${dec}` : ''}`
}

/** «10 020,10 $» — o valor e a moeda nunca se separam. */
export function fmtDinheiro(v: number | null | undefined, moeda = '$', casas = 2): string {
  const s = fmtValor(v, casas)
  return s === '—' ? s : `${s}${NBSP}${moeda}`
}

/** «+20,10» / «−4,43»: o flutuante (equity − capital). */
export function fmtFlutuante(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${fmtValor(v, casas)}`
}
