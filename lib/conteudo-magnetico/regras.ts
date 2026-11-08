/**
 * MTM CONTEÚDO MAGNÉTICO — as regras que nenhum guião passa sem cumprir.
 *
 * São regras do dono (memória do projecto, 24/10 e 26/10), não gosto de quem escreveu o prompt:
 *   · nunca citar Jifu, Golden Era, Trendwave nem KillShot;
 *   · nada de taxas de acerto inventadas nem promessas de lucro;
 *   · nomes de produtos, scanners, educadores e cursos NÃO se traduzem;
 *   · disclaimer educativo em tudo o que fala de trading.
 *
 * O prompt pede isto à IA, mas a IA não é de confiança: o que ela devolve passa SEMPRE por
 * `verificarTexto` antes de chegar ao ecrã. Puro e sem dependências, para a guarda
 * `regras.check.ts` o provar sem rede.
 */
import { verificarPtPt } from '@/lib/pt-pt'

/** Nomes que não aparecem. Nem para dizer mal — o ângulo anti-MLM fala do modelo, não de empresas. */
export const NOMES_PROIBIDOS = ['Jifu', 'Golden Era', 'Trendwave', 'Trend Wave', 'KillShot', 'Kill Shot', 'Akashx', 'Iqonic'] as const

/** Nomes que ficam como estão, em qualquer língua. */
export const NOMES_INTOCAVEIS = [
  'MoreThanMoney',
  'More Than Money',
  'MTM Auto',
  'MTM Funded',
  'MTM Premium',
  'MTM Scanner',
  'GoldKiller',
  'Sensei EA',
  'Sensei Scalp',
  'TrendShot',
  'DEFY',
  'RocketNova',
  'SniperPro',
  'Aurum Flow',
  'Tap to Trade',
  'WebTrader',
  'PU Prime',
  'She Is Faceless',
  'She Is Studio',
  'She Is Daily',
] as const

export const DISCLAIMER_PT = 'Conteúdo educativo. Não constitui consultoria financeira. Resultados não garantidos.'
export const DISCLAIMER_EN = 'Educational content. Not financial advice. Results are not guaranteed.'

export type Problema = { tipo: 'nome_proibido' | 'taxa_acerto' | 'promessa' | 'brasileirismo'; trecho: string }

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const PADROES_TAXA: RegExp[] = [
  // «87% de acerto», «win rate de 90%», «taxa de acerto 80 %», «90% winrate», «accuracy 85%»
  /\d{1,3}(?:[.,]\d+)?\s?%\s*(?:de\s+)?(?:acerto|acertos|win\s?rate|winrate|precis[ãa]o|accuracy|assertividade|vit[óo]rias)/i,
  /(?:taxa\s+de\s+acerto|win\s?rate|winrate|assertividade|accuracy|precis[ãa]o)\D{0,12}\d{1,3}(?:[.,]\d+)?\s?%/i,
]

const PADROES_PROMESSA: RegExp[] = [
  /lucros?\s+garantid/i,
  /garant(?:e|imos|ido|ida|ia)\s+(?:de\s+)?(?:lucro|ganho|rendimento|retorno|dinheiro)/i,
  /ganh(?:a|as|ar|e)\s+(?:at[ée]\s+)?\d[\d.,\s]*\s?(?:€|eur|euros|\$|usd|d[óo]lares)\s*(?:por|\/|ao|a)\s*(?:dia|semana|m[êe]s)/i,
  /\d[\d.,\s]*\s?(?:€|eur|euros|\$|usd)\s*(?:por|\/|ao|a)\s*(?:dia|semana|m[êe]s)\s+garantid/i,
  /rendimento\s+(?:fixo|garantido|passivo\s+garantido)/i,
  /sem\s+risco/i,
  /risco\s+zero/i,
  /dinheiro\s+f[áa]cil/i,
  /fica(?:r|s)?\s+rico/i,
  /guaranteed\s+(?:profit|returns?|income)/i,
  /risk[-\s]free/i,
]

/** Lista os problemas de um texto. Vazio = passa. */
export function verificarTexto(texto: string): Problema[] {
  const t = String(texto || '')
  const out: Problema[] = []
  for (const nome of NOMES_PROIBIDOS) {
    const m = t.match(new RegExp(`\\b${escapar(nome)}\\b`, 'i'))
    if (m) out.push({ tipo: 'nome_proibido', trecho: m[0] })
  }
  for (const re of PADROES_TAXA) {
    const m = t.match(re)
    if (m) out.push({ tipo: 'taxa_acerto', trecho: m[0] })
  }
  for (const re of PADROES_PROMESSA) {
    const m = t.match(re)
    if (m) out.push({ tipo: 'promessa', trecho: m[0] })
  }
  // Português de Portugal: o que `corrigirPtPt` não troca sozinho (você, a gente, «Me diz»…).
  for (const b of verificarPtPt(t)) out.push({ tipo: 'brasileirismo', trecho: `${b.trecho} (${b.sugestao})` })
  return out
}

/** Todas as strings de um objecto qualquer (o guião inteiro), para verificar de uma vez. */
export function textosDe(obj: unknown, acc: string[] = []): string[] {
  if (typeof obj === 'string') acc.push(obj)
  else if (Array.isArray(obj)) obj.forEach((x) => textosDe(x, acc))
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => textosDe(x, acc))
  return acc
}

export function verificarObjecto(obj: unknown): Problema[] {
  const vistos = new Set<string>()
  const out: Problema[] = []
  for (const s of textosDe(obj)) {
    for (const p of verificarTexto(s)) {
      const k = `${p.tipo}:${p.trecho.toLowerCase()}`
      if (vistos.has(k)) continue
      vistos.add(k)
      out.push(p)
    }
  }
  return out
}

/** As regras em texto, para o prompt. A mesma fonte que a verificação usa. */
export function regrasParaPrompt(): string {
  return [
    'REGRAS INEGOCIÁVEIS (o texto é verificado por código e rejeitado se as falhar):',
    `· Nunca menciones: ${NOMES_PROIBIDOS.join(', ')} — nem para criticar. O ângulo anti-pirâmide fala do MODELO, nunca de empresas ou pessoas pelo nome.`,
    '· Nunca escrevas taxas de acerto, win rates ou percentagens de resultado. Não inventes números de desempenho.',
    '· Nunca prometas lucro, rendimento, ganhos por dia/mês, «sem risco» ou «ficar rico».',
    `· Estes nomes ficam exactamente assim, em qualquer língua: ${NOMES_INTOCAVEIS.join(', ')}.`,
    '· Se o tema tocar em trading ou investimento, a legenda termina com o aviso educativo.',
  ].join('\n')
}
