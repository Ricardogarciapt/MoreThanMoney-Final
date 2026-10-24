/**
 * GRUPOS E CANAIS NOVOS — pedidos feitos em Gestão → Telegram, criados pelo gmi-relay da VPS.
 *
 * O Bot API não cria grupos. Quem cria é a sessão pessoal do dono (Telethon, no relay), por isso
 * este caminho é lento de propósito: um pedido fica `pendente`, o relay apanha-o em até 2 min,
 * marca-o `a_criar`, cria, põe o bot como administrador e devolve o link de convite.
 *
 * O assistente de IA (dashboard-gestao, agente telegram_arquiteto) só cria `rascunho`: o relay
 * não lhe toca até o dono carregar em Aprovar. Criar um grupo com o nome dele não se desfaz.
 *
 * O limite diário (LIMITE_DIA) existe nos dois lados. Uma conta pessoal que cria grupos em série
 * leva FLOOD_WAIT ou pior, e com ela caíam os relays e a Premium.
 *
 *   npx tsx lib/telegram/grupos-novos.check.ts
 */
export const LIMITE_DIA = 3
export const BOT_DA_CASA = 'MoreThanMoney_aibot'
export const TIPOS = ['grupo', 'canal'] as const
export type TipoGrupo = (typeof TIPOS)[number]
export type EstadoPedido = 'rascunho' | 'pendente' | 'a_criar' | 'criado' | 'falhou' | 'cancelado'

export type PedidoGrupo = {
  id: string
  tipo: TipoGrupo
  titulo: string
  descricao: string | null
  bot: string | null
  estado: EstadoPedido
  chat_id: string | null
  convite: string | null
  erro: string | null
  criado_em: string
  tratado_em: string | null
}

export type PedidoNovo = { tipo: TipoGrupo; titulo: string; descricao: string | null; bot: string | null }

export function validarPedido(entrada: unknown): { ok: true; pedido: PedidoNovo } | { ok: false; erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>
  const tipo = String(e.tipo ?? '') as TipoGrupo
  if (!TIPOS.includes(tipo)) return { ok: false, erro: 'Escolhe grupo ou canal.' }
  const titulo = String(e.titulo ?? '').trim()
  if (titulo.length < 3 || titulo.length > 128) return { ok: false, erro: 'O nome leva entre 3 e 128 caracteres.' }
  const descricao = String(e.descricao ?? '').trim().slice(0, 255) || null
  const bot = String(e.bot ?? '').trim().replace(/^@/, '') || null
  if (bot && !/^[A-Za-z][A-Za-z0-9_]{3,31}bot$/i.test(bot)) return { ok: false, erro: `@${bot} não é um nome de bot.` }
  return { ok: true, pedido: { tipo, titulo, descricao, bot } }
}

/** Pedidos que contam para o limite: os das últimas 24 h que foram aprovados e não cancelados. */
export function contaParaLimite(pedidos: Pick<PedidoGrupo, 'estado' | 'criado_em'>[], agora = Date.now()): number {
  return pedidos.filter((p) => p.estado !== 'cancelado' && p.estado !== 'rascunho' && agora - Date.parse(p.criado_em) < 86_400_000).length
}

/** O que o relay recebe: só o que precisa para criar. */
export function pedidoParaRelay(p: PedidoGrupo) {
  return { id: p.id, tipo: p.tipo, titulo: p.titulo, descricao: p.descricao ?? '', bot: p.bot }
}

/** O relay devolve isto; um link de convite tem de ser da t.me. */
export function validarResultado(entrada: unknown):
  | { ok: true; id: string; estado: 'criado' | 'falhou'; chat_id: string | null; convite: string | null; erro: string | null }
  | { ok: false; erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>
  const id = String(e.id ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, erro: 'id inválido' }
  if (e.ok === true) {
    const chat_id = String(e.chat_id ?? '')
    if (!/^-?\d+$/.test(chat_id)) return { ok: false, erro: 'chat_id inválido' }
    const convite = e.convite ? String(e.convite) : null
    if (convite && !/^https:\/\/t\.me\//.test(convite)) return { ok: false, erro: 'convite inválido' }
    const erro = e.erro ? String(e.erro).slice(0, 300) : null
    return { ok: true, id, estado: 'criado', chat_id, convite, erro }
  }
  return { ok: true, id, estado: 'falhou', chat_id: null, convite: null, erro: String(e.erro ?? 'sem motivo').slice(0, 300) }
}

/** Token do @BotFather: `<id>:<35 caracteres>`. */
export function partirToken(token: string): { botId: number } | null {
  const m = /^(\d{5,15}):[A-Za-z0-9_-]{30,}$/.exec(token.trim())
  return m ? { botId: Number(m[1]) } : null
}
