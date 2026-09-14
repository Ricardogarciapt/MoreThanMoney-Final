import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos, pareceDemo, type Direitos, type MotivoCopia } from '@/lib/entitlements'

/**
 * QUEM PODE COPIAR A CONTA SIMULADA, E PARA ONDE.
 *
 * A cópia para a conta do aluno está incluída no MTM Copy e no MTM Auto — é software de cópia,
 * e é isso que esses produtos vendem. Premium ou VIP sozinhos NÃO dão isto (dão sinais; a cópia
 * automática dos sinais é outra coisa). A regra de `carregarDireitos` já ordena o motivo por
 * admin → MTM Copy → MTM Auto → VIP → Premium, por isso um VIP que também paga MTM Auto aparece
 * como `mtmauto` e entra.
 *
 * O destino é sempre uma conta que o aluno JÁ ligou num desses produtos. Não se cria conta nem se
 * gasta vaga: a conta já está contada pelas regras de contas de lib/entitlements.ts.
 *
 * Arranque prudente: só contas DEMO (excepto admin) enquanto `site_settings.funded_copier_reais`
 * não for `true`. Uma conta de que não se sabe o tipo conta como REAL — o erro seguro é recusar.
 */

export const MOTIVOS_QUE_COPIAM: MotivoCopia[] = ['admin', 'mtmcopy', 'mtmauto']

export type DestinoTipo = 'mtmcopy' | 'mtmauto' | 'tradelocker'

export function podeCopiarFunded(d: Pick<Direitos, 'motivoCopia' | 'admin'>): boolean {
  return d.admin || MOTIVOS_QUE_COPIAM.includes(d.motivoCopia)
}

export interface Destino {
  tipo: DestinoTipo
  id: string
  metaapiAccountId: string | null
  rotulo: string
  login: string | null
  servidor: string | null
  /** true = demo · false = real · null = não se sabe (trata-se como real) */
  demo: boolean | null
  ligado: boolean
  /** Esta conta também recebe cópia da CopyFactory / MTM Auto — duas fontes a abrir na mesma conta. */
  outraCopiaAtiva: boolean
  semComentario: boolean
}

/** Demo pela coluna guardada, depois pelo nome do servidor. Nada disto → desconhecido. */
export function classificarDemo(colunaDemo: boolean | null | undefined, servidor?: string | null, corretora?: string | null): boolean | null {
  if (colunaDemo === true) return true
  if (pareceDemo(servidor, corretora)) return true
  if (colunaDemo === false) return false
  // Um servidor com "live"/"real" no nome diz que é real; sem nome nenhum, não se sabe.
  if (/\b(live|real)\b/i.test(`${servidor ?? ''} ${corretora ?? ''}`)) return false
  return null
}

/** Pode usar este destino AGORA? (a regra do arranque prudente) */
export function destinoPermitido(destino: Pick<Destino, 'demo' | 'ligado' | 'metaapiAccountId' | 'tipo'>, admin: boolean, reaisLigadas: boolean): { ok: true } | { ok: false; motivo: string } {
  if (destino.tipo === 'tradelocker') return { ok: false, motivo: 'TradeLocker ainda não está disponível' }
  if (!destino.metaapiAccountId) return { ok: false, motivo: 'conta sem ligação à MetaApi' }
  if (!destino.ligado) return { ok: false, motivo: 'conta desligada — liga-a primeiro' }
  if (destino.demo !== true && !admin && !reaisLigadas) return { ok: false, motivo: 'Contas reais disponíveis em breve' }
  return { ok: true }
}

// ── recusar ABRIR (as saídas nunca passam por aqui) ──────────────────────────

export interface ContextoAbertura {
  interruptorGlobal: boolean
  contaEstado: string
  copierAtivo: boolean
  direitoOk: boolean
  destinoLigado: boolean
  simboloPermitido: boolean
  copiasAbertas: number
  maxPosicoes: number | null
  /** perda do dia em % da âncora (positivo = perda) */
  perdaDiariaPct: number | null
  perdaDiariaMax: number | null
  /** destino real sem autorização (reais desligadas e não admin) */
  destinoProibido?: string | null
}

