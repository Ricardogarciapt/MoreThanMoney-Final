/**
 * O COMANDO POR VOZ DO BACKOFFICE — a parte pura (sem rede, sem base), provada em
 * `backoffice-voz.check.ts`.
 *
 * O caminho completo: microfone → `/api/backoffice/voz` (Groq Whisper, grátis) → texto →
 * `/api/backoffice/comando` → a IA (cadeia grátis) escolhe UMA acção desta lista → ler corre já;
 * mudar volta como PROPOSTA que a pessoa confirma com um toque, e o toque chama as MESMAS rotas que
 * o ecrã já usa (`PATCH /api/backoffice/negocios/[id]`, `POST /api/backoffice/tarefas`). Assim a
 * voz não abre nenhuma porta nova: quem não pode mover um negócio pelo ecrã também não pode por voz.
 *
 * O que NÃO está aqui de propósito: enviar mensagens a pessoas, mexer em dinheiro, apagar. Uma
 * frase mal ouvida não pode ter consequências fora da casa (ver o cabeçalho de lib/mcp/ferramentas.ts).
 */
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, type EstadoPipeline } from './backoffice-vista'
import { FUNIS, FUNIL_NOME, ehFunil, type Funil } from './backoffice-funis'
import { TIPOS_CHAMADA, ehTipoChamada, type TipoChamada } from './backoffice-chamada'

export type AccaoVoz =
  | { tipo: 'procurar_negocio'; texto: string }
  | { tipo: 'minhas_tarefas' }
  | { tipo: 'proxima_accao' }
  | { tipo: 'resumo_pipeline'; dias: number }
  | { tipo: 'mover_negocio'; negocio: string; estado: EstadoPipeline; motivo_perda?: string }
  | { tipo: 'criar_tarefa'; titulo: string; prazo: string | null; negocio: string | null }
  | { tipo: 'mudar_funil'; negocio: string; funil: Funil | null }
  | { tipo: 'nota_negocio'; negocio: string; texto: string }
  | { tipo: 'concluir_tarefa'; tarefa: string }
  | { tipo: 'adiar_tarefa'; tarefa: string; prazo: string }
  | { tipo: 'preparar_chamada'; negocio: string | null; tipo_chamada: TipoChamada }
  | { tipo: 'rascunho_mensagem'; negocio: string; canal: CanalRascunho; objetivo: string }
  | { tipo: 'abrir'; pagina: PaginaVoz }
  | { tipo: 'responder'; texto: string }

export const CANAIS_RASCUNHO = ['whatsapp', 'email'] as const
export type CanalRascunho = (typeof CANAIS_RASCUNHO)[number]

export const PAGINAS_VOZ = {
  hoje: '/backoffice',
  pipeline: '/backoffice/pipeline',
  tarefas: '/backoffice/tarefas',
  extracto: '/backoffice/extracto',
  equipa: '/backoffice/equipa',
  materiais: '/backoffice/material',
  gestao: '/backoffice/gestao',
} as const
export type PaginaVoz = keyof typeof PAGINAS_VOZ

/** Quanto texto se aceita de uma transcrição. Um comando é uma frase, não um ditado. */
export const MAX_TEXTO_COMANDO = 600

