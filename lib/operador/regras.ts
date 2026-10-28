/**
 * O AGENTE OPERADOR (AG-OPERADOR) — as decisões, sem rede e sem base.
 *
 * Pedido do Ricardo (28/10): tal como os comentários do radar, que um agente publica e ele audita,
 * o trabalho de carregar em botões no /admin/social, na máquina de vendas e no radar passa a ser
 * do agente. O dono deixa de aprovar um a um e passa a ler o registo e a desfazer o que não quer.
 *
 * O que o agente faz, em cada passagem:
 *
 *  · **Posts** em rascunho do @morethanmoney.pt → aprova os que passam na guarda da marca
 *    (`lib/agentes/social-agente.ts`) e na peneira da casa (`lib/marketing/regras.ts`). Até ser publicado, aprovar desfaz-se no registo.
 *  · **Envios por aprovar** (follow-up de Telegram, email de recuperação de checkout) → aprova
 *    os que passam na peneira e já esperaram a janela de veto; os velhos rejeita. Um envio que
 *    saiu NÃO se desfaz: por isso só sai depois de o dono ter tido horas para o travar.
 *  · **Fila de comentários** do radar → salta os que ficaram velhos (o post arrefeceu).
 *
 * O que NUNCA faz:
 *
 *  · tocar em posts do @ricardogarciapt — a conta pessoal só publica à mão;
 *  · reaprovar o que o dono desfez;
 *  · mexer num rascunho que o dono mexeu há pouco (pode estar a meio de o editar);
 *  · aprovar contactos por telefone (é o setter que liga);
 *  · publicar comentários: isso é do agente no Mac, que só regista o que fez (ver a API
 *    `/api/operador/fila-comentarios`).
 *
 * As guardas estão em `regras.check.ts`.
 */
import { peneira } from '@/lib/marketing/regras'
import { RADAR_IDADE_MAX_DIAS } from '@/lib/instagram/radar-frescura'
import { guardaDaLegenda } from '@/lib/agentes/social-agente'

export const AGENTE_OPERADOR = 'AG-OPERADOR'

export const CONTA_MARCA = '17841474872672009' // @morethanmoney.pt
export const CONTA_PESSOAL = '17841405656956716' // @ricardogarciapt

/** Um rascunho em que o dono mexeu há menos disto fica quieto. */
export const JANELA_POST_H = 6
/** Um envio fica pendente pelo menos isto antes de o agente o deixar sair — é a janela de veto. */
export const JANELA_ENVIO_H = 3
/** Um envio por aprovar mais velho do que isto já não faz sentido: rejeita-se. */
export const ENVIO_VELHO_H = 72
/** Um post aprovado com hora já passada sai daqui a isto, para haver tempo de o desfazer. */
export const ADIAR_POST_MIN = 120
/** Tectos por passagem, para um erro de regra nunca despejar a fila inteira de uma vez. */
export const TECTO_POSTS = 3
export const TECTO_ENVIOS = 5
export const TECTO_COMENTARIOS = 50

const H = 3_600_000

export type Modo = 'ensaio' | 'ligado' | 'desligado'

export interface ConfigOperador {
  modo: Modo
  posts: boolean
  envios: boolean
  comentarios: boolean
}

export const CONFIG_INICIAL: ConfigOperador = { modo: 'ensaio', posts: true, envios: true, comentarios: true }

/** Lê `site_settings.operador`, venha como objecto ou como texto JSON. Qualquer coisa estranha → ensaio. */
export function lerConfig(valor: unknown): ConfigOperador {
  let v = valor
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      v = null
    }
  }
  if (!v || typeof v !== 'object') return { ...CONFIG_INICIAL }
  const o = v as Record<string, unknown>
  const modo: Modo = o.modo === 'ligado' || o.modo === 'desligado' ? o.modo : 'ensaio'
  return {
    modo,
    posts: o.posts !== false,
    envios: o.envios !== false,
    comentarios: o.comentarios !== false,
  }
}

export type Decisao<A extends string> = { acao: A; motivo: string; novoHorario?: string }

// ── Posts ────────────────────────────────────────────────────────────────────────────────────

export interface PostRascunho {
  id: string
  ig_account_id: string
  status: string
  caption: string | null
  media_urls: string[] | null
  scheduled_at: string | null
  updated_at: string | null
  created_at: string
}

