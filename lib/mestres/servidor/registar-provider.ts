/**
 * REGISTAR UM PROVIDER NA CADEIA — mestre SIM + mestres_estrategias + rotas + canal de chat.
 *
 * Até 05/10 um provider criado no admin da MTM Auto ficava FORA do motor das mestres: sem linha em
 * `mestres_estrategias` não havia rotas, e sem canal no mapa fixo não havia T2T pelo motor. Entrar na
 * cadeia era um script à mão por estratégia (scripts/mestre-mtm-scanner-24-09.ts). Isto é esse script
 * generalizado e idempotente, chamado pelos dois admins (A pede ao site com o token do admin).
 *
 * Nasce tudo em SOMBRA: `modo`, `sinal_modo` e `t2t_modo` = 'sombra'. Ligar live é o dono, no admin,
 * com a palavra de confirmação e as guardas da 116 (trigger). Nenhuma ordem real sai daqui.
 *
 * A mestre: provider `mtmfunded` → a própria conta ligada (`funded_account_id`); qualquer outro tipo →
 * conta SIM da casa criada com `criarContaPlaneada` (papel 'casa', 10 000 USD, sem regras).
 *
 * IO injectável (`DepsRegistar`) para a guarda provar, sem base, que cada tipo produz mestre + rotas
 * + canal (lib/mestres/__tests__/registar-provider.check.ts).
 */
import { canalChatDoProvider } from '../canal-t2t'
import type { ResultadoSincronizacao } from './sincronizar-rotas'

export interface ProviderParaRegistar {
  id: string
  slug: string
  nome: string
  tipo: string
  funded_account_id?: string | null
  canal_chat?: string | null
  fonte_mtm?: string | null
  apagado_em?: string | null
}

export interface DepsRegistar {
  lerProvider(id: string): Promise<ProviderParaRegistar | null>
  lerMestre(slug: string): Promise<{ conta_mestre_id: string; modo: string } | null>
  /** cria a conta SIM da casa; devolve o id ou o erro */
  criarContaMestre(p: ProviderParaRegistar): Promise<{ id: string } | { erro: string }>
  /** insere a linha em mestres_estrategias (só quando não existe); devolve erro ou null */
  inserirMestre(linha: Record<string, unknown>): Promise<string | null>
  sincronizarRotas(slug: string): Promise<ResultadoSincronizacao>
  canalExiste(slug: string): Promise<boolean>
  criarCanal(linha: Record<string, unknown>): Promise<string | null>
  /** grava o canal derivado no provider quando estava vazio (para o admin o ver) */
  gravarCanalNoProvider(id: string, canal: string): Promise<void>
}

export interface ResultadoRegisto {
  ok: boolean
  erro?: string
  mestre?: { contaMestreId: string; criada: boolean; modo: string }
  rotas?: { criadas: number; actualizadas: number; retiradas: number; erros: string[] }
  canal?: { slug: string; criado: boolean }
}

/** A linha de mestres_estrategias de um provider novo — SOMBRA em tudo, contas MTM Auto incluídas. */
export function linhaMestreNova(p: ProviderParaRegistar, contaMestreId: string): Record<string, unknown> {
  return {
    provider_id: p.id, slug: p.slug, conta_mestre_id: contaMestreId,
    modo: 'sombra', sinal_modo: 'sombra', t2t_modo: 'sombra',
    incluir_mtmauto: true, copyfactory_ids: [],
    notas: `registada pelo admin a ${new Date().toISOString().slice(0, 10)} (provider ${p.tipo}) — nasce em sombra; ligar live é decisão do dono`,
  }
}

/** A linha de chat_channels do canal T2T de uma estratégia. */
export function linhaCanalNovo(p: ProviderParaRegistar, slug: string): Record<string, unknown> {
  return {
    slug, name: p.nome, description: 'Estratégia MTM — sinais Tap to Trade', parent_slug: 'sinais', position: 90,
    leitura: 'membros', escrita: 'ninguem', etiqueta: p.nome.slice(0, 24), hidden: false,
  }
}

