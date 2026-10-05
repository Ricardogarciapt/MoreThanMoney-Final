/**
 * A REGRA da escrita única de uma estratégia — puro (sem Supabase, sem Next). Testado em
 * `lib/admin-centro/__tests__/estrategia-escrita.check.ts`.
 *
 * Porque existe: até 05/10 seis rotas escreviam `mtmauto_providers` e o admin da MTM Auto escrevia
 * `mtmauto_providers`/`mestres_estrategias` directamente. A mesma decisão («esta estratégia faz
 * trailing?», «pausa a cópia») tinha três portas, e cada porta tinha a sua versão da regra. Aqui fica
 * a regra UMA vez: quem pode decidir, e que update cada interruptor produz. O cano está em
 * `servidor/estrategia-escrita.ts`; as rotas antigas ficaram fachadas finas que lhe passam o pedido.
 *
 * Paridade: cada construtor de patch reproduz EXACTAMENTE o que a rota antiga gravava — o teste
 * guarda uma cópia da regra antiga e compara caso a caso.
 */

// ── quem decide ─────────────────────────────────────────────────────────────

/**
 * Quem está a pedir. `tudo` = admin do site ou super admin da MTM Auto (vê e decide em todas as
 * equipas). `tenantId` = a equipa de um franchisado — a fronteira dele.
 */
export interface QuemDecide {
  adminId: string
  tudo: boolean
  tenantId: string | null
  origem: 'site' | 'mtmauto'
}

/**
 * De onde vem a identidade. O admin do site (profiles.user_type='admin') decide tudo. Um admin da MTM
 * Auto (mtmauto_users.papel='admin') decide só na sua equipa — salvo super admin.
 *
 * `equipaPedida` só serve ao super admin para NAVEGAR numa equipa (listar só essa). Para um
 * franchisado é ignorada: uma fronteira que se contorna com um parâmetro na URL não é fronteira.
 */
export function decidirQuem(p: {
  userId: string | null
  adminDoSite: boolean
  mtmauto: { papel?: unknown; super_admin?: unknown; tenant_id?: unknown } | null
}): QuemDecide | null {
  if (!p.userId) return null
  if (p.adminDoSite) return { adminId: p.userId, tudo: true, tenantId: null, origem: 'site' }
  if (p.mtmauto && String(p.mtmauto.papel ?? '') === 'admin') {
    const sup = p.mtmauto.super_admin === true
    return { adminId: p.userId, tudo: sup, tenantId: sup ? null : (p.mtmauto.tenant_id ? String(p.mtmauto.tenant_id) : null), origem: 'mtmauto' }
  }
  return null
}

/** A equipa que a LISTA mostra. Super admin: a pedida (ou todas). Franchisado: sempre a dele. */
export function equipaDaVista(q: QuemDecide, equipaPedida?: string | null): { todas: boolean; tenantId: string | null } {
  if (!q.tudo) return { todas: false, tenantId: q.tenantId }
  const e = String(equipaPedida ?? '').trim()
  return e ? { todas: false, tenantId: e } : { todas: true, tenantId: null }
}

/**
 * O alcance de cada acção.
 *  · `equipa` — mexe só na linha da estratégia (opções, trailing, fonte, apagar, registar, conta):
 *    o franchisado decide nas da SUA equipa.
 *  · `casa`   — mexe no motor partilhado (modos da mestre, rotas do Premium/T2T, espelho, CopyFactory,
 *    equipas onde aparece, subscritores de outros): só o admin do site / super admin. As mestres
 *    executam nas contas de clientes que não são do franchisado.
 */
export type Alcance = 'equipa' | 'casa'

export const ALCANCE: Record<string, Alcance> = {
  opcoes: 'equipa',
  trailing: 'equipa',
  saidas: 'equipa',
  fonte: 'equipa',
  apagar: 'equipa',
  apagar_parando: 'equipa',
  restaurar: 'equipa',
  registar: 'equipa',
  gravar: 'equipa',
  conta: 'equipa',
  mestres: 'casa',
  rota_provider: 'casa',
  canal_extra: 'casa',
  espelho: 'casa',
  criar: 'casa',
  equipas: 'casa',
  subscritor: 'casa',
  conta_mestre: 'casa',
}

