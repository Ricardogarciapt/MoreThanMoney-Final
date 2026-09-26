/**
 * LER UMA ALTERAÇÃO DE PERTENÇA A UM GRUPO — os dois caminhos, num formato só.
 *
 * PORQUE É QUE ISTO EXISTE
 * O grupo "MTM System" tinha 62 membros e o pipeline não conhecia nenhum. A pessoa do print do dono
 * («joined the group via invite link») não existia em `telegram_leads`, `mtm_leads`, `ig_leads` nem
 * `profiles`: o bot nunca soube que ela entrou.
 *
 * A razão é que o Telegram conta as entradas de DUAS maneiras diferentes, e só uma delas era lida:
 *
 *  · `message.new_chat_members` — a mensagem de serviço, quando alguém é ADICIONADO por outra
 *    pessoa. É o que o webhook já tratava.
 *  · update `chat_member` — a alteração de estado, e é o ÚNICO sinal quando alguém entra por LINK
 *    DE CONVITE num supergrupo. O Telegram só o entrega a quem o pede em `allowed_updates`, e não
 *    estava pedido. Quem entrava por link era invisível.
 *
 * Este ficheiro traduz os dois para a MESMA forma, e é PURO de propósito: a leitura de um update é
 * exactamente o género de código que se escreve uma vez, nunca se volta a olhar, e está errado em
 * silêncio durante meses. Presa por guardas (`telegram-grupo-membros.check.ts`) com os corpos reais
 * que o Telegram manda.
 *
 * UMA LIMITAÇÃO DO TELEGRAM QUE NÃO SE CONTORNA
 * O bot NÃO pode iniciar uma conversa privada com quem nunca lhe escreveu. Não há aqui — nem pode
 * haver em sítio nenhum — um caminho que mande DM a quem acabou de entrar no grupo: a API responde
 * 403 e a pessoa não recebe nada. O acolhimento faz-se NO GRUPO, com um botão que leve a pessoa a
 * abrir ela a conversa. Quem escrever esse caminho de DM vai encontrar este parágrafo primeiro.
 */

/** Entrou ou saiu. Não há terceira. */
export type MotivoMembro = 'entrou' | 'saiu'

/** Por onde soubemos — e é o `convite` que estava invisível até hoje. */
export type ViaMembro = 'convite' | 'adicionado' | 'mensagem'

export interface MudancaDeMembro {
  grupoId: string
  tituloGrupo: string | null
  tgUserId: string
  nome: string | null
  username: string | null
  motivo: MotivoMembro
  via: ViaMembro
}

/**
 * Os estados em que uma pessoa ESTÁ no grupo.
 *
 * `restricted` é o caso traiçoeiro: está na lista mas pode já não ser membro (silenciada e fora), e
 * é o `is_member` que decide. Tratá-lo como «dentro» punha o bot a acolher quem tinha sido expulso.
 */
const DENTRO = new Set(['member', 'administrator', 'creator'])
const FORA = new Set(['left', 'kicked'])

function estaDentro(m: { status?: string; is_member?: boolean } | null | undefined): boolean {
  const s = String(m?.status ?? '')
  if (s === 'restricted') return m?.is_member === true
  return DENTRO.has(s)
}

function estaFora(m: { status?: string; is_member?: boolean } | null | undefined): boolean {
  const s = String(m?.status ?? '')
  if (s === 'restricted') return m?.is_member === false
  return FORA.has(s)
}

function texto(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, 120) : null
}

interface UtilizadorTg {
  id?: number | string
  is_bot?: boolean
  first_name?: string | null
  last_name?: string | null
  username?: string | null
}

/**
 * Lê um update `chat_member`.
 *
 * Devolve `null` para tudo o que não seja uma entrada ou uma saída de uma PESSOA: promoções a
 * administrador, silenciamentos, bots, e o próprio bot. Uma promoção lida como entrada punha o bot
 * a acolher pela segunda vez alguém que já lá estava há meses — e a acolher-se a si próprio.
 */
