/**
 * FILA DE COMENTÁRIOS DO RADAR — as regras, em funções puras.
 *
 * O agente Prospector (AG-PROSPECTOR) prepara os comentários durante o dia; o dono cola-os e
 * publica-os À MÃO no Instagram. Este ficheiro não fala com a rede nem com a base: é o que a
 * guarda `fila-comentarios.check.ts` prova sem credenciais.
 *
 * ── O que NÃO existe aqui, de propósito ─────────────────────────────────────────────────────
 * Publicar. A Graph API não tem endpoint para comentar em media de terceiros, e conduzir o
 * browser como se fosse uma pessoa viola as regras do Instagram e põe a conta em risco. A fila
 * acaba no «Publiquei», que é o dono a dizer que já o fez — não é a máquina a fazê-lo.
 *
 * ── As regras de escrita ──────────────────────────────────────────────────────────────────────
 * Vêm da skill avoid-ai-writing (os 21 padrões de «texto de IA»), passadas para português de
 * Portugal e para o tamanho de um comentário: sem travessões, sem intensificadores ocos, sem
 * listas de três, sem frases-modelo, sem elogio genérico, sem conclusão de manual, sem emojis a
 * encher. E as regras da casa: sem links, sem pitch, sem números de desempenho.
 */
import { AG } from '../agentes/codigos'

/** Quem escreve os comentários da fila. Vem da lista única dos códigos — nunca à mão. */
export const AGENTE_DA_FILA = AG.PROSPECTOR

/** No máximo 20 comentários preparados por dia (dia de Lisboa). O trigger da 189 diz o mesmo. */
export const TECTO_DIARIO = 20

/** Quantos se escrevem por passagem do cron: 16 passagens × 2 chega aos 20 sem estourar os 60 s. */
export const POR_PASSAGEM = 2

/** Abaixo disto o post não merece um comentário preparado (o radar guarda a partir de 30). */
export const PONTUACAO_MINIMA = 40