export type Decisao = { ok: true } | { ok: false; status: number; erro: string }

/** A guarda de TODAS as escritas: o caso mau é um franchisado da equipa X a escrever na Y. */
export function podeDecidir(q: QuemDecide | null, accao: string, alvo: { tenant_id?: unknown } | null): Decisao {
  if (!q) return { ok: false, status: 403, erro: 'Só administradores.' }
  const alcance = ALCANCE[accao]
  if (!alcance) return { ok: false, status: 400, erro: `Acção desconhecida: ${accao}.` }
  if (q.tudo) return { ok: true }
  if (alcance === 'casa') return { ok: false, status: 403, erro: 'Isto mexe no motor da casa — só o admin do site ou o super admin.' }
  // Estratégia nova (sem alvo) nasce na equipa de quem a cria — ver linhaGravavel.
  if (!alvo) return { ok: true }
  const t = alvo.tenant_id == null ? null : String(alvo.tenant_id)
  if (!q.tenantId || t !== q.tenantId) return { ok: false, status: 403, erro: 'Esta estratégia não é da tua equipa.' }
  return { ok: true }
}

// ── patches (paridade com as rotas antigas) ─────────────────────────────────

/** Trailing: número > 0 ou nada. Igual à rota antiga `/api/admin/mtmcopy/trailing-estrategias`. */
export const pipsOuNada = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Só os campos do trailing que vieram no pedido. O resto da linha tem os seus ecrãs. */
export function patchTrailing(corpo: Record<string, unknown>, agoraIso: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: agoraIso }
  if (corpo.trailing_tempo_real !== undefined) patch.trailing_tempo_real = corpo.trailing_tempo_real === true
  if (corpo.trailing_arranca_pips !== undefined) patch.trailing_arranca_pips = pipsOuNada(corpo.trailing_arranca_pips)
  if (corpo.trailing_distancia_pips !== undefined) patch.trailing_distancia_pips = pipsOuNada(corpo.trailing_distancia_pips)
  if (corpo.trailing_passo_pips !== undefined) patch.trailing_passo_pips = pipsOuNada(corpo.trailing_passo_pips)
  return patch
}

/**
 * Saídas parciais (% por TP). Cada uma em ]0,100] e a soma até 100; lista vazia = sem parciais (null).
 * Antes só a MTM Auto as escrevia, sem validar — uma soma de 130 % fechava mais do que a posição tinha.
 */
export function saidasValidas(v: unknown): { ok: true; valor: number[] | null } | { ok: false; erro: string } {
  if (v == null || (Array.isArray(v) && v.length === 0)) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, erro: 'saídas: lista de percentagens' }
  const xs = v.map(Number)
  if (xs.some((x) => !Number.isFinite(x) || x <= 0 || x > 100)) return { ok: false, erro: 'cada saída entre 0 e 100 %' }
  if (xs.reduce((a, x) => a + x, 0) > 100) return { ok: false, erro: 'as saídas somam mais de 100 %' }
  return { ok: true, valor: xs }
}

/** Espelho provider: o que se segue da mestre MetaApi. */
export function configEspelho(c: Record<string, unknown> | null | undefined): { seguirFechos: string; seguirParciais: boolean; copiarNiveisIniciais: boolean } {
  const x = c ?? {}
  const sf = String(x.seguirFechos ?? 'humanos')
  return {
    seguirFechos: ['humanos', 'todos', 'nenhum'].includes(sf) ? sf : 'humanos',
    seguirParciais: x.seguirParciais === true,
    copiarNiveisIniciais: x.copiarNiveisIniciais !== false,
  }
}

/** Pausar/religar a cópia de uma rota provider espelha em `ativo` (a MTM Auto filtra por ele). */
export const patchPausaCopia = (valor: boolean): Record<string, unknown> => ({ ativo: valor })