export async function registarProvider(providerId: string, deps: DepsRegistar): Promise<ResultadoRegisto> {
  const p = await deps.lerProvider(providerId)
  if (!p) return { ok: false, erro: 'provider não encontrado' }
  if (p.apagado_em) return { ok: false, erro: 'provider apagado — não entra no motor' }

  // 1) mestre
  let mestre = await deps.lerMestre(p.slug)
  let criada = false
  if (!mestre) {
    let contaMestreId = p.tipo === 'mtmfunded' && p.funded_account_id ? String(p.funded_account_id) : null
    if (!contaMestreId) {
      const c = await deps.criarContaMestre(p)
      if ('erro' in c) return { ok: false, erro: `conta mestre: ${c.erro}` }
      contaMestreId = c.id
      criada = true
    }
    const erro = await deps.inserirMestre(linhaMestreNova(p, contaMestreId))
    if (erro) return { ok: false, erro: `mestres_estrategias: ${erro}` }
    mestre = { conta_mestre_id: contaMestreId, modo: 'sombra' }
  }

  // 2) rotas derivadas (o mesmo cálculo do quadro da cadeia e do script)
  const r = await deps.sincronizarRotas(p.slug)

  // 3) canal de chat T2T
  const canal = canalChatDoProvider(p)
  let canalCriado = false
  if (!(await deps.canalExiste(canal))) {
    const e = await deps.criarCanal(linhaCanalNovo(p, canal))
    if (e) return { ok: false, erro: `canal ${canal}: ${e}`, mestre: { contaMestreId: mestre.conta_mestre_id, criada, modo: mestre.modo }, rotas: r }
    canalCriado = true
  }
  if (!String(p.canal_chat ?? '').trim()) await deps.gravarCanalNoProvider(p.id, canal)

  return {
    ok: r.erros.length === 0,
    erro: r.erros.length ? r.erros.join('; ') : undefined,
    mestre: { contaMestreId: mestre.conta_mestre_id, criada, modo: mestre.modo },
    rotas: { criadas: r.criadas, actualizadas: r.actualizadas, retiradas: r.retiradas, erros: r.erros },
    canal: { slug: canal, criado: canalCriado },
  }
}

/** As dependências reais (Supabase + criarContaPlaneada + sincronizarRotasDaEstrategia). */
export async function depsReais(): Promise<DepsRegistar> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const { sincronizarRotasDaEstrategia } = await import('./sincronizar-rotas')
  const db = getSupabaseAdmin()
  const DONO = process.env.MTMFUNDED_DONO_CASA_EMAIL || 'ricardogarciapt@proton.me'
  return {
    async lerProvider(id) {
      const { data } = await db.from('mtmauto_providers').select('id, slug, nome, tipo, funded_account_id, canal_chat, fonte_mtm, apagado_em').eq('id', id).maybeSingle()
      return (data as ProviderParaRegistar | null) ?? null
    },
    async lerMestre(slug) {
      const { data } = await db.from('mestres_estrategias').select('conta_mestre_id, modo').ilike('slug', slug).maybeSingle()
      return data ? { conta_mestre_id: String(data.conta_mestre_id), modo: String(data.modo) } : null
    },
    async criarContaMestre(p) {
      const { criarContaPlaneada, SALDO_CASA } = await import('@/lib/mtmfunded/estrategias-sinais/contas')
      const { data: dono } = await db.from('profiles').select('id').ilike('email', DONO).maybeSingle()
      if (!dono) return { erro: `dono da casa (${DONO}) não encontrado` }
      const r = await criarContaPlaneada(String(dono.id), {
        papel: 'casa', slug: p.slug, rotulo: `Casa · ${p.nome}`, saldo: SALDO_CASA, tipo: 'provider', ligarNasApps: false, subscrever: false,
        // aceita_t2t a false: a mestre recebe do motor, e só do motor (ver scripts/mestre-mtm-scanner-24-09.ts)
        colunas: { provider_slug: p.slug, segue_estrategia: null, aceita_t2t: false, sem_regras: true, conta_casa: true, recolhe_todos_sinais: false },
      }, 'admin:registar-provider')
      if (r.erro || !r.accountId) return { erro: r.erro ?? 'sem conta' }
      await db.from('mtm_trading_accounts').update({ etiqueta: `Mestre · ${p.nome}` }).eq('id', r.accountId)
      return { id: r.accountId }
    },
    async inserirMestre(linha) {
      const { error } = await db.from('mestres_estrategias').insert(linha)
      return error ? error.message : null
    },
    sincronizarRotas: (slug) => sincronizarRotasDaEstrategia(slug),
    async canalExiste(slug) {
      const { data } = await db.from('chat_channels').select('slug').eq('slug', slug).maybeSingle()
      return Boolean(data)
    },
    async criarCanal(linha) {
      const { error } = await db.from('chat_channels').insert(linha)
      return error ? error.message : null
    },
    async gravarCanalNoProvider(id, canal) {
      await db.from('mtmauto_providers').update({ canal_chat: canal }).eq('id', id)
    },
  }
}
