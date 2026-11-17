/**
 * COMANDO DO «Montar com IA» do /estudio — o pedido em português, como o Ricardo o escreve:
 *   «Cria um reel do Ricardo em 3 planos, 15 s, gancho: Pagas demais por sinais?»
 * Devolve só o que o motor sabe fazer; o resto do texto é ignorado (nunca vai ao ffmpeg).
 *
 * E `reelCurto`: escolhe as frases do take até à duração pedida, sem pausas, e reparte-as
 * por N planos (aberto · médio · fechado), que é o ritmo «gancho → plano → take → plano».
 */
import type { Palavra } from './texto'

export type Comando = { segundos: number; planos: number; gancho: string | null; cenario: string | null }

const NUM: Record<string, number> = { dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, quinze: 15 }
const lerNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? NaN)

export function lerComando(texto: string | null | undefined): Comando {
  const t = String(texto ?? '').slice(0, 400)
  const pl = t.match(/(\d+|dois|duas|tr[eê]s|quatro|cinco|seis)\s*(planos|takes|cortes)/i)
  const sg = t.match(/(\d+|sete|quinze)\s*(s\b|seg|segundos)/i)
  const gc = t.match(/gancho\s*[:«"]\s*([^»"\n]{3,90})/i)
  const ce = t.match(/(?:num|no|em)\s+(est[uú]dio de podcast|escrit[oó]rio|palco|exterior|carro)/i)
  const planos = pl ? lerNum(pl[1]) : 3
  const segundos = sg ? lerNum(sg[1]) : 15
  return {
    planos: Math.min(6, Math.max(2, Number.isFinite(planos) ? planos : 3)),
    segundos: Math.min(60, Math.max(7, Number.isFinite(segundos) ? segundos : 15)),
    gancho: gc ? gc[1].trim() : null,
    cenario: ce ? ce[1].toLowerCase() : null,
  }
}

/** Enquadramentos por ordem: o gancho entra fechado, depois médio, aberto, e volta a fechar. */
export const ZOOM_PLANOS = [1.6, 1.28, 1, 1.6, 1.28, 1] as const

/**
 * Frases do take (partidas nas pausas ≥ 0,35 s e na pontuação), sem as zonas cortadas pelo
 * texto, até `segundos`; depois agrupadas em `planos` pedaços seguidos. Cada pedaço é uma zona
 * [ini, fim] do take com o zoom do seu plano.
 */
export function reelCurto(palavras: Palavra[], mantidas: { ini: number; fim: number }[], cmd: Comando) {
  const dentro = (p: Palavra) => mantidas.some((z) => p.ini >= z.ini - 0.05 && p.fim <= z.fim + 0.05)
  const ws = palavras.filter(dentro)
  const frases: Palavra[][] = []
  let f: Palavra[] = []
  ws.forEach((p, i) => {
    const prox = ws[i + 1]
    f.push(p)
    if (!prox || prox.ini - p.fim >= 0.35 || /[.?!]$/.test(p.w)) { frases.push(f); f = [] }
  })
  const escolhidas: Palavra[][] = []
  let total = 0
  for (const fr of frases) {
    const d = fr[fr.length - 1].fim - fr[0].ini + 0.1
    if (total > 0 && total + d > cmd.segundos + 1.5) break
    escolhidas.push(fr); total += d
    if (total >= cmd.segundos - 0.5) break
  }
  const n = Math.min(cmd.planos, Math.max(1, escolhidas.length))
  const grupos: Palavra[][][] = Array.from({ length: n }, () => [])
  escolhidas.forEach((fr, i) => grupos[Math.min(n - 1, Math.floor((i * n) / escolhidas.length))].push(fr))
  return grupos.flatMap((g, k) =>
    g.map((fr, j) => ({
      ini: Math.max(0, fr[0].ini - 0.05),
      fim: fr[fr.length - 1].fim + 0.05,
      zoom: ZOOM_PLANOS[k % ZOOM_PLANOS.length],
      entraPlano: j === 0,
    })),
  )
}
