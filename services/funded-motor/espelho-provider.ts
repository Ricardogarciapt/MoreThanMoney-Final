/**
 * ESPELHO PROVIDER — a conta MTM Funded da casa que espelha cada estratégia com gestão NOSSA.
 *
 * As decisões são puras (lib/mtmfunded/espelho/provider.ts, com teste). Aqui só há canos:
 *
 *  · LER a mestre por EVENTO (espelho-leitor.ts, aoEvento): cada onPositionUpdated / onPositionRemoved
 *    / onDealAdded chega com a hora de chegada e é tratado NO PRÓPRIO evento — sem debounce, sem
 *    sondagem de posições. Na (re)sincronização compara-se o terminalState com o que se conhecia
 *    (posições abertas/fechadas enquanto a ligação esteve caída). Zero RPC.
 *  · ABRIR a entrada da mestre na conta espelho ao NOSSO preço (funded_precos do motor), com a
 *    ponte funded_espelho_posicoes como cadeado contra duplicação (mesma tabela da 070).
 *  · GERIR a cada tick do nosso feed (o motor chama `aoTick`): break-even, trailing e parciais com
 *    as regras da estratégia (mtmauto_providers). Estado em memória; na base só o SL e os factos
 *    (funded_fechar_parcial, funded_fechar_posicao) — o trigger da 078 transforma-os em eventos
 *    de cópia (sombra) sem mais nada.
 *  · FECHAR por SL/TP é do motor (avaliacao.ts), que lê o SL que escrevemos; o motor avisa-nos
 *    (`aoFechoLocal`). Fechos DISCRICIONÁRIOS da mestre (deal com razão humana) são seguidos.
 *  · COMPARAR: no fim de cada trade, uma linha em espelho_comparacao (mestre vs espelho).
 *
 * Latências medidas (pulso de minuto a minuto, servicos_pulso):
 *   rede        hora da mestre (updateTime/time) → evento recebido no VPS
 *   entrada     evento recebido → posição escrita na conta espelho
 *   tickSl      tick do feed → SL escrito (BE/trailing)
 *   tickParcial tick do feed → parcial escrito
 *
 * MOTOR_ESCRITA=0 → `[provider][seco]` no log e nada na base. ESPELHO_PROVIDER=1 liga isto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MapaPrecos, Simbolo } from '../../lib/mtmfunded/simulado/matematica'
import { planearAbertura, planearFecho, posicaoDaLinha, precoFresco } from '../../lib/mtmfunded/simulado/ordens'
import { comentarioEstrategia, posicaoMestreDaMetaApi, simboloDoCatalogo, volumeEspelho, type PosicaoMestre } from '../../lib/mtmfunded/espelho/calculo'
import {
  alvosDaTrade, configEspelho, decidirGestaoProvider, diffMestre, gestaoInicial, Latencias, montarComparacao, msEntre,
  razaoDeGestao, regrasDoProvider, seguirSaidaMestre,
  type ConfigEspelhoProvider, type ConhecidaMestre, type EstadoGestao, type MovimentoSl, type RegrasEstrategia, type Saida,
} from '../../lib/mtmfunded/espelho/provider'
import { LeitorMestre, sdkMetaApi, type SdkEspelho } from './espelho-leitor'
import { espelhoPausadoAte, registarErroMetaApi } from './metaapi-partilhada'

export interface ContextoProvider {
  db: SupabaseClient
  metaapiToken: string
  escrita: boolean
  log: (...a: unknown[]) => void
  simbolos: Map<string, Simbolo>
  precos: MapaPrecos
  precoEm: Map<string, number>
  negociavel: (sym: string) => boolean
  marcarSuja: (accountId: string) => void
  sdk?: SdkEspelho
}

/** Símbolos canónicos com posições (ou entradas à espera) no espelho provider — o motor pede-os rápidos. */
export const simbolosDoProvider = new Set<string>()

const ATRASO_MAX_MS = Number(process.env.ESPELHO_ATRASO_MAX_MIN || 30) * 60_000
const ESPERA_DEAL_MS = Number(process.env.ESPELHO_PROVIDER_ESPERA_DEAL_MS || 1500)

interface Provider {
  id: string
  slug: string
  nome: string
  mestreId: string
  contaId: string
  regras: RegrasEstrategia
  cfg: ConfigEspelhoProvider
  conta: { sim_saldo: number; sim_equity: number | null; alavancagem: number }
  iniciadoEm: number
  conhecidas: Map<string, ConhecidaMestre>
  /** Posições da mestre que já existiam antes de ligar: não se copiam. */
  antigas: Set<string>
  trades: Map<string, TradeMestre>
  espelhos: Map<string, PosEspelho>
  /** À espera de preço para abrir: id da mestre → posição. */
  aEsperar: Map<string, { p: PosicaoMestre; recebidoEm: number }>
  deals: Set<string>
}

interface TradeMestre {
  id: string
  symbolMestre: string
  canon: string | null
  direcao: 'buy' | 'sell'
  volumeAbertura: number
  volume: number
  entrada: number
  sl: number | null
  tp: number | null
  abertaEm: string | null
  recebidoEm: number
  slMov: MovimentoSl[]
  saidas: Saida[]
  ultimoPreco: number | null
  fechadaEm: string | null
  reinicio: boolean
  latRede: number | null
  latEntrada: number | null
}

interface PosEspelho {
  positionId: string
  ponteId: string
  canon: string
  direcao: 'buy' | 'sell'
  entrada: number
  volumeAbertura: number
  volume: number
  sl: number | null
  tp: number | null
  est: EstadoGestao
  abertaEm: string
  slMov: MovimentoSl[]
  ocupado: boolean
  fechada: boolean
}

export interface ControloProvider {
  aoTick(sym: string, tickEm: number): void
  aoFechoLocal(positionId: string): void
  estado(): Record<string, unknown>
  parar(): Promise<void>
}

