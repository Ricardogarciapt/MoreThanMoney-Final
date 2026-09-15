/**
 * REGRAS DAS ROTAS — que pares se podem ligar, identidade física das contas, ciclos, fan-out e as
 * fechaduras do modo live. Puro e testado (lib/copia-contas/__tests__/copia-contas.check.ts).
 *
 * As mesmas regras vivem na base (trigger copia_rotas_guarda, migração 078): a API recusa cedo com
 * uma mensagem clara; a base recusa sempre, mesmo a uma linha escrita à mão.
 */
import type { ModoRota, OrigemRef, PlataformaCopia, RotaCopia } from './tipos'
import { PLATAFORMAS_COPIA } from './tipos'

/** Máximo de destinos por conta de origem. Igual ao `v_max_fanout` do trigger. */
export const MAX_FANOUT = 5

/** Palavra a escrever para pedir o modo live. */
export const PALAVRA_LIVE = 'LIGAR'

export interface LinhaContaCopia {
  ref: string
  plataforma: PlataformaCopia
  userId: string
  login?: string | null
  servidor?: string | null
  tlEnv?: string | null
  tlAccountId?: string | null
  fundedAccountId?: string | null
  metaapiAccountId?: string | null
  /** ligada com investor / só leitura → não pode ser destino */
  soLeitura?: boolean
}

export function lerRef(ref: unknown): { origem: OrigemRef; id: string } | null {
  const m = /^(site|auto|wt|funded):([0-9a-f-]{36})$/i.exec(String(ref ?? ''))
  return m ? { origem: m[1].toLowerCase() as OrigemRef, id: m[2].toLowerCase() } : null
}

/**
 * Identidade FÍSICA da conta. A mesma conta MT5 ligada no T2T e no MTM Auto tem duas linhas e uma
 * só chave — é por isso que os ciclos e o «mesma conta» se medem aqui e não pela referência.
 */
export function chaveFisica(c: Pick<LinhaContaCopia, 'plataforma' | 'login' | 'servidor' | 'tlEnv' | 'tlAccountId' | 'fundedAccountId' | 'ref'>): string | null {
  if (c.plataforma === 'mtmfunded') {
    const id = c.fundedAccountId ?? (lerRef(c.ref)?.origem === 'funded' ? lerRef(c.ref)!.id : null)
    return id ? `mtmfunded:${String(id).toLowerCase()}` : null
  }
  if (c.plataforma === 'tradelocker') {
    return c.tlAccountId && c.tlEnv ? `tl:${String(c.tlEnv).toLowerCase()}:${String(c.tlAccountId)}` : null
  }
  const login = String(c.login ?? '').replace(/\D/g, '')
  const servidor = String(c.servidor ?? '').trim().toLowerCase()
  return login && servidor ? `mt:${login}@${servidor}` : null
}

export type ErroRota =
  | 'plataforma_invalida'
  | 'mesma_conta'
  | 'dono_diferente'
  | 'destino_so_leitura'
  | 'sem_identidade'
  | 'fanout'
  | 'ciclo'
  | 'duplicada'

export const MENSAGEM_ERRO_ROTA: Record<ErroRota, string> = {
  plataforma_invalida: 'Plataforma não suportada na cópia entre contas.',
  mesma_conta: 'A origem e o destino são a mesma conta.',
  dono_diferente: 'A origem e o destino têm de ser do mesmo utilizador.',
  destino_so_leitura: 'O destino está ligado só em leitura (password investor) — não pode receber ordens.',
  sem_identidade: 'Não foi possível identificar uma das contas (falta login/servidor ou conta TradeLocker).',
  fanout: `Esta conta de origem já tem ${MAX_FANOUT} destinos (máximo).`,
  ciclo: 'Esta rota fecha um ciclo — a origem acabaria a copiar-se a si própria.',
  duplicada: 'Já existe uma rota entre estas duas contas.',
}

export interface ArestaRota {
  id?: string
  origem_chave: string
  destino_chave: string
  estado?: string
}

/** Há caminho de `de` até `ate` pelas arestas (ignora recusadas)? */
export function existeCaminho(arestas: ArestaRota[], de: string, ate: string, ignorarId?: string): boolean {
  const vivas = arestas.filter((a) => a.estado !== 'recusada' && (!ignorarId || a.id !== ignorarId))
  const vistos = new Set<string>()
  const fila = [de]
  while (fila.length) {
    const atual = fila.shift()!
    if (atual === ate) return true
    if (vistos.has(atual)) continue
    vistos.add(atual)
    for (const a of vivas) if (a.origem_chave === atual && !vistos.has(a.destino_chave)) fila.push(a.destino_chave)
  }
  return false
}