export function sistemaDoComando(hojeISO: string, podeGestao: boolean): string {
  const estados = ESTADOS_PIPELINE.map((e) => `${e} (${ESTADO_PIPELINE_NOME[e]})`).join(', ')
  return [
    'És o assistente de voz do backoffice da MoreThanMoney. A pessoa falou ao microfone; recebes a',
    'transcrição. Escolhe UMA acção e devolve SÓ um objecto JSON, sem texto à volta.',
    `Hoje é ${hojeISO} (Europe/Lisbon). Datas relativas («amanhã», «sexta») convertem-se para AAAA-MM-DD.`,
    '',
    'Acções possíveis:',
    '{"tipo":"procurar_negocio","texto":"<nome ou parte do nome>"}  — encontrar um lead/negócio',
    '{"tipo":"minhas_tarefas"}  — as tarefas abertas da pessoa',
    '{"tipo":"proxima_accao"}  — «o que faço agora?», «com quem falo primeiro?»: a fila de prioridade do pipeline',
    ...(podeGestao ? ['{"tipo":"resumo_pipeline","dias":30}  — números do pipeline por etapa e origem'] : []),
    `{"tipo":"mover_negocio","negocio":"<nome>","estado":"<estado>","motivo_perda":"<só se perdido>"}  — estados: ${estados}`,
    `{"tipo":"mudar_funil","negocio":"<nome>","funil":"<funil ou null>"}  — funis: ${FUNIS.map((f) => `${f} (${FUNIL_NOME[f]})`).join(', ')}; null tira o funil`,
    '{"tipo":"criar_tarefa","titulo":"<curto>","prazo":"AAAA-MM-DD ou null","negocio":"<nome ou null>"}',
    '{"tipo":"nota_negocio","negocio":"<nome>","texto":"<o que se quer anotar, por palavras da pessoa>"}  — acrescentar uma nota a um negócio',
    '{"tipo":"concluir_tarefa","tarefa":"<parte do título>"}  — marcar uma tarefa como feita',
    '{"tipo":"adiar_tarefa","tarefa":"<parte do título>","prazo":"AAAA-MM-DD"}  — mudar o prazo de uma tarefa',
    `{"tipo":"preparar_chamada","negocio":"<nome ou null>","tipo_chamada":"${Object.keys(TIPOS_CHAMADA).join('|')}"}  — abrir a sala de chamadas (Google Meet) já com o negócio`,
    '{"tipo":"rascunho_mensagem","negocio":"<nome>","canal":"whatsapp|email","objetivo":"<o que a mensagem deve conseguir>"}  — escrever um RASCUNHO para a pessoa copiar; nunca se envia daqui',
    `{"tipo":"abrir","pagina":"${Object.keys(PAGINAS_VOZ).join('|')}"}  — ir para uma página`,
    '{"tipo":"responder","texto":"<resposta curta>"}  — quando nada acima serve ou falta informação; pergunta o que falta',
    '',
    'Regras: nunca inventes nomes nem datas. Se a pessoa pedir para ENVIAR uma mensagem, usa',
    '"rascunho_mensagem" (ela revê e envia). Pagar, apagar ou algo fora desta lista: usa "responder"',
    'e diz que isso ainda se faz no ecrã.',
    'Responde no "texto" na mesma língua em que a pessoa falou.',
  ].join('\n')
}

const ehData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))
const textoCurto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, max) : null
}

/**
 * Lê o JSON da IA e devolve uma acção VÁLIDA ou uma resposta honesta. Nunca lança: o pior caso é
 * «não percebi», nunca uma acção meio preenchida a chegar a uma rota que escreve.
 */