export function iniciarEspelhoProvider(ctx: ContextoProvider): ControloProvider {
  const { db, log } = ctx
  const providers = new Map<string, Provider>() // slug → provider
  const leitores = new Map<string, LeitorMestre>() // mestreId → leitor
  const timers: NodeJS.Timeout[] = []
  let parado = false
  let sdk: SdkEspelho | null = ctx.sdk ?? null
  let semColunas = false
  const lat = { rede: new Latencias(), entrada: new Latencias(), tickSl: new Latencias(), tickParcial: new Latencias(), fechoSeguido: new Latencias() }
  let ticksGeridos = 0
  const ultimoSeco = new Map<string, number>()
  const seco = (chave: string, ...a: unknown[]) => {
    const agora = Date.now()
    if (agora - (ultimoSeco.get(chave) ?? 0) < 60_000) return
    ultimoSeco.set(chave, agora)
    log('[provider][seco]', ...a)
  }
  const curto = (p: Provider) => `[provider] ${p.slug}`

  // ── carregar a configuração ─────────────────────────────────────────────
  async function carregar(): Promise<void> {
    const { data, error } = await db.from('mtmauto_providers')
      .select('id, slug, nome, metaapi_account_id, espelho_funded_account_id, espelho_provider_ativo, espelho_config, be_gatilho, trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips, saidas_pct, trailing_tempo_real')
      .eq('espelho_provider_ativo', true).not('espelho_funded_account_id', 'is', null)
    if (error) {
      if (/does not exist/.test(error.message)) {
        if (!semColunas) log('[provider] migração 082 por aplicar — espelho provider parado (volta a tentar de 5 em 5 min)')
        semColunas = true
      } else log('[provider] leitura dos providers falhou:', error.message)
      return
    }
    semColunas = false
    const ids = (data ?? []).map((r) => String(r.espelho_funded_account_id))
    const { data: contas } = ids.length
      ? await db.from('mtm_trading_accounts').select('id, sim_saldo, sim_equity, alavancagem, motor, estado').in('id', ids)
      : { data: [] as Record<string, unknown>[] }
    const contaPor = new Map((contas ?? []).map((c) => [String(c.id), c]))
    const vistos = new Set<string>()
    for (const r of data ?? []) {
      const slug = String(r.slug)
      const mestreId = r.metaapi_account_id as string | null
      const c = contaPor.get(String(r.espelho_funded_account_id))
      if (!mestreId) { seco(`sem-mestre:${slug}`, `${slug}: sem conta-mestre MetaApi`); continue }
      if (!c || c.motor !== 'sim' || c.estado !== 'ativa') { seco(`sem-conta:${slug}`, `${slug}: conta espelho não é simulada activa`); continue }
      vistos.add(slug)
      const existente = providers.get(slug)
      const conta = { sim_saldo: Number(c.sim_saldo ?? 0), sim_equity: c.sim_equity == null ? null : Number(c.sim_equity), alavancagem: Number(c.alavancagem ?? 100) }
      if (existente && existente.mestreId === mestreId && existente.contaId === String(c.id)) {
        existente.regras = regrasDoProvider(r)
        existente.cfg = configEspelho(r.espelho_config)
        existente.conta = conta
        continue
      }
      if (existente) await largar(existente)
      const p: Provider = {
        id: String(r.id), slug, nome: String(r.nome ?? slug), mestreId, contaId: String(c.id),
        regras: regrasDoProvider(r), cfg: configEspelho(r.espelho_config), conta, iniciadoEm: Date.now(),
        conhecidas: new Map(), antigas: new Set(), trades: new Map(), espelhos: new Map(), aEsperar: new Map(), deals: new Set(),
      }
      providers.set(slug, p)
      await restaurar(p)
      ligarLeitor(p)
      log(`${curto(p)} ligado · mestre ${mestreId.slice(0, 8)} → conta ${p.contaId.slice(0, 8)} · seguir fechos ${p.cfg.seguirFechos} · ${p.espelhos.size} posição(ões) retomada(s)`)
    }
    for (const [slug, p] of [...providers]) if (!vistos.has(slug)) await largar(p)
  }

  async function largar(p: Provider): Promise<void> {
    providers.delete(p.slug)
    if (![...providers.values()].some((x) => x.mestreId === p.mestreId)) {
      await leitores.get(p.mestreId)?.fechar().catch(() => undefined)
      leitores.delete(p.mestreId)
    }
    log(`${curto(p)} desligado`)
  }

  /** Reinício: pontes abertas + linhas em_curso voltam à memória. As movimentações de SL antes da paragem perdem-se (marcado `reinicio`). */
  async function restaurar(p: Provider): Promise<void> {
    const { data: pontes } = await db.from('funded_espelho_posicoes')
      .select('id, master_position_id, funded_position_id, volume_seguidora_abertura, estado')
      .eq('follower_account_id', p.contaId).eq('master_account_id', p.mestreId).in('estado', ['aberta', 'recusada']).limit(2000)
    for (const b of pontes ?? []) p.antigas.add(String(b.master_position_id)) // nunca reabrir
    const abertas = (pontes ?? []).filter((b) => b.estado === 'aberta' && b.funded_position_id)
    const { data: linhas } = await db.from('espelho_comparacao')
      .select('master_position_id, symbol, direcao, master_volume, master_entrada, master_aberta_em, latencia_entrada_ms, latencia_rede_ms')
      .eq('espelho_account_id', p.contaId).eq('estado', 'em_curso').limit(2000)
    for (const l of linhas ?? []) {
      const id = String(l.master_position_id)
      p.trades.set(id, {
        id, symbolMestre: String(l.symbol), canon: String(l.symbol), direcao: l.direcao as 'buy' | 'sell',
        volumeAbertura: Number(l.master_volume), volume: Number(l.master_volume), entrada: Number(l.master_entrada),
        sl: null, tp: null, abertaEm: (l.master_aberta_em as string) ?? null, recebidoEm: Date.now(), slMov: [], saidas: [],
        ultimoPreco: null, fechadaEm: null, reinicio: true,
        latRede: l.latencia_rede_ms == null ? null : Number(l.latencia_rede_ms), latEntrada: l.latencia_entrada_ms == null ? null : Number(l.latencia_entrada_ms),
      })
    }
    if (!abertas.length) return
    const { data: pos } = await db.from('funded_positions').select('*').in('id', abertas.map((b) => String(b.funded_position_id))).eq('estado', 'aberta')
    const porId = new Map((pos ?? []).map((x) => [String(x.id), x]))
    for (const b of abertas) {
      const r = porId.get(String(b.funded_position_id))
      if (!r) continue
      const s = ctx.simbolos.get(String(r.symbol))
      if (!s) continue
      const volAb = Number(b.volume_seguidora_abertura ?? r.volume)
      const alvos = (r.tick_entrada as { alvos?: number[] } | null)?.alvos ?? (r.tp != null ? [Number(r.tp)] : [])
      const est = gestaoInicial(p.regras, s, { direcao: r.direcao, entrada: Number(r.preco_entrada), sl: numOu(r.tick_entrada?.sl_inicial) ?? numOu(r.sl), volume: volAb }, alvos)
      // TPs já atingidos: deduz-se pelo volume que já saiu.
      if (est.gestao.tps) {
        const fechado = volAb > 0 ? 1 - Number(r.volume) / volAb : 0
        let acum = 0
        for (const t of est.gestao.tps) { acum += t.pct / 100; if (fechado >= acum - 0.01) t.atingido = true }
      }
      const sinal = r.direcao === 'buy' ? 1 : -1
      if (r.sl != null && (Number(r.sl) - Number(r.preco_entrada)) * sinal >= 0) est.gestao.be_feito = true
      p.espelhos.set(String(b.master_position_id), {
        positionId: String(r.id), ponteId: String(b.id), canon: s.symbol, direcao: r.direcao, entrada: Number(r.preco_entrada),
        volumeAbertura: volAb, volume: Number(r.volume), sl: numOu(r.sl), tp: numOu(r.tp), est, abertaEm: String(r.aberta_em ?? r.created_at ?? new Date().toISOString()),
        slMov: [], ocupado: false, fechada: false,
      })
      simbolosDoProvider.add(s.symbol)
    }
  }

  // ── a mestre, por evento ─────────────────────────────────────────────────
  function ligarLeitor(p: Provider): void {
    if (leitores.has(p.mestreId) || pausado()) return
    try {
      if (!sdk) sdk = sdkMetaApi(ctx.metaapiToken)
      const l = new LeitorMestre(p.mestreId, sdk, {
        log, aoMudar: () => undefined, aoErroMetaApi: registarErroMetaApi,
        aoEvento: (tipo, dados, recebidoEm) => {
          for (const x of providers.values()) if (x.mestreId === p.mestreId) void aoEvento(x, tipo, dados, recebidoEm).catch((e) => log(`${curto(x)} evento ${tipo}:`, e instanceof Error ? e.message : e))
        },
      })
      leitores.set(p.mestreId, l)
      l.iniciar()
    } catch (e) {
      log(`${curto(p)} leitor não arrancou:`, e instanceof Error ? e.message : e)
    }
  }

  function pausado(): boolean {
    if (!espelhoPausadoAte()) return false
    for (const l of leitores.values()) void l.fechar().catch(() => undefined)
    leitores.clear()
    return true
  }

  async function aoEvento(p: Provider, tipo: string, dados: unknown, recebidoEm: number): Promise<void> {
    const leitor = leitores.get(p.mestreId)
    if (!leitor) return
    if (tipo === 'sincronizada') return reconciliar(p, leitor, recebidoEm)
    if (tipo === 'queda') return
    // Um deal é um facto (preço, volume, razão) mesmo a meio de uma ressincronização: regista-se sempre.
    if (tipo === 'deal') return aoDeal(p, dados as Record<string, unknown>)
    if (!leitor.sincronizada) return // durante a sincronização manda a reconciliação no fim
    if (tipo === 'removida') return aoRemovida(p, String(dados))
    if (tipo === 'posicao') {
      const bruta = dados as Record<string, unknown>
      const pos = posicaoMestreDaMetaApi(bruta)
      if (!pos) return
      const t = p.trades.get(pos.id)
      if (t) t.ultimoPreco = numOu(bruta.currentPrice) ?? t.ultimoPreco
      const antes = p.conhecidas.get(pos.id)
      if (!antes) return aoNova(p, pos, recebidoEm, numOu(bruta.updateTime ? new Date(bruta.updateTime as string).getTime() : null))
      const d = diffMestre(new Map([[pos.id, antes]]), [pos])
      for (const a of d.alteradas) aoAlterada(p, a.atual, a.slMudou || a.tpMudou, bruta, recebidoEm)
    }
  }

  /** Fim de (re)sincronização: o terminalState manda. Posições abertas/fechadas durante a queda. */
  async function reconciliar(p: Provider, leitor: LeitorMestre, recebidoEm: number): Promise<void> {
    const lidas = leitor.ler()
    if (!lidas) return
    const d = diffMestre(p.conhecidas, lidas)
    for (const pos of d.novas) {
      const conhecidaDaBase = p.trades.has(pos.id) || p.espelhos.has(pos.id)
      const aberta = pos.time ? new Date(pos.time).getTime() : 0
      if (conhecidaDaBase) {
        p.conhecidas.set(pos.id, { volume: pos.volume, sl: pos.sl, tp: pos.tp })
        const t = p.trades.get(pos.id)
        if (t) { t.sl = pos.sl; t.tp = pos.tp; t.volume = pos.volume; t.symbolMestre = pos.symbol }
        continue
      }
      // Anterior ao arranque (com 2 min de folga para um reinício rápido) ou velha demais: não se copia.
      if (p.antigas.has(pos.id) || aberta < p.iniciadoEm - 120_000 || Date.now() - aberta > ATRASO_MAX_MS) {
        p.antigas.add(pos.id)
        p.conhecidas.set(pos.id, { volume: pos.volume, sl: pos.sl, tp: pos.tp })
        continue
      }
      await aoNova(p, pos, recebidoEm, null)
    }
    for (const a of d.alteradas) aoAlterada(p, a.atual, a.slMudou || a.tpMudou, null, recebidoEm)
    for (const id of d.removidas) await aoRemovida(p, id)
    // Trades restauradas da base cuja posição já não está na mestre (fechou com o motor parado).
    for (const [id, t] of p.trades) {
      if (!t.fechadaEm && !lidas.some((x) => x.id === id) && !p.conhecidas.has(id)) await aoRemovida(p, id)
    }
  }

  async function aoNova(p: Provider, pos: PosicaoMestre, recebidoEm: number, updateMs: number | null): Promise<void> {
    if (p.antigas.has(pos.id) || p.trades.has(pos.id)) return
    p.conhecidas.set(pos.id, { volume: pos.volume, sl: pos.sl, tp: pos.tp })
    const canon = simboloDoCatalogo(pos.symbol, ctx.simbolos)
    const horaMestre = pos.time ? new Date(pos.time).getTime() : updateMs
    const t: TradeMestre = {
      id: pos.id, symbolMestre: pos.symbol, canon, direcao: pos.direcao, volumeAbertura: pos.volume, volume: pos.volume,
      entrada: pos.openPrice, sl: pos.sl, tp: pos.tp, abertaEm: pos.time, recebidoEm, slMov: [{ sl: pos.sl, tp: pos.tp, em: pos.time ?? new Date(recebidoEm).toISOString(), motivo: 'abertura' }],
      saidas: [], ultimoPreco: null, fechadaEm: null, reinicio: false, latRede: msEntre(horaMestre, recebidoEm), latEntrada: null,
    }
    p.trades.set(pos.id, t)
    lat.rede.registar(t.latRede)
    if (canon) simbolosDoProvider.add(canon)
    await abrirEspelho(p, pos, recebidoEm)
  }

  function aoAlterada(p: Provider, pos: PosicaoMestre, niveis: boolean, bruta: Record<string, unknown> | null, recebidoEm: number): void {
    const t = p.trades.get(pos.id)
    p.conhecidas.set(pos.id, { volume: pos.volume, sl: pos.sl, tp: pos.tp })
    if (!t) return
    if (niveis) {
      const em = bruta?.updateTime ? new Date(bruta.updateTime as string).toISOString() : new Date(recebidoEm).toISOString()
      t.slMov.push({ sl: pos.sl, tp: pos.tp, em, latenciaMs: bruta?.updateTime ? msEntre(em, recebidoEm) : null })
      t.sl = pos.sl
      t.tp = pos.tp
    }
    t.volume = pos.volume
  }

  function aoDeal(p: Provider, d: Record<string, unknown>): void {
    const posId = d.positionId != null ? String(d.positionId) : null
    const entrada = String(d.entryType ?? '')
    if (!posId || !/DEAL_ENTRY_(OUT|OUT_BY|INOUT)/.test(entrada)) return
    const t = p.trades.get(posId)
    const dealId = String(d.id ?? `${posId}:${d.time}:${d.volume}`)
    if (!t || p.deals.has(dealId)) return
    p.deals.add(dealId)
    const volume = Number(d.volume)
    const preco = Number(d.price)
    if (!(volume > 0) || !(preco > 0)) return
    const em = d.time ? new Date(d.time as string).toISOString() : new Date().toISOString()
    t.saidas.push({ preco, volume, em, motivo: razaoDeGestao(d.reason as string) })
    const fechado = t.saidas.reduce((a, s) => a + s.volume, 0)
    const total = fechado >= t.volumeAbertura - 1e-9
    if (!total && seguirSaidaMestre(p.cfg, d.reason as string, false)) {
      void seguirParcial(p, t, volume / t.volumeAbertura, d.reason as string).catch((e) => log(`${curto(p)} parcial seguido:`, e instanceof Error ? e.message : e))
    }
  }

  const aFechar = new Set<string>()
  async function aoRemovida(p: Provider, id: string): Promise<void> {
    p.conhecidas.delete(id)
    p.aEsperar.delete(id)
    const t = p.trades.get(id)
    if (!t || t.fechadaEm || aFechar.has(`${p.slug}:${id}`)) return
    aFechar.add(`${p.slug}:${id}`)
    try { await concluirFecho(p, id, t) } finally { aFechar.delete(`${p.slug}:${id}`) }
  }

  async function concluirFecho(p: Provider, id: string, t: TradeMestre): Promise<void> {
    // O deal do fecho pode chegar uns ms depois da remoção: espera-se um pouco por ele.
    await new Promise((r) => setTimeout(r, ESPERA_DEAL_MS))
    const ultimo = t.saidas[t.saidas.length - 1]
    t.fechadaEm = ultimo?.em ?? new Date().toISOString()
    const razao = ultimo ? ({ humana: 'DEAL_REASON_CLIENT', sl: 'DEAL_REASON_SL', tp: 'DEAL_REASON_TP', stop_out: 'DEAL_REASON_SO', expert: 'DEAL_REASON_EXPERT' } as Record<string, string>)[ultimo.motivo] ?? null : null
    const esp = p.espelhos.get(id)
    if (esp && !esp.fechada && seguirSaidaMestre(p.cfg, razao, true)) {
      const inicio = Date.now()
      await fecharEspelho(p, esp, 'estrategia')
      lat.fechoSeguido.registar(msEntre(t.fechadaEm, Date.now()))
      log(`${curto(p)} seguiu o fecho ${ultimo?.motivo ?? 'desconhecido'} da mestre #${id} em ${Date.now() - inicio} ms`)
    }
    await tentarCompletar(p, id)
  }

  // ── abrir ────────────────────────────────────────────────────────────────
  function precoVivo(sym: string) {
    const pr = ctx.precos[sym]
    const em = ctx.precoEm.get(sym)
    if (!pr || !em || !precoFresco(new Date(em)) || !ctx.negociavel(sym)) return null
    return { preco: pr, em }
  }

  async function abrirEspelho(p: Provider, mp: PosicaoMestre, recebidoEm: number): Promise<void> {
    const symbol = simboloDoCatalogo(mp.symbol, ctx.simbolos)
    const t = p.trades.get(mp.id)
    const recusar = async (motivo: string) => {
      p.aEsperar.delete(mp.id)
      if (!ctx.escrita) return seco(`recusa:${mp.id}`, `${p.slug} recusaria ${mp.symbol} #${mp.id}: ${motivo}`)
      log(`${curto(p)} não abre ${mp.symbol} #${mp.id}: ${motivo}`)
      const { error } = await db.from('funded_espelho_posicoes').insert({
        follower_account_id: p.contaId, master_account_id: p.mestreId, master_position_id: mp.id, estrategia: p.slug,
        master_symbol: mp.symbol, symbol, direcao: mp.direcao, volume_master_abertura: mp.volume,
        preco_master_abertura: mp.openPrice, master_aberta_em: mp.time, estado: 'recusada', erro: motivo.slice(0, 500),
      })
      if (error && error.code !== '23505') log(`${curto(p)} ponte:`, error.message)
    }
    if (!symbol) return recusar(`símbolo ${mp.symbol} não existe no catálogo`)
    const s = ctx.simbolos.get(symbol)!
    const vivo = precoVivo(symbol)
    if (!vivo) {
      // Event-driven: o próximo tick deste símbolo volta a tentar (aoTick).
      p.aEsperar.set(mp.id, { p: mp, recebidoEm })
      simbolosDoProvider.add(symbol)
      return seco(`sem-preco:${symbol}`, `${p.slug} à espera de preço para ${symbol}`)
    }
    p.aEsperar.delete(mp.id)
    const eqM = leitores.get(p.mestreId)?.equity() ?? null
    const tamanho = volumeEspelho({
      volumeMestre: mp.volume, equityMestre: eqM, equitySeguidora: p.conta.sim_equity ?? p.conta.sim_saldo,
      simbolo: s, contratoMestre: leitores.get(p.mestreId)?.contrato(mp.symbol) ?? null,
    })
    if (!tamanho.ok) {
      if (tamanho.motivo.includes('equity da mestre')) { p.aEsperar.set(mp.id, { p: mp, recebidoEm }); return }
      return recusar(tamanho.motivo)
    }
    const { data: abertas } = ctx.escrita ? await db.from('funded_positions').select('*').eq('account_id', p.contaId).eq('estado', 'aberta') : { data: [] }
    const simbolosAbertos: Record<string, Simbolo> = { [symbol]: s }
    for (const r of abertas ?? []) { const x = ctx.simbolos.get(String(r.symbol)); if (x) simbolosAbertos[x.symbol] = x }
    const plano = planearAbertura({
      simbolo: s, direcao: mp.direcao, volume: tamanho.volume, sl: null, tp: null, preco: vivo.preco,
      saldo: p.conta.sim_saldo, alavancagemConta: p.conta.alavancagem,
      posicoesAbertas: (abertas ?? []).map(posicaoDaLinha), simbolos: simbolosAbertos, precos: ctx.precos, regras: null,
    })
    if (!plano.ok) return recusar(plano.erro)
    const px = plano.precoExecucao
    const lado = (nivel: number | null, tipo: 'sl' | 'tp') => {
      if (nivel == null || !p.cfg.copiarNiveisIniciais) return null
      const acima = nivel > px
      return (mp.direcao === 'buy' ? (tipo === 'sl' ? !acima : acima) : (tipo === 'sl' ? acima : !acima)) ? nivel : null
    }
    const sl = lado(mp.sl, 'sl')
    const tp = lado(mp.tp, 'tp')
    const decididoEm = Date.now()
    if (!ctx.escrita) return seco(`abrir:${mp.id}`, `${p.slug} abriria ${mp.direcao} ${symbol} ${plano.volume} @${px} SL ${sl} TP ${tp} (evento→decisão ${decididoEm - recebidoEm} ms)`)

    const { data: ponte, error: ePonte } = await db.from('funded_espelho_posicoes').insert({
      follower_account_id: p.contaId, master_account_id: p.mestreId, master_position_id: mp.id, estrategia: p.slug,
      symbol, master_symbol: mp.symbol, direcao: mp.direcao, volume_master_abertura: mp.volume, volume_master_atual: mp.volume,
      volume_seguidora_abertura: plano.volume, escala: tamanho.escala, preco_master_abertura: mp.openPrice,
      master_aberta_em: mp.time, estado: 'aberta',
    }).select('id').single()
    if (ePonte || !ponte) { if (ePonte?.code !== '23505') log(`${curto(p)} ponte:`, ePonte?.message); return }
    const tick = { bid: vivo.preco.bid, ask: vivo.preco.ask, em: new Date(vivo.em).toISOString(), fonte: 'metaapi:puprime' }
    const { data: pos, error: ePos } = await db.from('funded_positions').insert({
      account_id: p.contaId, symbol, direcao: mp.direcao, volume: plano.volume, preco_entrada: px, sl, tp,
      comissao: plano.comissao, estado: 'aberta', origem: 'estrategia', comentario: `${comentarioEstrategia(p.slug, p.nome)} EP`.slice(0, 31),
      ideia_ref: `espelho-provider:${p.slug}:${mp.id}`.slice(0, 200),
      tick_entrada: {
        ...tick, espelho_provider: true, evento_recebido_em: new Date(recebidoEm).toISOString(), decidido_em: new Date(decididoEm).toISOString(),
        sl_inicial: sl, mestre: { conta: p.mestreId, posicao: mp.id, simbolo: mp.symbol, preco: mp.openPrice, volume: mp.volume, equity: eqM, aberta_em: mp.time },
      },
    }).select('id, aberta_em').single()
    if (ePos || !pos) {
      await db.from('funded_espelho_posicoes').update({ estado: 'recusada', erro: `insert: ${ePos?.message ?? 'sem linha'}`.slice(0, 500) }).eq('id', ponte.id)
      return
    }
    const escritoEm = Date.now()
    await db.from('funded_espelho_posicoes').update({ funded_position_id: pos.id, updated_at: new Date().toISOString() }).eq('id', ponte.id)
    if (plano.comissao) await db.rpc('funded_somar_saldo', { p_conta: p.contaId, p_delta: -plano.comissao })
    ctx.marcarSuja(p.contaId)

    const est = gestaoInicial(p.regras, s, { direcao: mp.direcao, entrada: px, sl, volume: plano.volume }, alvosDaTrade(mp.direcao, px, null, tp))
    const esp: PosEspelho = {
      positionId: String(pos.id), ponteId: String(ponte.id), canon: symbol, direcao: mp.direcao, entrada: px,
      volumeAbertura: plano.volume, volume: plano.volume, sl, tp, est, abertaEm: String(pos.aberta_em ?? new Date(escritoEm).toISOString()),
      slMov: [{ sl, tp, em: new Date(escritoEm).toISOString(), motivo: 'abertura' }], ocupado: false, fechada: false,
    }
    p.espelhos.set(mp.id, esp)
    simbolosDoProvider.add(symbol)
    if (t) t.latEntrada = escritoEm - recebidoEm
    lat.entrada.registar(escritoEm - recebidoEm)
    log(`${curto(p)} abriu ${mp.direcao} ${symbol} ${plano.volume} @${px} (mestre ${mp.volume} @${mp.openPrice}) · evento→escrita ${escritoEm - recebidoEm} ms · rede ${t?.latRede ?? '?'} ms`)

    await db.from('espelho_comparacao').upsert({
      estrategia: p.slug, master_account_id: p.mestreId, master_position_id: mp.id, espelho_account_id: p.contaId,
      funded_position_id: pos.id, symbol, direcao: mp.direcao, master_volume: mp.volume, espelho_volume: plano.volume,
      master_entrada: mp.openPrice, master_aberta_em: mp.time, espelho_entrada: px, espelho_aberta_em: esp.abertaEm,
      latencia_entrada_ms: escritoEm - recebidoEm, latencia_rede_ms: t?.latRede ?? null, estado: 'em_curso',
    }, { onConflict: 'espelho_account_id,master_position_id' })

    // Os alvos do sinal (TP1..TP3) chegam depois, sem atrasar a entrada.
    void alvosDoSinal(p, mp.id).then(async (tps) => {
      if (!tps?.length || esp.fechada) return
      const alvos = alvosDaTrade(mp.direcao, px, tps, tp)
      if (alvos.length < 2) return
      const novo = gestaoInicial(p.regras, s, { direcao: mp.direcao, entrada: px, sl, volume: plano.volume }, alvos)
      novo.gestao.be_feito = esp.est.gestao.be_feito
      novo.ultimaEscritaSlEm = esp.est.ultimaEscritaSlEm
      esp.est = novo
      await db.from('funded_positions').update({ tick_entrada: { ...tick, espelho_provider: true, evento_recebido_em: new Date(recebidoEm).toISOString(), decidido_em: new Date(decididoEm).toISOString(), sl_inicial: sl, alvos } }).eq('id', esp.positionId)
      log(`${curto(p)} ${symbol} alvos ${alvos.join(' / ')} · saídas ${novo.gestao.tps?.map((x) => x.pct).join('/')}`)
    }).catch(() => undefined)
  }

  async function alvosDoSinal(p: Provider, masterPosId: string): Promise<number[] | null> {
    const { data } = await db.from('mtmauto_signals').select('tps').eq('ref_externa', `pos:${masterPosId}`).limit(1).maybeSingle()
    return Array.isArray(data?.tps) ? (data!.tps as unknown[]).map(Number) : null
  }

  // ── gerir, a cada tick ──────────────────────────────────────────────────
  function aoTick(sym: string, tickEm: number): void {
    if (parado || !providers.size) return
    for (const p of providers.values()) {
      for (const [id, e] of p.aEsperar) {
        if (simboloDoCatalogo(e.p.symbol, ctx.simbolos) !== sym) continue
        p.aEsperar.delete(id)
        if (Date.now() - e.recebidoEm > ATRASO_MAX_MS) { log(`${curto(p)} desistiu de ${e.p.symbol} #${id}: sem preço/equity há ${Math.round(ATRASO_MAX_MS / 60000)} min`); continue }
        void abrirEspelho(p, e.p, e.recebidoEm).catch(() => undefined)
      }
      for (const [masterId, esp] of p.espelhos) {
        if (esp.canon !== sym || esp.fechada || esp.ocupado) continue
        const s = ctx.simbolos.get(sym)
        const pr = ctx.precos[sym]
        if (!s || !pr || !ctx.negociavel(sym)) continue
        const agora = Date.now()
        const d = decidirGestaoProvider({ id: esp.positionId, direcao: esp.direcao, entrada: esp.entrada, volume: esp.volume, sl: esp.sl, tp: esp.tp }, esp.est, p.regras, s, pr, ctx.precos, agora)
        if (d.beFeito) esp.est.gestao.be_feito = true
        if (!d.parciais.length && d.novoSl == null) continue
        ticksGeridos++
        esp.ocupado = true
        void aplicarGestao(p, masterId, esp, s, d, tickEm).catch((e) => log(`${curto(p)} gestão ${sym}:`, e instanceof Error ? e.message : e)).finally(() => { esp.ocupado = false })
      }
    }
  }

  async function aplicarGestao(p: Provider, masterId: string, esp: PosEspelho, s: Simbolo, d: ReturnType<typeof decidirGestaoProvider>, tickEm: number): Promise<void> {
    const tickJson = (motivo?: string) => ({ bid: ctx.precos[s.symbol]?.bid, ask: ctx.precos[s.symbol]?.ask, em: new Date(tickEm).toISOString(), fonte: 'metaapi:puprime', espelho_provider: true, decidido_em: new Date().toISOString(), ...(motivo ? { motivo } : {}) })
    for (const x of d.parciais) {
      if (!ctx.escrita) { seco(`parcial:${esp.positionId}:${x.indice}`, `${p.slug} TP${x.indice + 1} fecharia ${x.volume} ${s.symbol} @${x.preco} pnl ${x.pnl}${x.fechaTudo ? ' (tudo)' : ''}`); return }
      if (x.fechaTudo) {
        const { data: ganhou, error } = await db.rpc('funded_fechar_posicao', { p_id: esp.positionId, p_preco: x.preco, p_pnl: x.pnl, p_motivo: 'tp', p_tick: tickJson(`tp${x.indice + 1}`) })
        if (error) return log(`${curto(p)} TP final falhou:`, error.message)
        esp.fechada = true
        lat.tickParcial.registar(Date.now() - tickEm)
        log(`${curto(p)} TP${x.indice + 1} fechou tudo ${s.symbol} @${x.preco}${ganhou ? '' : ' (já estava fechada)'}`)
        await db.from('funded_espelho_posicoes').update({ estado: 'fechada', fechado_pct: 1, updated_at: new Date().toISOString() }).eq('id', esp.ponteId)
        ctx.marcarSuja(p.contaId)
        return tentarCompletar(p, masterId)
      }
      const { data: filha, error } = await db.rpc('funded_fechar_parcial', { p_mae: esp.positionId, p_volume: x.volume, p_preco: x.preco, p_pnl: x.pnl, p_tick: tickJson(`tp${x.indice + 1}_parcial`) })
      if (error || !filha) return log(`${curto(p)} TP${x.indice + 1} parcial falhou:`, error?.message ?? 'posição mudou')
      esp.volume = Math.round((esp.volume - x.volume) * 100) / 100
      if (esp.est.gestao.tps?.[x.indice]) esp.est.gestao.tps[x.indice].atingido = true
      lat.tickParcial.registar(Date.now() - tickEm)
      ctx.marcarSuja(p.contaId)
      log(`${curto(p)} TP${x.indice + 1} parcial ${x.volume} ${s.symbol} @${x.preco} pnl ${x.pnl} · tick→escrita ${Date.now() - tickEm} ms`)
    }
    if (d.novoSl != null && d.novoSl !== esp.sl) {
      if (!ctx.escrita) { seco(`sl:${esp.positionId}`, `${p.slug} ${d.motivoSl} ${s.symbol} SL ${esp.sl} → ${d.novoSl}`); return }
      let q = db.from('funded_positions').update({ sl: d.novoSl }).eq('id', esp.positionId).eq('estado', 'aberta')
      q = esp.sl == null ? q.is('sl', null) : q.eq('sl', esp.sl)
      const { data, error } = await q.select('id')
      if (error) return log(`${curto(p)} SL falhou:`, error.message)
      if (!data?.length) {
        // Alguém mexeu (ou fechou): relê a linha para a memória voltar a bater certo.
        const { data: r } = await db.from('funded_positions').select('sl, estado, volume').eq('id', esp.positionId).maybeSingle()
        if (!r || r.estado !== 'aberta') { esp.fechada = true; return tentarCompletar(p, masterId) }
        esp.sl = numOu(r.sl)
        esp.volume = Number(r.volume)
        return
      }
      const escrito = Date.now()
      esp.slMov.push({ sl: d.novoSl, em: new Date(escrito).toISOString(), motivo: d.motivoSl ?? undefined, latenciaMs: escrito - tickEm })
      esp.sl = d.novoSl
      esp.est.ultimaEscritaSlEm = escrito
      lat.tickSl.registar(escrito - tickEm)
      ctx.marcarSuja(p.contaId)
      if (d.motivoSl === 'break_even' || esp.slMov.length % 10 === 2) log(`${curto(p)} ${d.motivoSl} ${s.symbol} SL → ${d.novoSl} · tick→escrita ${escrito - tickEm} ms`)
    }
  }

  // ── seguir saídas da mestre ─────────────────────────────────────────────
  async function seguirParcial(p: Provider, t: TradeMestre, fracao: number, razao: string): Promise<void> {
    const esp = p.espelhos.get(t.id)
    if (!esp || esp.fechada || esp.ocupado) return
    const s = ctx.simbolos.get(esp.canon)
    const vivo = precoVivo(esp.canon)
    if (!s || !vivo) return
    const alvo = Math.floor((esp.volumeAbertura * fracao) / s.volume_step + 1e-9) * s.volume_step
    if (!ctx.escrita) return seco(`seguir-parcial:${t.id}`, `${p.slug} seguiria parcial ${razao} ${Math.round(fracao * 100)}% de ${esp.canon}`)
    esp.ocupado = true
    try {
      const { data: linha } = await db.from('funded_positions').select('*').eq('id', esp.positionId).eq('estado', 'aberta').maybeSingle()
      if (!linha) return
      const plano = planearFecho(posicaoDaLinha(linha), s, vivo.preco, ctx.precos, Math.round(alvo * 100) / 100)
      if (!plano.ok || !plano.parcial) return
      const { data: filha } = await db.rpc('funded_fechar_parcial', { p_mae: esp.positionId, p_volume: plano.volumeFechado, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_tick: { bid: vivo.preco.bid, ask: vivo.preco.ask, em: new Date(vivo.em).toISOString(), espelho_provider: true, seguiu: razao } })
      if (filha) { esp.volume = plano.volumeRestante; ctx.marcarSuja(p.contaId) }
    } finally {
      esp.ocupado = false
    }
  }

  async function fecharEspelho(p: Provider, esp: PosEspelho, motivo: 'estrategia'): Promise<void> {
    const s = ctx.simbolos.get(esp.canon)
    const vivo = precoVivo(esp.canon)
    if (!s || !vivo) return log(`${curto(p)} fecho seguido de ${esp.canon} sem preço — fica com a gestão própria`)
    if (!ctx.escrita) return seco(`fechar:${esp.positionId}`, `${p.slug} fecharia ${esp.canon} (fecho da mestre)`)
    const { data: linha } = await db.from('funded_positions').select('*').eq('id', esp.positionId).eq('estado', 'aberta').maybeSingle()
    if (!linha) { esp.fechada = true; return }
    const plano = planearFecho(posicaoDaLinha(linha), s, vivo.preco, ctx.precos, null)
    if (!plano.ok) return log(`${curto(p)} fecho recusado: ${plano.erro}`)
    const { error } = await db.rpc('funded_fechar_posicao', { p_id: esp.positionId, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_motivo: motivo, p_tick: { bid: vivo.preco.bid, ask: vivo.preco.ask, em: new Date(vivo.em).toISOString(), espelho_provider: true, seguiu: 'mestre' } })
    if (error) return log(`${curto(p)} fecho falhou:`, error.message)
    esp.fechada = true
    await db.from('funded_espelho_posicoes').update({ estado: 'fechada', fechado_pct: 1, volume_master_atual: 0, updated_at: new Date().toISOString() }).eq('id', esp.ponteId)
    ctx.marcarSuja(p.contaId)
  }

  function aoFechoLocal(positionId: string): void {
    for (const p of providers.values()) {
      for (const [masterId, esp] of p.espelhos) {
        if (esp.positionId !== positionId || esp.fechada) continue
        esp.fechada = true
        void db.from('funded_espelho_posicoes').update({ estado: 'fechada', fechado_pct: 1, updated_at: new Date().toISOString() }).eq('id', esp.ponteId)
        void tentarCompletar(p, masterId).catch((e) => log(`${curto(p)} completar:`, e instanceof Error ? e.message : e))
      }
    }
  }

  /** Rede por baixo: posições do espelho fechadas por fora (site, admin) — 1 leitura por minuto. */
  async function verificarFechadas(): Promise<void> {
    for (const p of providers.values()) {
      const abertas = [...p.espelhos.entries()].filter(([, e]) => !e.fechada)
      if (!abertas.length) continue
      const { data } = await db.from('funded_positions').select('id, estado').in('id', abertas.map(([, e]) => e.positionId))
      const estado = new Map((data ?? []).map((r) => [String(r.id), r.estado]))
      for (const [masterId, e] of abertas) {
        if (estado.get(e.positionId) === 'aberta') continue
        if (!data) continue
        e.fechada = true
        await tentarCompletar(p, masterId)
      }
    }
  }

  // ── comparação ─────────────────────────────────────────────────────────
  async function tentarCompletar(p: Provider, masterId: string): Promise<void> {
    const t = p.trades.get(masterId)
    const esp = p.espelhos.get(masterId)
    if (!t?.fechadaEm) return
    if (esp && !esp.fechada) return
    const s = t.canon ? ctx.simbolos.get(t.canon) : undefined
    const pip = s?.pip_size ?? 0.0001
    // Saídas da mestre sem deals (histórico não chegou): o resto sai ao último preço conhecido, marcado «estimado».
    const saidasM = [...t.saidas]
    const resto = Math.round((t.volumeAbertura - saidasM.reduce((a, x) => a + x.volume, 0)) * 100) / 100
    if (resto > 1e-9 && t.ultimoPreco != null) saidasM.push({ preco: t.ultimoPreco, volume: resto, em: t.fechadaEm, motivo: 'estimado' })

    let espelho: Parameters<typeof montarComparacao>[0]['espelho'] = null
    if (esp) {
      const { data: linhas } = await db.from('funded_positions').select('id, mae_id, volume, preco_entrada, preco_fecho, fechada_em, motivo_fecho, estado, motivo_tick:tick_fecho->>motivo')
        .or(`id.eq.${esp.positionId},mae_id.eq.${esp.positionId}`)
      const fechadas = (linhas ?? []).filter((r) => r.estado === 'fechada' && r.preco_fecho != null)
      const saidasE: Saida[] = fechadas.map((r) => ({ preco: Number(r.preco_fecho), volume: Number(r.volume), em: String(r.fechada_em), motivo: String(r.motivo_tick ?? r.motivo_fecho ?? '') }))
        .sort((a, b) => a.em.localeCompare(b.em))
      if ((linhas ?? []).some((r) => r.estado === 'aberta')) return // ainda há volume aberto
      espelho = {
        positionId: esp.positionId, volumeAbertura: esp.volumeAbertura, entrada: esp.entrada, abertaEm: esp.abertaEm,
        saidas: saidasE, slMov: esp.slMov, fechadaEm: saidasE[saidasE.length - 1]?.em ?? new Date().toISOString(),
      }
    }
    const linha = montarComparacao({
      estrategia: p.slug, masterAccountId: p.mestreId, espelhoAccountId: p.contaId, pip,
      mestre: { id: t.id, symbol: t.canon ?? t.symbolMestre, direcao: t.direcao, volumeAbertura: t.volumeAbertura, entrada: t.entrada, abertaEm: t.abertaEm, saidas: saidasM, slMov: t.slMov, fechadaEm: t.fechadaEm },
      espelho, latenciaEntradaMs: t.latEntrada, latenciaRedeMs: t.latRede, reinicio: t.reinicio,
      detalhe: { regras: p.regras, seguirFechos: p.cfg.seguirFechos, alvos: esp?.est.alvos ?? null, simboloMestre: t.symbolMestre },
    })
    p.trades.delete(masterId)
    p.espelhos.delete(masterId)
    if (!ctx.escrita) return seco(`comp:${masterId}`, `${p.slug} comparação ${linha.symbol}: mestre ${linha.master_pips} pips · espelho ${linha.espelho_pips} pips`)
    const { error } = await db.from('espelho_comparacao').upsert({ ...linha, updated_at: new Date().toISOString() }, { onConflict: 'espelho_account_id,master_position_id' })
    if (error) log(`${curto(p)} comparação não gravou:`, error.message)
    else log(`${curto(p)} trade ${linha.symbol} #${masterId}: mestre ${linha.master_pips ?? '?'} pips · espelho ${linha.espelho_pips ?? '?'} pips (${linha.estado})`)
    recalcularSimbolos()
  }

  function recalcularSimbolos(): void {
    simbolosDoProvider.clear()
    for (const p of providers.values()) {
      for (const e of p.espelhos.values()) if (!e.fechada) simbolosDoProvider.add(e.canon)
      for (const e of p.aEsperar.values()) { const c = simboloDoCatalogo(e.p.symbol, ctx.simbolos); if (c) simbolosDoProvider.add(c) }
    }
  }

  // ── arranque ──────────────────────────────────────────────────────────
  void carregar().catch((e) => log('[provider] arranque:', e instanceof Error ? e.message : e))
  let ultimaCarga = Date.now()
  timers.push(setInterval(() => {
    // Sem a 082 tenta-se de 5 em 5 min; com ela, de minuto a minuto (estratégias ligadas/desligadas no admin).
    if (pausado() || (semColunas && Date.now() - ultimaCarga < 300_000)) return
    ultimaCarga = Date.now()
    void carregar().catch(() => undefined)
  }, 60_000))
  timers.push(setInterval(() => { void verificarFechadas().catch(() => undefined); recalcularSimbolos() }, 60_000))
  log(`[provider] ligado · escrita=${ctx.escrita ? 'LIGADA' : 'seco'} · leitura por evento (sem debounce, zero RPC)`)

  return {
    aoTick,
    aoFechoLocal,
    estado: () => {
      const g = ticksGeridos
      ticksGeridos = 0
      return {
        provedores: [...providers.values()].map((p) => ({
          slug: p.slug, mestre: p.mestreId.slice(0, 8), conta: p.contaId.slice(0, 8),
          sincronizada: leitores.get(p.mestreId)?.sincronizada ?? false,
          abertas: [...p.espelhos.values()].filter((e) => !e.fechada).length, emCurso: p.trades.size, aEsperar: p.aEsperar.size,
        })),
        latencias: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, v.resumo()])),
        decisoesPorMinuto: g,
        pausadoAte: espelhoPausadoAte() || null,
        semMigracao: semColunas,
      }
    },
    async parar() {
      parado = true
      for (const t of timers) clearInterval(t)
      for (const l of leitores.values()) await l.fechar().catch(() => undefined)
      leitores.clear()
    },
  }
}

function numOu(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
