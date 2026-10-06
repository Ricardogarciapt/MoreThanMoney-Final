/**
 * QUANDO É QUE UMA MENSAGEM DA MÁQUINA PODE SAIR SOZINHA — a regra, sem rede.
 *
 * ═══ A REGRA (conformidade, 06/10) ═════════════════════════════════════════════════════════
 *
 * · Quem COMEÇOU a conversa foi a pessoa (escreveu ao bot, mandou DM, comentou o post) → a
 *   resposta sai automática. Inclui a DM do setter a quem comentou (decisão do dono, 06/10 F4:
 *   quem comenta iniciou o contacto) — mas só até 48 h depois do comentário; depois disso fica
 *   `expirado` e nunca sai.
 * · Quem começa é a MÁQUINA (follow-up a um lead calado, email de recuperação de checkout) →
 *   fica RASCUNHO `pendente` e só sai depois de uma pessoa (ou o agente pela API, que responde
 *   ao dono) o pôr em `aprovado`.
 *
 * Isto é puro de propósito: é o que as guardas (`envios-aprovacao.check.ts`) prendem, e é o
 * que os três caminhos de envio chamam antes de tocar na rede. Um caminho que envie sem passar
 * por `podeSair` é um caminho fora da regra — e a guarda lê o código para o apanhar.
 */

/** Os estados de um rascunho por aprovar. Iguais nas duas filas (IG e `aios_tasks`). */
export const ESTADOS = ['pendente', 'aprovado', 'enviado', 'rejeitado', 'falhou', 'obsoleto', 'expirado'] as const
export type EstadoEnvio = (typeof ESTADOS)[number]

/** O tipo de mensagem, que é o que diz quem a iniciou. */
export type TipoEnvio =
  /** Resposta a uma mensagem que a pessoa escreveu (bot, DM recebida). */
  | 'resposta_a_mensagem'
  /** Resposta pública debaixo do comentário que a pessoa escreveu. */
  | 'resposta_publica_a_comentario'
  /** DM do setter a quem comentou. A pessoa iniciou o contacto: sai sozinha, dentro de 48 h. */
  | 'dm_ao_comentador'
  /** Seguimento que o bot inicia a um lead que não respondeu. */
  | 'followup_bot'
  /** Email de recuperação de um checkout abandonado. */
  | 'email_recuperacao'

/** Os tipos que a pessoa iniciou. Tudo o resto é iniciativa da máquina e precisa de aprovação. */
const INICIADO_PELO_UTILIZADOR: ReadonlySet<TipoEnvio> = new Set<TipoEnvio>([
  'resposta_a_mensagem',
  'resposta_publica_a_comentario',
])

export function iniciadoPeloUtilizador(tipo: TipoEnvio): boolean {
  return INICIADO_PELO_UTILIZADOR.has(tipo)
}

export interface PedidoDeSaida {
  tipo: TipoEnvio
  /** O estado do rascunho, quando há um. `null`/`undefined` = não há rascunho aprovado. */
  estado?: string | null
  /** Só para `dm_ao_comentador`: horas desde o comentário. `null` = não se sabe → não sai. */
  horasDesdeComentario?: number | null
}

/** Até quando a DM ao comentador ainda pode sair (e o cron a pode reenviar). Depois: `expirado`. */
export const JANELA_DM_COMENTADOR_HORAS = 48

/** A DM a este comentador já passou da janela? `null` (sem data) conta como passada. */
export function dmExpirada(horasDesdeComentario: number | null | undefined): boolean {
  if (horasDesdeComentario == null || !Number.isFinite(horasDesdeComentario)) return true
  return horasDesdeComentario > JANELA_DM_COMENTADOR_HORAS || horasDesdeComentario < -1
}

export interface DecisaoDeSaida {
  pode: boolean
  porque: string
}

/**
 * A decisão. A ordem importa: primeiro quem iniciou, depois o estado — e o estado só vale se for
 * EXACTAMENTE `aprovado`. Um «enviado» não volta a sair (repetir uma DM queima a única private
 * reply da Meta), um «pendente» espera, e qualquer valor que não se reconheça é NÃO.
 */
