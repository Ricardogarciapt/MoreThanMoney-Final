/**
 * Notas do Estúdio (ideia do OpenCut-AI «Virality Score» e «A/B Hook Testing», MIT), sem IA e sem
 * custo: regras medidas no próprio texto e no take. Servem para comparar versões, não prometem
 * alcance. Sinais alinhados com as skills de ganchos (lib/conteudo/ganchos.ts).
 */
import { verificarTexto } from '@/lib/conteudo-magnetico/regras'
import { ehBengala, duracaoCortada, type Corte, type Palavra } from './texto'

export type Sinal = { id: string; nome: string; nota: number; dica: string }
export type Nota = { nota: number; sinais: Sinal[] }

const palavrasDe = (t: string) => t.trim().split(/\s+/).filter(Boolean)
const media = (s: Sinal[]) => Math.round(s.reduce((a, x) => a + x.nota, 0) / Math.max(1, s.length))

/** Nota de um gancho (0–100) por 5 sinais. */
export function notaGancho(texto: string): Nota {
  const t = texto.trim()
  const n = palavrasDe(t).length
  const baixo = t.toLowerCase()
  const sinais: Sinal[] = [
    {
      id: 'curto', nome: 'Curto',
      nota: n === 0 ? 0 : n <= 8 ? 100 : n <= 12 ? 80 : n <= 16 ? 45 : 15,
      dica: 'Até 12 palavras: tem de caber nos primeiros 2 segundos.',
    },
    {
      id: 'tensao', nome: 'Tensão',
      nota: /\?|\bnão\b|\bpára\b|\bnunca\b|\bninguém\b|\berrad|\bmentira|\bverdade\b|\bse\b/.test(baixo) ? 100 : 40,
      dica: 'Pergunta, negação ou contrário abrem uma dúvida que só o vídeo fecha.',
    },
    {
      id: 'concreto', nome: 'Concreto',
      nota: /\d|minuto|segundo|dia|semana|regra|erro|passo/.test(baixo) ? 100 : 50,
      dica: 'Um detalhe concreto (tempo, regra, erro) pesa mais do que uma ideia vaga.',
    },
    {
      id: 'tu', nome: 'Fala contigo',
      nota: /\b(tu|te|ti|teu|tua|teus|tuas|contigo|fazes|tens|perdes|sabes|precisas|estás)\b/.test(baixo) ? 100 : /\b(eu|me|mim|meu|minha)\b/.test(baixo) ? 75 : 45,
      dica: 'Fala para quem vê («tu») ou conta algo teu («eu»).',
    },
    {
      id: 'regras', nome: 'Regras da casa',
      nota: verificarTexto(t).length ? 0 : /^(olá|ola|bom dia|boa tarde|hoje vou|neste vídeo)/i.test(t) ? 20 : 100,
      dica: 'Sem saudação, sem promessas, sem números de resultados.',
    },
  ]
  return { nota: media(sinais), sinais }
}

/** Nota de um reel editado pelo texto (0–100) por 7 sinais, à imagem do OpenCut. */
export function notaReel(e: {
  palavras: Palavra[]
  riscadas: Set<number>
  cortes: Corte[]
  duracaoBruto: number
  palavraChave?: string | null
  legendas: boolean
  ativos: number
}): Nota {
  const vivas = e.palavras.filter((_, i) => !e.riscadas.has(i))
  const dur = Math.max(0, e.duracaoBruto - duracaoCortada(e.cortes))
  const ritmo = dur > 0 ? vivas.length / dur : 0
  const bengalas = vivas.filter((p) => ehBengala(p.w) === 'som').length
  let pausaMax = 0
  // pausas que sobram depois dos cortes (aproximação: gaps entre palavras vivas fora das zonas)
  for (let i = 1; i < vivas.length; i++) {
    const a = vivas[i - 1].fim
    const b = vivas[i].ini
    const cortado = e.cortes.filter((c) => c.ini < b && c.fim > a).reduce((s, c) => s + Math.min(c.fim, b) - Math.max(c.ini, a), 0)
    pausaMax = Math.max(pausaMax, b - a - cortado)
  }
  const gancho = vivas.slice(0, 14).map((p) => p.w).join(' ')
  const fim = vivas.slice(-25).map((p) => p.w.toLowerCase()).join(' ')
  const chave = (e.palavraChave || '').toLowerCase().trim()
  const sinais: Sinal[] = [
    { id: 'gancho', nome: 'Gancho', nota: gancho ? notaGancho(gancho.split(/[.!?]/)[0] || gancho).nota : 0, dica: 'A primeira frase decide se ficam.' },
    { id: 'duracao', nome: 'Duração', nota: dur >= 15 && dur <= 45 ? 100 : dur >= 8 && dur <= 60 ? 65 : 30, dica: 'Entre 15 e 45 segundos.' },
    { id: 'ritmo', nome: 'Ritmo', nota: ritmo >= 2.6 ? 100 : ritmo >= 2.2 ? 80 : ritmo >= 1.8 ? 55 : 30, dica: 'Corta pausas e frases longas: ~2,5 palavras por segundo.' },
    { id: 'pausas', nome: 'Sem pausas', nota: pausaMax <= 0.5 ? 100 : pausaMax <= 0.9 ? 60 : 25, dica: 'Nenhuma pausa acima de meio segundo.' },
    { id: 'bengalas', nome: 'Sem bengalas', nota: bengalas === 0 ? 100 : bengalas <= 2 ? 60 : 20, dica: 'Tira «ãh», «hum», «eh».' },
    { id: 'cta', nome: 'Pedido no fim', nota: chave && fim.includes(chave) ? 100 : /coment|guarda|segue|link|escreve/.test(fim) ? 60 : 20, dica: 'Diz a palavra-chave do funil nos últimos segundos.' },
    { id: 'visual', nome: 'Visual', nota: (e.legendas ? 50 : 0) + Math.min(50, e.ativos * 20), dica: 'Legendas e pelo menos 2 ativos/planos de apoio.' },
  ]
  return { nota: media(sinais), sinais }
}
