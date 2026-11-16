/**
 * «Pedir análise ao meu negócio» do /solucoes: o equivalente ao relatório que a NILG.ai fez à MTM.
 *
 * Tudo aqui é puro (sem base de dados nem rede), para a guarda testar:
 *  · validarPedidoAnalise: o que entra do formulário, limpo e com limites;
 *  · relatorioBase: o relatório preliminar, calculado só com o simulador e as áreas da casa.
 *    É sempre entregue, mesmo sem IA;
 *  · promptLeitura + limparLeitura: o parágrafo e as ideias que a IA (grátis primeiro) escreve
 *    sobre ESTE negócio. A IA não pode trazer números: tudo o que tiver algarismos é cortado,
 *    porque os únicos números do relatório são os do simulador, com os pressupostos à vista.
 */
import { AREAS, PRESSUPOSTOS, SECTORES, TAREFAS, simular, type Simulacao } from '@/lib/site-solucoes/automacao'

export const EQUIPAS = ['Só eu', '2 a 5 pessoas', '6 a 15 pessoas', 'Mais de 15'] as const
export type Equipa = (typeof EQUIPAS)[number]

export interface EntradaAnalise {
  nome?: unknown
  email?: unknown
  telefone?: unknown
  empresa?: unknown
  site?: unknown
  equipa?: unknown
  dores?: unknown
  sector?: unknown
  horas?: unknown
  custoHora?: unknown
  consentimento?: unknown
  /** Honeypot: humanos não o vêem. */
  website?: unknown
}

export interface PedidoAnalise {
  nome: string
  email: string
  telefone: string | null
  empresa: string
  site: string | null
  equipa: Equipa
  dores: string
  sector: string
  horas: Record<string, number>
  custoHora: number
}

