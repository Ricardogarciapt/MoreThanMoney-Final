/**
 * GESTÃO → TELEGRAM → FORWARDER, a parte pura: o que é uma rota válida e como chega ao relay.
 * Sem rede — testável com `npx tsx lib/telegram/rotas.check.ts`.
 *
 * Uma rota é «lê a fonte com a sessão do dono, republica no destino pelo bot». Quem a executa é o
 * gmi-relay na VPS (`services/gmi-relay/relay.py`), que a pede a /api/telegram/relay-rotas.
 */
export const FILTROS = ['gold', 'all', 'astro'] as const
export type Filtro = (typeof FILTROS)[number]

export const NOME_FILTRO: Record<Filtro, string> = {
  gold: 'Só sinais (setups, TP/SL, pips)',
  all: 'Tudo, menos lixo',
  astro: 'Formato «I’m buying» + alvos',
}

/** O chat Premium: o único destino que EXECUTA nas contas dos clientes. */
export const DESTINO_PREMIUM = '-1002424441843'

export type RotaGuardada = {
  id: string
  relay: string
  nome: string
  fonte: string
  destino: string
  filtro: Filtro
  cabecalho: string | null
  app_only: boolean
  activa: boolean
  so_novas: boolean
  notas: string | null
  actualizado_em: string
}

export type RotaNova = Pick<RotaGuardada, 'nome' | 'fonte' | 'destino' | 'filtro' | 'cabecalho' | 'app_only' | 'activa' | 'notas'>

const ID_CHAT = /^-?\d{5,20}$/
const USERNAME = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/

/** Valida o que vem do formulário. Devolve a rota limpa, ou a razão em português. */
export function validarRota(entrada: Record<string, unknown>): { ok: true; rota: RotaNova } | { ok: false; erro: string } {
  const nome = String(entrada.nome ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  const fonte = String(entrada.fonte ?? '').trim()
  const destino = String(entrada.destino ?? '').trim()
  const filtro = String(entrada.filtro ?? 'gold') as Filtro
  const appOnly = entrada.app_only === true
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(nome)) return { ok: false, erro: 'O nome leva só letras, números e hífenes (2 a 40).' }
  if (!ID_CHAT.test(fonte) && !USERNAME.test(fonte)) return { ok: false, erro: 'A fonte é o id do chat (-100…) ou o @username do canal.' }
  if (!ID_CHAT.test(destino)) return { ok: false, erro: 'O destino é o id do chat MTM onde o bot publica (-100…).' }
  if (fonte === destino && !appOnly) return { ok: false, erro: 'A fonte e o destino são o mesmo chat.' }
  if (appOnly && destino === DESTINO_PREMIUM) return { ok: false, erro: 'Uma rota só-app nunca aponta à Premium: esse destino executa nas contas dos clientes.' }
  if (!FILTROS.includes(filtro)) return { ok: false, erro: 'Filtro desconhecido.' }
  const cabecalho = String(entrada.cabecalho ?? '').trim().slice(0, 80) || null
  const notas = String(entrada.notas ?? '').trim().slice(0, 300) || null
  return { ok: true, rota: { nome, fonte, destino, filtro, cabecalho, app_only: appOnly, activa: entrada.activa !== false, notas } }
}

/** Uma escrita que mexe na Premium pede a palavra (o painel pede-a, o servidor confirma). */
export const PALAVRA_PREMIUM = 'PREMIUM'
export const tocaPremium = (destino: string) => destino === DESTINO_PREMIUM

/** A rota no formato do RELAY_ROUTES que o relay.py já entendia. */
export function rotaParaRelay(r: RotaGuardada) {
  return {
    name: r.nome,
    source: /^-?\d+$/.test(r.fonte) ? Number(r.fonte) : r.fonte,
    dest: r.destino,
    filter: r.filtro,
    ...(r.cabecalho ? { header: r.cabecalho } : {}),
    ...(r.app_only ? { app_only: true } : {}),
    enabled: r.activa,
    so_novas: r.so_novas,
  }
}