export function lerChatMember(update: unknown): MudancaDeMembro | null {
  const u = update as
    | {
        chat?: { id?: number | string; title?: string | null; type?: string }
        old_chat_member?: { status?: string; is_member?: boolean; user?: UtilizadorTg }
        new_chat_member?: { status?: string; is_member?: boolean; user?: UtilizadorTg }
        invite_link?: unknown
        via_join_request?: boolean
      }
    | null
    | undefined

  const grupoId = u?.chat?.id != null ? String(u.chat.id) : ''
  const pessoa = u?.new_chat_member?.user ?? u?.old_chat_member?.user
  if (!grupoId || !pessoa?.id || pessoa.is_bot) return null

  const antes = u?.old_chat_member
  const depois = u?.new_chat_member

  let motivo: MotivoMembro
  if (estaFora(antes) && estaDentro(depois)) motivo = 'entrou'
  else if (estaDentro(antes) && estaFora(depois)) motivo = 'saiu'
  else return null

  return {
    grupoId,
    tituloGrupo: texto(u?.chat?.title),
    tgUserId: String(pessoa.id),
    nome: texto([pessoa.first_name, pessoa.last_name].filter(Boolean).join(' ')),
    username: texto(pessoa.username),
    motivo,
    // Com `invite_link` (ou pedido de adesão) foi a própria pessoa que entrou por um link nosso —
    // é o caso que não deixa mensagem de serviço nenhuma e que andava perdido.
    via: u?.invite_link || u?.via_join_request ? 'convite' : 'adicionado',
  }
}

/**
 * Lê as entradas e saídas de uma MENSAGEM de serviço (`new_chat_members` / `left_chat_member`).
 *
 * Continua a existir ao lado do `chat_member` e não em vez dele: uma pessoa adicionada por outra
 * gera a mensagem de serviço, e há grupos onde o bot não é administrador e por isso nunca recebe
 * `chat_member`. Os dois podem chegar para a mesma pessoa — a desduplicação é da tabela
 * `telegram_grupo_membros`, não daqui.
 */
export function lerMensagemDeMembros(mensagem: unknown): MudancaDeMembro[] {
  const m = mensagem as
    | {
        chat?: { id?: number | string; title?: string | null }
        new_chat_members?: UtilizadorTg[]
        left_chat_member?: UtilizadorTg
      }
    | null
    | undefined

  const grupoId = m?.chat?.id != null ? String(m.chat.id) : ''
  if (!grupoId) return []
  const tituloGrupo = texto(m?.chat?.title)
  const out: MudancaDeMembro[] = []

  for (const p of Array.isArray(m?.new_chat_members) ? m!.new_chat_members! : []) {
    if (!p?.id || p.is_bot) continue
    out.push({
      grupoId,
      tituloGrupo,
      tgUserId: String(p.id),
      nome: texto([p.first_name, p.last_name].filter(Boolean).join(' ')),
      username: texto(p.username),
      motivo: 'entrou',
      via: 'mensagem',
    })
  }

  const saiu = m?.left_chat_member
  if (saiu?.id && !saiu.is_bot) {
    out.push({
      grupoId,
      tituloGrupo,
      tgUserId: String(saiu.id),
      nome: texto([saiu.first_name, saiu.last_name].filter(Boolean).join(' ')),
      username: texto(saiu.username),
      motivo: 'saiu',
      via: 'mensagem',
    })
  }

  return out
}

/**
 * O `stage` com que um membro do grupo entra em `telegram_leads` — e é uma decisão, não um nome.
 *
 * NÃO pode ser `new`, `qualifying` nem `routed`: são os estados que o `runLeadFollowups` vai buscar
 * para mandar DM. Quem entrou no grupo e nunca escreveu ao bot NÃO PODE receber DM (403 do Telegram),
 * e o cron não incrementa o contador quando o envio falha — ou seja, tentaria para sempre, a cada
 * corrida, a cada pessoa do grupo.
 *
 * `no_grupo` não está em nenhuma dessas listas, e a ingestão diária
 * (`lib/backoffice-dia-ingestao.ts`) trata qualquer estado desconhecido como `lead`. Resultado: a
 * pessoa vai ao pipeline e alguém a trabalha, sem o bot tentar falar-lhe primeiro.
 */
export const STAGE_MEMBRO_DE_GRUPO = 'no_grupo'

/** Os estados que o follow-up por DM vai buscar. Presos aqui para a guarda os poder comparar. */
export const STAGES_QUE_RECEBEM_DM = ['new', 'qualifying', 'routed'] as const

/** A origem escrita no lead, para a nota do pipeline dizer de onde veio. */
export function origemDoGrupo(titulo: string | null): string {
  return titulo ? `grupo ${titulo}`.slice(0, 80) : 'grupo Telegram'
}