export function decidirPost(p: PostRascunho, desfeitos: ReadonlySet<string>, agora = Date.now()): Decisao<'aprovar' | 'deixar'> {
  if (p.status !== 'draft') return { acao: 'deixar', motivo: 'não está em rascunho' }
  if (p.ig_account_id === CONTA_PESSOAL) return { acao: 'deixar', motivo: 'conta pessoal @ricardogarciapt: só à mão' }
  if (p.ig_account_id !== CONTA_MARCA) return { acao: 'deixar', motivo: 'conta desconhecida' }
  if (desfeitos.has(p.id)) return { acao: 'deixar', motivo: 'já o desfizeste uma vez; fica contigo' }

  const mexido = Date.parse(p.updated_at ?? p.created_at)
  if (Number.isFinite(mexido) && agora - mexido < JANELA_POST_H * H) {
    return { acao: 'deixar', motivo: `mexido há menos de ${JANELA_POST_H} h` }
  }
  if (!p.media_urls?.length) return { acao: 'deixar', motivo: 'sem imagem nem vídeo' }

  const legenda = p.caption ?? ''
  if (!legenda.trim()) return { acao: 'deixar', motivo: 'sem legenda' }
  if (/\[N[ÚU]MERO REAL\]/i.test(legenda)) return { acao: 'deixar', motivo: 'tem [NÚMERO REAL] por preencher' }
  const marca = guardaDaLegenda(legenda)
  if (!marca.ok) return { acao: 'deixar', motivo: marca.motivo }
  const problemas = peneira(legenda)
  if (problemas.length) return { acao: 'deixar', motivo: problemas.join('; ') }

  const quando = Date.parse(p.scheduled_at ?? '')
  if (!Number.isFinite(quando) || quando < agora + 30 * 60_000) {
    return {
      acao: 'aprovar',
      motivo: 'passou na peneira; a hora já tinha passado, sai daqui a 2 h',
      novoHorario: new Date(agora + ADIAR_POST_MIN * 60_000).toISOString(),
    }
  }
  return { acao: 'aprovar', motivo: 'passou na peneira da casa' }
}

// ── Envios por aprovar ─────────────────────────────────────────────────────────────────────────

export interface EnvioPendente {
  id: string
  kind: string
  status: string
  created_at: string
  payload: unknown
}

const KINDS_QUE_SAEM = new Set(['envio:telegram_followup', 'envio:email_recuperacao_checkout'])

export function decidirEnvio(e: EnvioPendente, agora = Date.now()): Decisao<'aprovar' | 'rejeitar' | 'deixar'> {
  if (e.status !== 'pendente') return { acao: 'deixar', motivo: 'não está pendente' }
  if (!KINDS_QUE_SAEM.has(e.kind)) return { acao: 'deixar', motivo: 'tipo que fica para uma pessoa (ex.: chamada)' }

  const idade = agora - Date.parse(e.created_at)
  if (!Number.isFinite(idade)) return { acao: 'deixar', motivo: 'sem data' }
  if (idade > ENVIO_VELHO_H * H) return { acao: 'rejeitar', motivo: `pendente há mais de ${ENVIO_VELHO_H} h; já não faz sentido` }
  if (idade < JANELA_ENVIO_H * H) return { acao: 'deixar', motivo: `janela de veto: espera ${JANELA_ENVIO_H} h` }

  const p = (e.payload ?? {}) as { texto?: unknown; assunto?: unknown; email?: unknown; chat_id?: unknown }
  const texto = typeof p.texto === 'string' ? p.texto : ''
  if (!texto.trim()) return { acao: 'deixar', motivo: 'sem texto' }
  if (e.kind === 'envio:email_recuperacao_checkout' && (typeof p.email !== 'string' || typeof p.assunto !== 'string')) {
    return { acao: 'deixar', motivo: 'email sem destinatário ou assunto' }
  }
  const problemas = peneira([typeof p.assunto === 'string' ? p.assunto : '', texto].join('\n'))
  // Um follow-up curto sobre o bot não tem de levar o aviso educativo; o resto da peneira vale.
  const graves = problemas.filter((m) => m !== 'fala de trading sem o aviso educativo')
  if (graves.length) return { acao: 'deixar', motivo: graves.join('; ') }
  return { acao: 'aprovar', motivo: 'passou na peneira e na janela de veto' }
}

// ── Fila de comentários do radar ──────────────────────────────────────────────────────────────

export interface ItemFila {
  id: string
  estado: string
  criado_em: string
}

export function decidirComentario(i: ItemFila, agora = Date.now()): Decisao<'saltar' | 'deixar'> {
  if (i.estado !== 'pronto' && i.estado !== 'aberto') return { acao: 'deixar', motivo: 'já tratado' }
  const idade = agora - Date.parse(i.criado_em)
  if (Number.isFinite(idade) && idade > RADAR_IDADE_MAX_DIAS * 24 * H) {
    return { acao: 'saltar', motivo: `escrito há mais de ${RADAR_IDADE_MAX_DIAS} dias; o post já arrefeceu` }
  }
  return { acao: 'deixar', motivo: 'ainda fresco' }
}