/** A rota nova (origem→destino) fecha um ciclo? Igual a: do destino chega-se à origem. */
export function criaCiclo(arestas: ArestaRota[], nova: ArestaRota): boolean {
  return existeCaminho(arestas, nova.destino_chave, nova.origem_chave, nova.id)
}

export function destinosDaOrigem(arestas: ArestaRota[], origemChave: string, ignorarId?: string): number {
  return arestas.filter((a) => a.estado !== 'recusada' && a.origem_chave === origemChave && a.id !== ignorarId).length
}

/** Validação completa de uma rota nova (ou editada) contra as existentes. */
export function validarRota(
  origem: LinhaContaCopia,
  destino: LinhaContaCopia,
  existentes: ArestaRota[],
  opcoes: { id?: string } = {},
): { ok: true; origemChave: string; destinoChave: string } | { ok: false; erro: ErroRota; mensagem: string } {
  const falha = (erro: ErroRota) => ({ ok: false as const, erro, mensagem: MENSAGEM_ERRO_ROTA[erro] })
  if (!PLATAFORMAS_COPIA.includes(origem.plataforma) || !PLATAFORMAS_COPIA.includes(destino.plataforma)) return falha('plataforma_invalida')
  if (origem.userId !== destino.userId) return falha('dono_diferente')
  if (destino.soLeitura) return falha('destino_so_leitura')
  const origemChave = chaveFisica(origem)
  const destinoChave = chaveFisica(destino)
  if (!origemChave || !destinoChave) return falha('sem_identidade')
  if (origem.ref === destino.ref || origemChave === destinoChave) return falha('mesma_conta')
  const vivas = existentes.filter((a) => a.estado !== 'recusada' && a.id !== opcoes.id)
  if (vivas.some((a) => a.origem_chave === origemChave && a.destino_chave === destinoChave)) return falha('duplicada')
  if (destinosDaOrigem(vivas, origemChave) >= MAX_FANOUT) return falha('fanout')
  if (criaCiclo(vivas, { id: opcoes.id, origem_chave: origemChave, destino_chave: destinoChave })) return falha('ciclo')
  return { ok: true, origemChave, destinoChave }
}

// ── fechaduras ───────────────────────────────────────────────────────────────

export interface Interruptores {
  /** site_settings.copia_contas.ligado */
  globalLigado: boolean
  /** site_settings.copia_contas_live_desbloqueado */
  liveDesbloqueado: boolean
  /** COPIA_ESCRITA=1 no processo do VPS */
  escritaNoProcesso: boolean
}

export const INTERRUPTORES_FECHADOS: Interruptores = { globalLigado: false, liveDesbloqueado: false, escritaNoProcesso: false }

/**
 * O que o motor faz com uma rota:
 *   'parado'  → não lê a fonte nem processa (global desligado, rota inactiva/por aprovar/pausada)
 *   'sombra'  → calcula e regista a acção pretendida; NUNCA chama um escritor
 *   'live'    → envia (só com as três fechaduras abertas E a rota em live)
 */
export function modoEfectivo(
  rota: Pick<RotaCopia, 'ativa' | 'estado' | 'modo'>,
  s: Interruptores,
): 'parado' | 'sombra' | 'live' {
  if (!s.globalLigado || !rota.ativa || rota.estado !== 'aprovada') return 'parado'
  if (rota.modo === 'live' && s.liveDesbloqueado && s.escritaNoProcesso) return 'live'
  return 'sombra'
}

/**
 * Pedido de mudança de modo pela API. Passar a live exige a palavra escrita e o desbloqueio da
 * instalação — nesta entrega o desbloqueio não existe, por isso a resposta é sempre «bloqueado».
 */
export function pedidoDeModo(
  pedido: { modo: ModoRota; confirmacao?: string | null },
  rota: Pick<RotaCopia, 'estado'>,
  liveDesbloqueado: boolean,
): { ok: true } | { ok: false; status: number; erro: string } {
  if (pedido.modo === 'shadow') return { ok: true }
  if (pedido.modo !== 'live') return { ok: false, status: 400, erro: 'modo inválido' }
  if (String(pedido.confirmacao ?? '').trim() !== PALAVRA_LIVE) {
    return { ok: false, status: 400, erro: `Para passar a live escreve «${PALAVRA_LIVE}».` }
  }
  if (rota.estado !== 'aprovada') return { ok: false, status: 409, erro: 'A rota tem de estar aprovada.' }
  if (!liveDesbloqueado) {
    return { ok: false, status: 423, erro: 'O modo live está bloqueado nesta instalação (copia_contas_live_desbloqueado=false). Nesta entrega a cópia corre só em sombra.' }
  }
  return { ok: true }
}