/** Canais T2T sem rota própria que o admin pode ligar à mão. */
// `ideias-e-sinais` (Forex Swings) saiu a 04/10/2026 — canal fechado pelo dono; não há o que ligar.
export const CANAIS_T2T_EXTRA = ['aurum-flow', 'premium-ideas', 'sinais-scanner-mtm', 'trade-ideas-setup', 'sinais-goldkiller', 'sensei-scanner']

export function alternarCanalExtra(actuais: string[] | null | undefined, canal: string, valor: boolean): string[] | null {
  if (!CANAIS_T2T_EXTRA.includes(canal)) return null
  const s = new Set(actuais ?? [])
  if (valor) s.add(canal)
  else s.delete(canal)
  return [...s]
}

/** Uma rota provider com o interruptor mudado — copia (`enabled`) ou T2T (`tap_to_trade`). */
export function rotasComInterruptor<R extends { id: string; enabled?: boolean; tap_to_trade?: boolean }>(
  rotas: R[], routeId: string, campo: 'copia' | 't2t', valor: boolean,
): R[] {
  return rotas.map((r) => (r.id !== routeId ? r : campo === 'copia' ? { ...r, enabled: valor } : { ...r, tap_to_trade: valor }))
}

// ── gravar a linha (vinda da MTM Auto) ───────────────────────────────────────

/**
 * Colunas que a MTM Auto pode gravar ao criar/editar. NÃO estão aqui: `apagado_em/_por` (só pelo
 * apagar), `fonte_execucao` (só pela função da 084), `espelho_*` (casa), `funded_account_id`
 * (só pela ligação da conta), `fonte_desligada_*` (decisão do dono, por SQL).
 */
export const COLUNAS_GRAVAVEIS = [
  'id', 'criado_por', 'tenant_id', 'slug', 'nome', 'descricao', 'tipo', 'fonte_mtm',
  'metaapi_account_id', 'metaapi_chave_equipa', 'login', 'servidor', 'plataforma',
  'telegram_bot_id', 'telegram_chat_id', 'telegram_chat_titulo', 'mt5_estado', 'mt5_password_cifrada',
  'canal_chat', 'ativo', 'espelhar', 'sl_minimo_pips', 'trailing_arranca_pips', 'trailing_distancia_pips',
  'trailing_passo_pips', 'trailing_tempo_real', 'risco_default_pct', 'be_gatilho', 'max_trades_dia',
  'simbolos_permitidos', 'saidas_pct', 'updated_at',
]

/**
 * A linha que se grava, já com a equipa certa. Um franchisado não escolhe equipa: a estratégia é da
 * dele, venha o que vier no pedido. Editar uma que já existe noutra equipa é recusado antes (podeDecidir).
 */
export function linhaGravavel(linha: Record<string, unknown>, q: QuemDecide, antes: { tenant_id?: unknown } | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of COLUNAS_GRAVAVEIS) if (k in linha) out[k] = linha[k]
  if (!q.tudo) out.tenant_id = q.tenantId
  else if (!('tenant_id' in linha) && antes) out.tenant_id = antes.tenant_id ?? null
  return out
}

/** As colunas da CONTA de uma estratégia, por tipo (ligações de conta da MTM Auto). */
export const COLUNAS_CONTA: Record<string, string[]> = {
  metaapi: ['tipo', 'metaapi_account_id', 'metaapi_chave_equipa', 'plataforma', 'login', 'servidor', 'updated_at'],
  mtmfunded: ['tipo', 'funded_account_id', 'updated_at'],
  tradelocker: ['tipo', 'tl_env', 'tl_server', 'tl_account_id', 'tl_acc_num', 'updated_at'],
  telegram: ['tipo', 'telegram_bot_id', 'telegram_chat_id', 'fonte_mtm', 'metaapi_account_id', 'updated_at'],
}

export function patchConta(tipo: string, campos: Record<string, unknown>): Record<string, unknown> | null {
  const cols = COLUNAS_CONTA[tipo]
  if (!cols) return null
  const out: Record<string, unknown> = {}
  for (const k of cols) if (k in campos) out[k] = campos[k]
  out.tipo = tipo
  return out
}
