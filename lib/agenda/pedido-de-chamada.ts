/**
 * A PESSOA PEDIU PARA FALAR? Então a resposta leva o link da agenda.
 *
 * Até 06/10 um lead quente que escrevia «quero falar com alguém» recebia uma resposta da IA e um
 * aviso ia para o Ricardo no Telegram — mas o lead ficava sem nada que pudesse fazer já. Marcar a
 * chamada é a acção que fecha o pedido, e sai assinada AG-SETTER (`linkAgendar`).
 *
 * Puro: decide e acrescenta, sem rede. Usado no closer do bot do Telegram (webhook) e no closer
 * das DMs do Instagram. É resposta a quem ESCREVEU — sai automática (lib/envios-aprovacao.ts).
 */
import { linkAgendar, type AssuntoDaChamada } from './link'

/** Pedidos explícitos de conversa com uma pessoa. Não inclui «preço» nem «comprar»: isso é quente, não é pedir chamada. */
const PEDE_FALAR = new RegExp(
  [
    'falar com (algu[ée]m|um humano|humano|o ricardo|ricardo|uma pessoa|voc[êe]s|contigo)',
    'fala(r)? comigo',
    'chamada',
    'liga(r|-me)|ligue(-me)?',
    'telefonema',
    'reuni[ãa]o',
    'marcar (uma )?(conversa|call|hora)',
    'agendar',
    '\\bcall\\b',
    'videochamada',
    'zoom',
  ].join('|'),
  'i',
)

export function pedeParaFalar(texto: unknown): boolean {
  return PEDE_FALAR.test(String(texto ?? ''))
}

/** Assunto da chamada pelo que a pessoa escreveu. Sem pista, a lista toda. */
export function assuntoPelaMensagem(texto: unknown): AssuntoDaChamada | undefined {
  const t = String(texto ?? '').toLowerCase()
  if (/copy|copiar|sinais/.test(t)) return 'copytrading'
  if (/corretora|conta real|dep[óo]sito|uid/.test(t)) return 'corretora'
  if (/parceria|afilia|criador|educador/.test(t)) return 'parcerias'
  return undefined
}

/**
 * A resposta com o link da agenda acrescentado — só quando a pessoa pediu para falar e a
 * resposta ainda não o leva. Idempotente.
 */
export function comLinkDaAgenda(resposta: string, mensagemDaPessoa: unknown): string {
  const r = String(resposta ?? '')
  if (!pedeParaFalar(mensagemDaPessoa)) return r
  if (r.includes('/agendar')) return r
  const link = linkAgendar(assuntoPelaMensagem(mensagemDaPessoa))
  return `${r.trimEnd()}\n\nMarca aqui a chamada, no horário que te der jeito: ${link}`
}