export type ValidacaoAnalise =
  | { ok: true; pedido: PedidoAnalise }
  | { ok: false; descartar: true }
  | { ok: false; descartar?: false; erros: Record<string, string> }

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function validarPedidoAnalise(e: EntradaAnalise): ValidacaoAnalise {
  if (String(e.website ?? '').trim()) return { ok: false, descartar: true }
  const erros: Record<string, string> = {}

  const nome = txt(e.nome, 80)
  if (nome.length < 2) erros.nome = 'Diz-nos o teu nome.'
  const email = txt(e.email, 120).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'Precisamos de um email válido para te enviar a análise.'
  const telLimpo = String(e.telefone ?? '').replace(/[^\d+]/g, '').slice(0, 16)
  const telefone = telLimpo.replace(/\D/g, '').length >= 9 ? telLimpo : null
  const empresa = txt(e.empresa, 100)
  if (empresa.length < 2) erros.empresa = 'Como se chama o negócio?'
  const siteCru = txt(e.site, 160)
  const site = siteCru && /^[\w\-.:/@?=&%#~+]+$/.test(siteCru) ? siteCru : null
  const equipa = EQUIPAS.includes(e.equipa as Equipa) ? (e.equipa as Equipa) : null
  if (!equipa) erros.equipa = 'Escolhe o tamanho da equipa.'
  const dores = String(e.dores ?? '').trim().slice(0, 1500)
  if (dores.length < 15) erros.dores = 'Conta-nos em duas frases o que mais te rouba tempo.'
  const sector = SECTORES.some((s) => s.id === e.sector) ? String(e.sector) : SECTORES[0].id
  if (e.consentimento !== true) erros.consentimento = 'Precisamos da tua autorização para te responder.'

  const horas: Record<string, number> = {}
  if (e.horas && typeof e.horas === 'object') {
    for (const [id, v] of Object.entries(e.horas as Record<string, unknown>)) {
      const n = Number(v)
      if (TAREFAS[id] && Number.isFinite(n) && n > 0) horas[id] = Math.min(n, 40)
    }
  }
  const ch = Number(e.custoHora)
  const custoHora = Number.isFinite(ch) && ch > 0 ? Math.min(ch, 200) : PRESSUPOSTOS.custoHoraOmissao

  if (Object.keys(erros).length || !equipa) return { ok: false, erros }
  return { ok: true, pedido: { nome, email, telefone, empresa, site, equipa, dores, sector, horas, custoHora } }
}

export interface Oportunidade {
  area: string
  horasAno: number
  implementamos: string
  exemplos: string[]
  oferta: string
}

export interface RelatorioAnalise {
  empresa: string
  sector: string
  resumo: string
  totais: { horasSemana: number; recuperaveisSemana: number; recuperaveisAno: number; eurosAno: number; pessoas: number }
  oportunidades: Oportunidade[]
  primeiros30Dias: string[]
  perguntas: string[]
  pressupostos: string
  /** Escrita pela IA sobre este negócio. Vazia se a IA falhou: o resto do relatório chega na mesma. */
  leitura: string
  ideias: string[]
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function relatorioBase(p: PedidoAnalise): { relatorio: RelatorioAnalise; sim: Simulacao } {
  const sector = SECTORES.find((s) => s.id === p.sector) ?? SECTORES[0]
  const sim = simular(p.horas, p.custoHora)
  const top = sim.prioridades.slice(0, 3)
  const oportunidades: Oportunidade[] = top.map((t) => ({
    area: t.area.titulo,
    horasAno: Math.round(t.horasAno),
    implementamos: t.area.implementamos,
    exemplos: t.area.exemplos.slice(0, 3),
    oferta: t.area.oferta,
  }))
  const resumo = top.length
    ? `Pelas horas que indicaste, ${p.empresa} gasta cerca de ${r1(sim.horasSemana)} h por semana em tarefas repetidas. A maior fatia está em ${top
        .map((t) => t.area.titulo.toLowerCase())
        .join(', ')}, e é por aí que começávamos.`
    : `Ainda não indicaste horas no simulador. A análise completa parte das tarefas reais de ${p.empresa}, que levantamos contigo.`
  const primeiros30Dias = [
    top[0] ? `Semana 1 e 2: pôr a correr «${top[0].area.titulo}», a parte que mais horas te devolve.` : 'Semana 1: levantar contigo as tarefas que se repetem todos os dias.',
    top[1] ? `Semana 3: ligar «${top[1].area.titulo}» ao que já ficou a funcionar.` : 'Semana 2 e 3: montar a primeira automação e testá-la com clientes reais.',
    'Semana 4: medir contigo as horas reais antes e depois, e decidir o passo seguinte.',
  ]
  const perguntas = [
    'Por onde te chegam hoje os pedidos dos clientes (telefone, WhatsApp, Instagram, email)?',
    'Que programas já usas para faturas, agenda e contactos?',
    'Que tarefa farias desaparecer amanhã se pudesses escolher só uma?',
  ]
  const pressupostos = `Estimativa a partir das horas que indicaste: ${PRESSUPOSTOS.semanasPorAno} semanas de trabalho por ano, ${PRESSUPOSTOS.horasPorPessoaAno} h por pessoa a tempo inteiro, ${p.custoHora} € por hora e uma parte automatizável conservadora por tarefa (entre 40 e 80%). É tempo que deixa de ser teu, não é lucro nem poupança garantida.`
  return {
    sim,
    relatorio: {
      empresa: p.empresa,
      sector: sector.nome,
      resumo,
      totais: {
        horasSemana: r1(sim.horasSemana),
        recuperaveisSemana: r1(sim.recuperaveisSemana),
        recuperaveisAno: Math.round(sim.recuperaveisAno),
        eurosAno: Math.round(sim.eurosAno),
        pessoas: r1(sim.pessoas),
      },
      oportunidades,
      primeiros30Dias,
      perguntas,
      pressupostos,
      leitura: '',
      ideias: [],
    },
  }
}

export function promptLeitura(p: PedidoAnalise, rel: RelatorioAnalise): { sistema: string; mensagem: string } {
  const sistema = [
    'És o analista da MoreThanMoney, que implementa automações e agentes de IA em pequenos negócios portugueses.',
    'Escreves em português de Portugal, a tratar por «tu», tom próximo e claro, sem jargão.',
    'NUNCA escrevas números, percentagens, valores em euros nem prazos: os números do relatório já existem e são calculados à parte.',
    'Não prometas resultados, não inventes clientes nem casos. Fala só do que este negócio contou.',
    'Responde só com JSON: {"leitura": "um parágrafo de 2 a 4 frases sobre onde este negócio perde tempo e o que mudava primeiro", "ideias": ["3 a 5 automações concretas para ESTE negócio, cada uma numa frase curta"]}.',
  ].join(' ')
  const mensagem = [
    `Negócio: ${p.empresa} (${rel.sector}), equipa: ${p.equipa}.`,
    p.site ? `Site ou rede: ${p.site}.` : '',
    `O que mais lhe rouba tempo, nas palavras do dono: «${p.dores}».`,
    rel.oportunidades.length ? `Áreas com mais horas no simulador: ${rel.oportunidades.map((o) => o.area).join(', ')}.` : '',
    `O que a casa implementa: ${AREAS.map((a) => a.implementamos).join(' | ')}.`,
  ]
    .filter(Boolean)
    .join('\n')
  return { sistema, mensagem }
}

/** Corta frases com algarismos e textos de tamanho absurdo. Devolve vazio se nada se aproveita. */
export function limparLeitura(bruto: unknown): { leitura: string; ideias: string[] } {
  const semNumeros = (s: string) =>
    s
      .split(/(?<=[.!?])\s+/)
      .filter((f) => !/\d/.test(f))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/—/g, ',')
      .trim()
  let o: { leitura?: unknown; ideias?: unknown } = {}
  if (typeof bruto === 'string') {
    try {
      o = JSON.parse(bruto)
    } catch {
      return { leitura: '', ideias: [] }
    }
  } else if (bruto && typeof bruto === 'object') o = bruto as typeof o
  const leitura = semNumeros(String(o.leitura ?? '')).slice(0, 700)
  const ideias = (Array.isArray(o.ideias) ? o.ideias : [])
    .map((i) => semNumeros(String(i ?? '')).slice(0, 180))
    .filter((i) => i.length >= 8)
    .slice(0, 5)
  return { leitura, ideias }
}

export const LIMITE_ANALISES_IP_HORA = 3
