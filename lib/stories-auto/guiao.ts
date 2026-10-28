import { peneira } from '@/lib/marketing/regras'

/**
 * Guião semanal dos stories com storytelling do @morethanmoney.pt (pedido do Ricardo a 28/10).
 *
 * Usa o desenho da peça «historia» de `video/stories-mtm` (7 cenas): o herói é quem vê e a MTM é
 * o guia. Dor → «o problema não és tu» → guia → plano → transformação → CTA. A IA só escreve as
 * palavras; a estrutura e os elementos reais (educadores, scanners, flyer da semana) vêm do
 * motor. Números de desempenho nunca saem da IA: a única prova é o flyer auditado da semana,
 * que o Mac descarrega de /api/flyer/weekly.
 */

/** Um ângulo por semana, para a série não se repetir. */
export const ANGULOS = [
  'o fim do dia de trabalho e o mês que não chega ao fim',
  'quem já tentou aprender sozinho com vídeos soltos e grupos de sinais',
  'o medo de perder dinheiro e a falta de regras de risco',
  'não ter tempo: trabalho, família, e o mercado aberto o dia todo',
  'saltar de guru em guru sem nunca ter um método',
  'a diferença entre olhar para o ecrã o dia inteiro e receber alertas',
]

export const FALAS_IDS = ['h01', 'h02', 'h03', 'h04', 'h05', 'h06', 'h07'] as const

export interface TextosHistoria {
  hora: string
  hook: [string, string]
  caos: string[]
  sozinho: [string, string]
  naoes: [string, string]
  falta: [string, string]
  casa: [string, string]
  edu: [string, string][]
  caminho: string
  passos: [string, string, string]
  min: [string, string]
  regras: [string, string, string]
  metodo: string
  responde: string
  cta: string
  depois: string
  url: string
  aviso: string
  /** Legenda curta da prova real (flyer da semana) — o Mac põe a imagem. */
  prova?: string
}

export interface GuiaoSemana {
  semana: string
  angulo: string
  falas: Record<(typeof FALAS_IDS)[number], string>
  textos: TextosHistoria
}

export const AVISO =
  'Conteúdo educativo, não constitui consultoria financeira. Trading envolve risco de perda; resultados não garantidos.'

/** Partes que não mudam: educadores reais, passos reais do onboarding, CTA e aviso. */
const FIXO = {
  casa: ['UMA SÓ', 'CASA'] as [string, string],
  edu: [
    ['Ricardo Garcia', 'Trading · Scanners'],
    ['Ruben Pereira', 'Cripto'],
    ['Maria Costa', 'Negócio digital'],
  ] as [string, string][],
  caminho: 'O CAMINHO',
  passos: ['Abres a conta na corretora', 'Ligas os alertas dos scanners', 'Aprendes nas aulas ao vivo'] as [string, string, string],
  responde: 'RESPONDE A ESTE STORY',
  cta: 'QUERO',
  depois: 'e mandamos-te o primeiro passo',
  url: 'morethanmoney.pt/onboarding',
  aviso: AVISO,
  prova: 'Resultados reais da semana passada · em pips · fonte: canais MTM',
}

export const SISTEMA_GUIAO =
  'Escreves o guião de uma sequência de stories de Instagram para a MoreThanMoney (educação em trading, Portugal). ' +
  'Storytelling que vende: o herói é quem vê, a MoreThanMoney é o guia. Português de Portugal, tratamento por tu.\n\n' +
  'Regras duras:\n' +
  '· Nunca inventes números de desempenho, percentagens, valores em euros, nem histórias pessoais do Ricardo ou de alunos.\n' +
  '· Nunca prometas ganhos, rendimento, liberdade financeira ou resultados.\n' +
  '· Não nomeies plataformas de cursos nem outras empresas.\n' +
  '· Frases curtas, faladas, sem travessões.\n\n' +
  'Devolve SÓ JSON com estas chaves:\n' +
  '{"falas":{"h01":"…","h02":"…","h03":"…","h04":"…","h05":"…","h06":"…","h07":"…"},' +
  '"hora":"HH:MM","hook":["2 a 4 palavras","2 a 5 palavras"],"caos":["5 notificações curtas, 2 a 4 palavras cada"],' +
  '"sozinho":["…","…"],"naoes":["O PROBLEMA","NÃO ÉS TU."],"falta":["frase curta","frase curta"],' +
  '"min":["15","MINUTOS POR DIA"],"regras":["3 regras de risco curtas"],"metodo":"2 palavras"}\n\n' +
  'Falas (narração, 1 a 2 frases cada, máximo 160 caracteres): h01 gancho com uma cena do dia a dia; ' +
  'h02 a dor; h03 tira a culpa a quem vê; h04 apresenta a MoreThanMoney como casa de educadores, com o Ricardo Garcia; ' +
  'h05 os três passos: abrir a conta na corretora, ligar os alertas dos scanners, aprender nas aulas ao vivo; ' +
  'h06 quinze minutos por dia com regras de risco, sem promessas; h07 exactamente «Responde QUERO a este story e mandamos-te o primeiro passo.»\n' +
  'Os textos do ecrã (hook, sozinho, metodo) vão em MAIÚSCULAS.'

