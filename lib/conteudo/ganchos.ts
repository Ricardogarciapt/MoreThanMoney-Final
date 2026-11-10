/**
 * Ganchos e regras de legenda que todos os geradores de conteúdo da casa partilham.
 *
 * Adaptado (10/11) de duas skills MIT revistas para o estúdio: rediumvex/viral-hooks-skill
 * (100 fórmulas em 10 gatilhos) e Jakeschincariol/instagram-agent-skill (ig-reel, ig-caption,
 * ig-dm). Só as ideias: fórmulas reescritas em PT-PT para o nosso nicho, filtradas pelas regras
 * da casa (sem números inventados, sem promessas, sem nomear concorrentes).
 *
 * Guarda: `npx tsx lib/conteudo/ganchos.check.ts`.
 */

export type Gatilho =
  | 'curiosidade' | 'contrario' | 'autoridade' | 'emocao' | 'lista'
  | 'pergunta' | 'historia' | 'negacao' | 'especifico' | 'confissao'

export type Formula = { gatilho: Gatilho; modelo: string; exemplo: string }

/** Pára o dedo (primeiro segundo) vs. segura a atenção (até aos 7 s). */
export const PARA_DEDO: Gatilho[] = ['negacao', 'especifico', 'pergunta', 'contrario']
export const SEGURA: Gatilho[] = ['historia', 'confissao', 'emocao', 'curiosidade']

export const FORMULAS: Formula[] = [
  { gatilho: 'curiosidade', modelo: 'Ninguém te fala de [coisa inesperada] em [tema]', exemplo: 'Ninguém te fala do custo de entrar sem plano numa operação' },
  { gatilho: 'curiosidade', modelo: 'O custo escondido de [coisa popular]', exemplo: 'O custo escondido de seguir sinais sem perceber o porquê' },
  { gatilho: 'contrario', modelo: 'Pára de [conselho que toda a gente dá]', exemplo: 'Pára de procurar a estratégia perfeita' },
  { gatilho: 'contrario', modelo: '[Prática comum] está a fazer-te perder [coisa]', exemplo: 'Operar todos os dias está a fazer-te perder disciplina' },
  { gatilho: 'autoridade', modelo: 'Depois de [N anos/horas reais] a [fazer X], aprendi uma coisa', exemplo: 'Depois de anos a ensinar trading, aprendi uma coisa sobre o medo' },
  { gatilho: 'autoridade', modelo: 'Testei [coisa] durante [tempo real]. Isto foi o que vi', exemplo: 'Testei operar só 15 minutos por dia. Isto foi o que vi' },
  { gatilho: 'emocao', modelo: 'Se [dor concreta], isto é para ti', exemplo: 'Se trabalhas 40 horas e o dinheiro nunca chega, isto é para ti' },
  { gatilho: 'emocao', modelo: 'O dia em que percebi que [verdade incómoda]', exemplo: 'O dia em que percebi que o salário não me ia libertar' },
  { gatilho: 'lista', modelo: '[N] erros que [público] comete em [tema]', exemplo: '3 erros que quem começa no trading comete na primeira semana' },
  { gatilho: 'lista', modelo: '[N] coisas que eu faria se começasse do zero', exemplo: '3 coisas que eu faria se começasse hoje do zero' },
  { gatilho: 'pergunta', modelo: 'Sabes porque é que [problema comum] te acontece?', exemplo: 'Sabes porque é que fechas sempre a operação cedo demais?' },
  { gatilho: 'pergunta', modelo: 'E se [crença] estiver errada?', exemplo: 'E se precisares de menos capital do que pensas para aprender?' },
  { gatilho: 'historia', modelo: 'Há [tempo] eu [situação difícil]. Hoje [mudança sem números]', exemplo: 'Há uns anos eu não sabia ler um gráfico. Hoje ensino outros a fazê-lo' },
  { gatilho: 'historia', modelo: 'Um aluno disse-me isto e mudou a forma como ensino', exemplo: 'Um aluno disse-me isto e mudou a forma como ensino gestão de risco' },
  { gatilho: 'negacao', modelo: 'Não precisas de [requisito que assusta] para [objectivo]', exemplo: 'Não precisas de ser economista para perceber o mercado' },
  { gatilho: 'negacao', modelo: 'Isto não é [o que parece]. É [o que é]', exemplo: 'Isto não é um esquema. É um método com regras escritas' },
  { gatilho: 'especifico', modelo: 'A regra de [valor de risco concreto] que me protege', exemplo: 'A regra do 1% por operação que me protege dos dias maus' },
  { gatilho: 'especifico', modelo: '[Tempo curto] por dia: o que faço exactamente', exemplo: '15 minutos por dia: o que faço exactamente antes de abrir o gráfico' },
  { gatilho: 'confissao', modelo: 'Vou ser honesto: [erro meu]', exemplo: 'Vou ser honesto: durante anos operei com o coração' },
  { gatilho: 'confissao', modelo: 'O erro que me custou mais do que [coisa]', exemplo: 'O erro que me custou mais do que qualquer stop loss' },
]

/** Bloco para colar no prompt de sistema de qualquer gerador de conteúdo (reels, carrosséis, posts). */
export function blocoGanchos(): string {
  const por = (g: Gatilho[]) => FORMULAS.filter((f) => g.includes(f.gatilho)).map((f) => `· ${f.modelo} — ex.: «${f.exemplo}»`).join('\n')
  return [
    'GANCHOS (primeira linha / primeiros 2 segundos):',
    '- Até 12 palavras. Promete uma coisa concreta que o resto entrega. Nunca uma saudação.',
    '- Combina um gancho que PÁRA O DEDO (negação, específico, pergunta, contrário) com uma segunda frase que SEGURA (história, confissão, emoção, curiosidade).',
    '- Números só se vierem dos factos/notas; regras de risco (1% por operação, 15 min/dia) são permitidas. Nunca resultados nem promessas.',
    'Fórmulas que param o dedo:',
    por(PARA_DEDO),
    'Fórmulas que seguram:',
    por(SEGURA),
  ].join('\n')
}

/** Regras de legenda e de reel que valem em todo o lado. */
export function blocoLegendaReel(): string {
  return [
    'LEGENDA: 1.ª linha (até 125 caracteres) = gancho ou pedido, sem emoji no início. Parágrafos curtos. UM só pedido (comentar UMA palavra-chave em maiúsculas, sem espaços). Sem links na legenda. No máximo 5 hashtags específicas no fim (nada de #viral/#fyp). Escreve as expressões que alguém pesquisaria em texto corrido, não em hashtags.',
    'REEL: 0–2 s gancho (fala e texto no ecrã diferentes, com movimento); 2–7 s porque importa a quem vê; corpo com uma ideia por plano e o plano a mudar a cada 3–4 s; últimos 3 s entregam o que o gancho prometeu + o pedido; a última frase ecoa uma palavra do gancho (loop). 15 a 45 s.',
  ].join('\n')
}