/** O dia de Lisboa, em AAAA-MM-DD. É o dia que conta para o tecto. */
export function diaDeLisboa(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Quantos comentários esta passagem pode escrever, dado o que já se preparou hoje. */
export function quantosPodeEscrever(preparadosHoje: number, porPassagem = POR_PASSAGEM): number {
  const falta = TECTO_DIARIO - Math.max(0, Math.floor(preparadosHoje))
  return Math.max(0, Math.min(falta, Math.max(0, Math.floor(porPassagem))))
}

// ── Links ───────────────────────────────────────────────────────────────────────────────────

/** O mesmo padrão do `check` da migração 189 — se um mudar, a guarda obriga a mudar o outro. */
export const PADRAO_LINK =
  /(https?:\/\/|www\.|t\.me\/|bit\.ly|wa\.me|linktr\.ee|[a-z0-9-]+\.(com|pt|net|io|org|me|ly|app|link)(\/|\s|$))/i

export function temLink(texto: string): boolean {
  return PADRAO_LINK.test(texto)
}

// ── Pitch e clichés ─────────────────────────────────────────────────────────────────────────

/** Venda: um comentário que vende é spam e é apagado. */
const PITCH = [
  'morethanmoney', 'more than money', 'link na bio', 'na minha bio', 'vê a bio', 've a bio',
  'manda dm', 'manda-me dm', 'chama na dm', 'envia mensagem', 'manda mensagem', 'fala comigo',
  'segue-me', 'segue a página', 'grupo vip', 'sinais grátis', 'telegram', 'whatsapp', 'inscreve',
  'desconto', 'cupão', 'promoção', 'oferta', 'mentoria', 'o meu curso', 'nosso curso',
  'a nossa comunidade', 'comunidade de trading', 'copytrading', 'copy trading',
]

/**
 * Os tiques de IA da skill avoid-ai-writing, em português e no tamanho de um comentário.
 * Cada um é um sinal claro de «isto foi gerado», e num comentário um basta para se notar.
 */
const CLICHES = [
  // elogio oco / concordância vazia
  'ótimo post', 'excelente post', 'grande post', 'post incrível', 'conteúdo incrível',
  'conteúdo de valor', 'adorei o post', 'concordo plenamente', 'concordo totalmente', 'top demais',
  'muito bom post',
  // significância inflacionada e palavras de folheto
  'crucial', 'fundamental', 'essencial', 'jornada', 'mergulhar', 'mergulho profundo',
  'no mundo do trading', 'no mundo dos investimentos', 'no cenário atual', 'nos dias de hoje',
  'hoje em dia', 'em suma', 'em resumo', 'vale ressaltar', 'vale destacar', 'é importante notar',
  'é importante lembrar', 'não é apenas', 'não se trata apenas', 'mais do que nunca',
  'potencializar', 'alavancar', 'robusto', 'transformador', 'revolucionário', 'game changer',
  'divisor de águas', 'sem dúvida alguma', 'testemunho de', 'um verdadeiro', 'uma verdadeira',
  // frases de chatbot
  'espero que ajude', 'ótima pergunta', 'boa pergunta!', 'como modelo de linguagem',
  'fico à disposição', 'estou aqui para',
  // conclusão de manual
  'continua assim', 'continua o bom trabalho', 'sucesso para ti', 'bons trades!',
]

export interface Avaliacao {
  ok: boolean
  problemas: string[]
}

/** O que está mal neste comentário. Vazio = pode ir para a fila. */
export function avaliarComentario(texto: string): Avaliacao {
  const t = texto.trim()
  const baixo = t.toLowerCase()
  const problemas: string[] = []

  if (!t) problemas.push('vazio')
  if (t.length < 8) problemas.push('curto demais')
  if (t.length > 400) problemas.push('longo demais')
  if (temLink(t)) problemas.push('tem link')
  if (/(^|\s)#[\p{L}\d_]+/u.test(t)) problemas.push('tem hashtag')
  if (/(^|\s)@[a-z0-9._]+/i.test(t)) problemas.push('marca alguém')
  if (/[—–]/.test(t)) problemas.push('travessão')
  if (/\*\*|__/.test(t)) problemas.push('negrito de markdown')

  const frases = t.split(/(?<=[.!?])\s+/).filter((f) => f.trim().length > 0)
  if (frases.length > 3) problemas.push('mais de três frases')

  const emojis = t.match(/\p{Extended_Pictographic}/gu) ?? []
  if (emojis.length > 1) problemas.push('emojis a mais')

  const pitch = PITCH.find((p) => baixo.includes(p))
  if (pitch) problemas.push(`pitch ("${pitch}")`)

  const cliche = CLICHES.find((c) => baixo.includes(c))
  if (cliche) problemas.push(`cliché de IA ("${cliche}")`)

  // Números de desempenho: não os temos para dar, e num comentário parecem anúncio.
  if (/\d+([.,]\d+)?\s?(%|€|\$|eur\b|euros\b|pips\b|usd\b)/i.test(t)) problemas.push('números de desempenho')

  return { ok: problemas.length === 0, problemas }
}

/**
 * Arruma o que a IA devolve antes de se avaliar: aspas à volta, prefixos tipo «Comentário:»,
 * travessões (passam a vírgula, que é o que um português escreveria), espaços a dobrar.
 * Não tira links nem pitch: esses não se arrumam, recusam-se.
 */
export function arrumarComentario(texto: string): string {
  let t = texto.trim()
  t = t.replace(/^(coment[áa]rio|resposta)\s*:\s*/i, '')
  t = t.replace(/^["'«“]+|["'»”]+$/g, '')
  t = t.replace(/\s*[—–]\s*/g, ', ')
  t = t.replace(/\s{2,}/g, ' ')
  return t.trim()
}

/** O sistema do pedido à IA. É o mesmo para o botão «Escrever comentário» e para a fila. */
export const SISTEMA_COMENTARIO =
  'Escreves um comentário para deixar num post de Instagram de OUTRA pessoa, em nome do ' +
  'Ricardo Garcia, trader português.\n\n' +
  'Regras, e são duras porque é o que separa um comentário de um anúncio:\n' +
  '· Uma a duas frases. Nunca mais.\n' +
  '· Reage ao que a pessoa DISSE neste post. Se não conseguires citar a ideia dela, o comentário está errado. ' +
  'Um comentário que servia para qualquer post não serve.\n' +
  '· ZERO links, zero convites, zero «manda DM», zero menção à MoreThanMoney, a cursos, grupos ou sinais. ' +
  'Um comentário que vende é spam, é apagado, e queima a conta para os próximos.\n' +
  '· Sem números de desempenho: não os tens.\n' +
  '· Português de Portugal, tratamento por tu, no máximo um emoji (de preferência nenhum). Sem hashtags.\n\n' +
  'Escreve como uma pessoa escreve no telemóvel, não como um texto de IA:\n' +
  '· nada de travessões; usa vírgulas e pontos;\n' +
  '· nada de elogio genérico («ótimo post», «concordo plenamente», «conteúdo de valor»);\n' +
  '· nada de palavras de folheto («crucial», «fundamental», «jornada», «no mundo do trading», «hoje em dia»);\n' +
  '· nada de listas de três coisas, nem de «não é só X, é Y», nem de conclusão moral no fim;\n' +
  '· pode ser uma pergunta concreta, uma experiência curta tua, ou um ponto que a pessoa não disse mas que encaixa.\n\n' +
  'Devolve SÓ o texto do comentário, sem aspas e sem explicação.\n' +
  'O objectivo é uma pessoa ler e ter vontade de ver quem escreveu. Mais nada.'

/** A mensagem do utilizador para a IA, a partir do post. */
export function pedidoDoPost(p: { hashtag?: string | null; legenda?: string | null }, evitar?: string[]): string {
  const base = `Post (#${p.hashtag ?? 'sem hashtag'}):\n${String(p.legenda ?? '').slice(0, 900)}`
  if (!evitar?.length) return base
  return `${base}\n\nA tentativa anterior foi recusada por: ${evitar.join('; ')}. Escreve outra que não tenha isso.`
}

// ── Estados da fila ─────────────────────────────────────────────────────────────────────────

export type EstadoFila = 'pronto' | 'aberto' | 'publicado' | 'saltado'

/**
 * O que «Publiquei» escreve na linha. Quem escreveu (o agente), quando, e o post — tudo para
 * a medição do Prospector. Só aceita itens que ainda não estão fechados.
 */
export function registoDePublicado(
  item: { estado: EstadoFila; media_id: string; permalink?: string | null },
  agora: Date = new Date(),
): { estado: 'publicado'; publicado_em: string; escrito_por: string; media_id: string; permalink: string | null } {
  if (item.estado === 'publicado' || item.estado === 'saltado') {
    throw new Error(`Este comentário já está ${item.estado}.`)
  }
  return {
    estado: 'publicado',
    publicado_em: agora.toISOString(),
    escrito_por: AGENTE_DA_FILA,
    media_id: item.media_id,
    permalink: item.permalink ?? null,
  }
}

/** A taxa de resposta, ou `null` quando ainda não se mede (sem nenhuma resposta ligada). */
export function taxaDeResposta(publicados: number, respondidos: number, mede: boolean): number | null {
  if (!mede || publicados <= 0) return null
  return Math.round((respondidos / publicados) * 1000) / 10
}