export function pedidoGuiao(angulo: string): string {
  return `Ângulo desta semana: ${angulo}.`
}

/** Semana ISO de Lisboa (AAAA-Www) — chave do guião. */
export function semanaDeLisboa(d: Date = new Date()): string {
  const [a, m, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .split('-')
    .map(Number)
  const t = new Date(Date.UTC(a, m - 1, dia))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const n = Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(n).padStart(2, '0')}`
}

export function anguloDaSemana(semana: string): string {
  const n = Number(semana.slice(-2)) || 0
  return ANGULOS[n % ANGULOS.length]
}

const PROMESSA = /(garant|lucro|rendiment|ficar rico|dinheiro f[aá]cil|liberdade financeira|ganhar? dinheiro|\d+\s?(%|€|\$|euros?|pips?))/i

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/[—–]/g, ',').slice(0, max) : '')
const lista = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => txt(x, max)) : [])

/**
 * Monta e valida o guião a partir do JSON da IA. Devolve os problemas em vez de lançar: quem
 * chama tenta outra vez com eles no pedido.
 */
export function montarGuiao(semana: string, angulo: string, bruto: any): { guiao?: GuiaoSemana; problemas: string[] } {
  const problemas: string[] = []
  const falas = {} as GuiaoSemana['falas']
  for (const id of FALAS_IDS) {
    if (id === 'h07') continue
    const f = txt(bruto?.falas?.[id], 180)
    if (f.length < 8) problemas.push(`fala ${id} vazia`)
    falas[id] = f
  }
  falas.h07 = 'Responde QUERO a este story e mandamos-te o primeiro passo.'
  const textos: TextosHistoria = {
    ...FIXO,
    hora: /^\d{1,2}:\d{2}$/.test(txt(bruto?.hora, 5)) ? txt(bruto.hora, 5) : '18:00',
    hook: lista(bruto?.hook, 2, 40) as [string, string],
    caos: lista(bruto?.caos, 5, 32),
    sozinho: lista(bruto?.sozinho, 2, 30) as [string, string],
    naoes: ['O PROBLEMA', 'NÃO ÉS TU.'],
    falta: lista(bruto?.falta, 2, 40) as [string, string],
    min: ['15', 'MINUTOS POR DIA'],
    regras: lista(bruto?.regras, 3, 40) as [string, string, string],
    metodo: txt(bruto?.metodo, 20) || 'COM MÉTODO.',
  }
  if (textos.hook.length < 2 || textos.hook.some((h) => !h)) problemas.push('hook incompleto')
  if (textos.caos.length < 3) problemas.push('poucas notificações em caos')
  if (textos.sozinho.length < 2) problemas.push('sozinho incompleto')
  if (textos.falta.length < 2) problemas.push('falta incompleto')
  if (textos.regras.length < 3) problemas.push('menos de 3 regras')
  const tudo = [...Object.values(falas), textos.hook, textos.caos, textos.sozinho, textos.falta, textos.regras, textos.metodo].flat().join(' \n ')
  const promessa = tudo.match(PROMESSA)
  if (promessa) problemas.push(`promessa ou número («${promessa[0]}»)`)
  for (const p of peneira(`${tudo}\n${AVISO}`)) problemas.push(p)
  return problemas.length ? { problemas } : { guiao: { semana, angulo, falas, textos }, problemas }
}

/** Hora a que os 3 stories saem: 19:00 de Lisboa do próprio dia, ou do seguinte se já passou das 17:00. */
export function horasDosStories(agora: Date = new Date()): string[] {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(agora))
  const dia = new Date(agora.getTime() + (hora >= 17 ? 86400000 : 0))
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dia)
  // 19:00 em Lisboa: descobre-se o desvio de Lisboa nesse dia (0 no inverno, +1 no verão).
  const meioDia = new Date(`${ymd}T12:00:00Z`)
  const hLisboa = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(meioDia))
  const desvio = hLisboa - 12
  return [0, 1, 2].map((i) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), 19 - desvio, i)).toISOString())
}