export function podeSair(p: PedidoDeSaida): DecisaoDeSaida {
  if (p.tipo === 'dm_ao_comentador') {
    // A private reply é UMA por comentário: o que já saiu, foi descartado ou expirou não volta.
    if (p.estado === 'enviado') return { pode: false, porque: 'já foi enviado — não se repete' }
    if (p.estado === 'expirado' || p.estado === 'descartado' || p.estado === 'encerrado') {
      return { pode: false, porque: `estado ${p.estado} — não sai` }
    }
    if (dmExpirada(p.horasDesdeComentario)) {
      return { pode: false, porque: `fora das ${JANELA_DM_COMENTADOR_HORAS} h depois do comentário — expirado` }
    }
    return { pode: true, porque: 'a pessoa comentou (iniciou o contacto) e está dentro das 48 h' }
  }
  if (iniciadoPeloUtilizador(p.tipo)) {
    return { pode: true, porque: 'a pessoa iniciou a conversa — a resposta sai automática' }
  }
  if (p.estado === 'aprovado') {
    return { pode: true, porque: 'aprovado por uma pessoa' }
  }
  if (p.estado === 'enviado') {
    return { pode: false, porque: 'já foi enviado — não se repete' }
  }
  return { pode: false, porque: 'iniciativa da máquina sem aprovação — fica pendente' }
}

/** Uma decisão de aprovar/rejeitar só se aplica a quem está `pendente`. */
export function transicaoValida(de: string | null | undefined, para: 'aprovado' | 'rejeitado'): boolean {
  return de === 'pendente' && (para === 'aprovado' || para === 'rejeitado')
}

// ── A fila genérica: `aios_tasks` ────────────────────────────────────────────────────────────────

/**
 * Os `kind` de `aios_tasks` que são ENVIOS por aprovar. Prefixo próprio para nunca se confundirem
 * com as tarefas internas que o AIOS cria (`task`, `follow_up`…): aprovar uma destas FAZ SAIR uma
 * mensagem, e isso não pode acontecer por um `update_task` distraído.
 */
export const KIND_ENVIO = {
  FOLLOWUP_TELEGRAM: 'envio:telegram_followup',
  EMAIL_RECUPERACAO: 'envio:email_recuperacao_checkout',
} as const
export type KindEnvio = (typeof KIND_ENVIO)[keyof typeof KIND_ENVIO]

export function ehKindDeEnvio(kind: unknown): kind is KindEnvio {
  return Object.values(KIND_ENVIO).includes(String(kind ?? '') as KindEnvio)
}

export function tipoDoKind(kind: KindEnvio): TipoEnvio {
  return kind === KIND_ENVIO.FOLLOWUP_TELEGRAM ? 'followup_bot' : 'email_recuperacao'
}

/** O que vai no `payload` de cada envio por aprovar. */
export interface PayloadFollowupTelegram {
  chat_id: string
  texto: string
  toque: number
  funil: string
  codigo?: string | null
  /** O `followup_count` que o lead tinha quando o rascunho nasceu. Serve para saber se ficou velho. */
  followup_count_na_criacao: number
}

export interface PayloadEmailRecuperacao {
  email: string
  assunto: string
  texto: string
  link: string
  origem: 'checkout_sessions' | 'marketplace_leads'
  referencia: string
}

/**
 * Um follow-up aprovado ainda faz sentido? Se o lead respondeu entretanto (o funil põe o
 * `followup_count` a 0) ou outro toque já saiu, a mensagem aprovada ficou velha — mandar «vou
 * assumir que não é o momento» a quem acabou de escrever é pior do que não mandar nada.
 */
export function followupAindaValido(p: { countNaCriacao: number; countAgora: number | null; convertido: boolean }): boolean {
  if (p.convertido) return false
  return Number(p.countAgora ?? 0) === Number(p.countNaCriacao)
}