/** O motivo pelo qual NÃO se abre esta cópia, ou null se pode abrir. Por ordem de gravidade. */
export function motivoParaNaoAbrir(c: ContextoAbertura): string | null {
  if (!c.interruptorGlobal) return 'interruptor funded_copier desligado'
  if (c.contaEstado !== 'ativa') return `conta simulada ${c.contaEstado}`
  if (!c.copierAtivo) return 'cópia em pausa'
  if (!c.direitoOk) return 'sem MTM Copy / MTM Auto activo'
  if (c.destinoProibido) return c.destinoProibido
  if (!c.destinoLigado) return 'destino desligado'
  if (!c.simboloPermitido) return 'símbolo fora da lista do copiador'
  if (c.maxPosicoes != null && c.maxPosicoes > 0 && c.copiasAbertas >= c.maxPosicoes) return `máximo de ${c.maxPosicoes} posições copiadas`
  if (c.perdaDiariaMax != null && c.perdaDiariaMax > 0 && c.perdaDiariaPct != null && c.perdaDiariaPct >= c.perdaDiariaMax) {
    return `perda diária de ${c.perdaDiariaPct.toFixed(2)}% atingiu o máximo de ${c.perdaDiariaMax}%`
  }
  return null
}

// ── leituras (servidor) ──────────────────────────────────────────────────────

export async function copiaReaisLigada(): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'funded_copier_reais').maybeSingle()
  return data?.value === true || data?.value === 'true'
}

/** As contas do aluno que podem receber a cópia (todas as ligadas; o ecrã marca as bloqueadas). */
export async function destinosDoUtilizador(userId: string): Promise<Destino[]> {
  const db = getSupabaseAdmin()
  const [{ data: copy }, { data: auto }] = await Promise.all([
    db.from('mtmcopy_connections')
      .select('id, metaapi_account_id, mt5_login, mt5_server, mt5_status, account_label, is_active, copyfactory_subscribed, t2t_enabled, purpose, copy_as_manual, prop_firm_type')
      .eq('user_id', userId),
    db.from('mtmauto_accounts')
      .select('id, metaapi_account_id, login, servidor, corretora, estado, rotulo, nome_exibicao, copia_ativa, demo, sem_comentario, prop_firm')
      .eq('user_id', userId)
      // Uma conta MTM Funded não é destino de cópia: não tem corretora, e copiar simulada para simulada não mede nada.
      .neq('plataforma', 'mtmfunded'),
  ])
  const out: Destino[] = []
  for (const c of copy ?? []) {
    out.push({
      tipo: 'mtmcopy', id: String(c.id), metaapiAccountId: (c.metaapi_account_id as string) || null,
      rotulo: String(c.account_label || `MTM Copy ${c.mt5_login ?? ''}`).trim(),
      login: (c.mt5_login as string) ?? null, servidor: (c.mt5_server as string) ?? null,
      demo: classificarDemo(null, c.mt5_server as string),
      ligado: String(c.mt5_status ?? '') === 'connected',
      outraCopiaAtiva: Boolean(c.copyfactory_subscribed) || (Boolean(c.is_active) && String(c.purpose ?? 'mtmcopy') !== 'tap_to_trade'),
      semComentario: Boolean(c.copy_as_manual) || Boolean(c.prop_firm_type),
    })
  }
  for (const a of auto ?? []) {
    out.push({
      tipo: 'mtmauto', id: String(a.id), metaapiAccountId: (a.metaapi_account_id as string) || null,
      rotulo: String(a.nome_exibicao || a.rotulo || `MTM Auto ${a.login ?? ''}`).trim(),
      login: (a.login as string) ?? null, servidor: (a.servidor as string) ?? null,
      demo: classificarDemo(a.demo as boolean | null, a.servidor as string, a.corretora as string),
      ligado: String(a.estado ?? '') === 'connected',
      outraCopiaAtiva: Boolean(a.copia_ativa),
      semComentario: Boolean(a.sem_comentario) || Boolean(a.prop_firm),
    })
  }
  return out
}

export async function destinoPorId(tipo: DestinoTipo, id: string): Promise<(Destino & { userId: string }) | null> {
  const db = getSupabaseAdmin()
  if (tipo === 'mtmcopy') {
    const { data } = await db.from('mtmcopy_connections').select('user_id').eq('id', id).maybeSingle()
    if (!data) return null
    const d = (await destinosDoUtilizador(String(data.user_id))).find((x) => x.tipo === tipo && x.id === id)
    return d ? { ...d, userId: String(data.user_id) } : null
  }
  if (tipo === 'mtmauto') {
    const { data } = await db.from('mtmauto_accounts').select('user_id').eq('id', id).maybeSingle()
    if (!data) return null
    const d = (await destinosDoUtilizador(String(data.user_id))).find((x) => x.tipo === tipo && x.id === id)
    return d ? { ...d, userId: String(data.user_id) } : null
  }
  return null
}

export async function elegibilidade(userId: string) {
  const [direitos, reais] = await Promise.all([carregarDireitos(userId), copiaReaisLigada()])
  return { direitos, elegivel: podeCopiarFunded(direitos), reais }
}