export function interpretarAccao(bruto: string, podeGestao: boolean): AccaoVoz {
  const naoPercebi: AccaoVoz = { tipo: 'responder', texto: 'Não percebi o pedido. Podes repetir de outra forma?' }
  let j: Record<string, unknown>
  try {
    const inicio = bruto.indexOf('{')
    const fim = bruto.lastIndexOf('}')
    if (inicio < 0 || fim <= inicio) return naoPercebi
    j = JSON.parse(bruto.slice(inicio, fim + 1)) as Record<string, unknown>
  } catch {
    return naoPercebi
  }

  switch (j.tipo) {
    case 'procurar_negocio': {
      const texto = textoCurto(j.texto, 80)
      return texto ? { tipo: 'procurar_negocio', texto } : naoPercebi
    }
    case 'minhas_tarefas':
      return { tipo: 'minhas_tarefas' }
    case 'proxima_accao':
      return { tipo: 'proxima_accao' }
    case 'resumo_pipeline': {
      if (!podeGestao) return { tipo: 'responder', texto: 'Os números do pipeline inteiro só estão abertos à Gestão.' }
      const dias = Math.min(Math.max(Number(j.dias) || 30, 1), 180)
      return { tipo: 'resumo_pipeline', dias }
    }
    case 'mover_negocio': {
      const negocio = textoCurto(j.negocio, 80)
      const estado = j.estado as EstadoPipeline
      if (!negocio || !ESTADOS_PIPELINE.includes(estado)) return naoPercebi
      const motivo = textoCurto(j.motivo_perda, 300)
      return { tipo: 'mover_negocio', negocio, estado, ...(estado === 'perdido' && motivo ? { motivo_perda: motivo } : {}) }
    }
    case 'criar_tarefa': {
      const titulo = textoCurto(j.titulo, 160)
      if (!titulo) return naoPercebi
      return { tipo: 'criar_tarefa', titulo, prazo: ehData(j.prazo) ? j.prazo : null, negocio: textoCurto(j.negocio, 80) }
    }
    case 'mudar_funil': {
      const negocio = textoCurto(j.negocio, 80)
      const funil = j.funil === null || j.funil === '' ? null : j.funil
      if (!negocio || (funil !== null && !ehFunil(funil))) return naoPercebi
      return { tipo: 'mudar_funil', negocio, funil }
    }
    case 'nota_negocio': {
      const negocio = textoCurto(j.negocio, 80)
      const texto = textoCurto(j.texto, 1000)
      return negocio && texto ? { tipo: 'nota_negocio', negocio, texto } : naoPercebi
    }
    case 'concluir_tarefa': {
      const tarefa = textoCurto(j.tarefa, 120)
      return tarefa ? { tipo: 'concluir_tarefa', tarefa } : naoPercebi
    }
    case 'adiar_tarefa': {
      const tarefa = textoCurto(j.tarefa, 120)
      if (!tarefa || !ehData(j.prazo)) return naoPercebi
      return { tipo: 'adiar_tarefa', tarefa, prazo: j.prazo }
    }
    case 'preparar_chamada': {
      const tipo_chamada = ehTipoChamada(j.tipo_chamada) ? j.tipo_chamada : 'followup'
      return { tipo: 'preparar_chamada', negocio: textoCurto(j.negocio, 80), tipo_chamada }
    }
    case 'rascunho_mensagem': {
      const negocio = textoCurto(j.negocio, 80)
      const canal = j.canal === 'email' ? 'email' : 'whatsapp'
      const objetivo = textoCurto(j.objetivo, 300) ?? 'seguimento'
      return negocio ? { tipo: 'rascunho_mensagem', negocio, canal, objetivo } : naoPercebi
    }
    case 'abrir': {
      const pagina = j.pagina as PaginaVoz
      return pagina in PAGINAS_VOZ ? { tipo: 'abrir', pagina } : naoPercebi
    }
    case 'responder': {
      const texto = textoCurto(j.texto, 500)
      return texto ? { tipo: 'responder', texto } : naoPercebi
    }
    default:
      return naoPercebi
  }
}

/** Limpa o texto de procura para um `ilike` — sem curingas vindos da voz. */
export function padraoDeProcura(texto: string): string {
  return `%${texto.replace(/[%_\\]/g, ' ').trim().replace(/\s+/g, '%')}%`
}

/** Tecto da coluna `vendas_negocios.nota` (o PATCH recusa acima disto). */
export const MAX_NOTA = 2000

/** A nota nova: o que se disse por cima, a nota antiga por baixo. Nunca passa do tecto. */
export function notaDaVoz(dia: string, texto: string, antiga: string | null): string {
  const topo = `🎙 ${dia} · ${texto.trim()}`
  const resto = antiga?.trim() ? `\n\n${antiga.trim()}` : ''
  return (topo + resto).slice(0, MAX_NOTA)
}

/** Procura de tarefas pelo título — sem curingas vindos da voz (mesma limpeza dos negócios). */
export const padraoDeTarefa = padraoDeProcura

/** O prompt do rascunho: tom da casa, sem promessas, sem números, para a pessoa rever. */
export function sistemaDoRascunho(canal: CanalRascunho, framework: string): string {
  return [
    framework,
    '',
    `Escreve um RASCUNHO de ${canal === 'email' ? 'email (primeira linha «Assunto: …», depois o corpo)' : 'mensagem de WhatsApp (curta, 2 a 5 frases)'}`,
    'que um membro da equipa MoreThanMoney vai rever e enviar ele próprio a um lead.',
    'PT-PT, «tu», tom humano e próximo, um único pedido claro no fim. Nunca prometas resultados nem',
    'inventes números, datas ou factos que não estejam nos dados. Devolve só o texto do rascunho.',
  ].join('\n')
}
