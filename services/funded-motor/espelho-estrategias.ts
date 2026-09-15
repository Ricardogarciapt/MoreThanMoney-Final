/**
 * ESPELHO DAS ESTRATÉGIAS — contas simuladas que negoceiam sozinhas, como a estratégia negoceia.
 *
 * Uma conta `motor = 'sim'` com `segue_estrategia = <slug>` (migração 070) copia as posições REAIS
 * da conta-mestre dessa estratégia (mtmauto_providers.metaapi_account_id). As decisões são puras
 * (lib/mtmfunded/espelho/calculo.ts, com teste); aqui só há canos:
 *
 *  · LER: uma ligação de STREAMING da MetaApi por conta-mestre (espelho-leitor.ts). As posições,
 *    a equity (base da proporção) e o contrato dos símbolos vêm do `terminalState` em memória —
 *    ZERO pedidos RPC em regime normal. Até 14/09 era `getPositions` por RPC de 3 em 3 s, e a
 *    MetaApi cortou o token («ws:getPositions … 180000 cpu credits per 1h»), o mesmo token do MTM
 *    Auto e do MTM Copy. Os eventos do ouvinte disparam o ciclo (debounce 250 ms), repete-se 3 s
 *    depois enquanto houver trabalho, e reconcilia-se de 60 em 60 s a partir da memória.
 *    Se o feed de preços já ouve a mesma conta, a ligação é partilhada (metaapi-partilhada.ts).
 *  · INTERRUPTOR: a entrega das trades aos subscritores tem prioridade absoluta sobre isto. Ao
 *    primeiro erro de limite da MetaApi visto em qualquer parte do motor, o espelho fecha as
 *    ligações dele e fica parado 1 h (ESPELHO_PAUSA_LIMITE_MIN).
 *  · ABRIR ao NOSSO preço (funded_precos, o do motor) no instante em que a posição é vista — o
 *    preço da corretora da mestre fica gravado em `tick_entrada.mestre` para comparar.
 *  · ESCREVER pelas mesmas funções atómicas do site: insert da posição + funded_somar_saldo
 *    (comissão), funded_fechar_parcial, funded_fechar_posicao, update de sl/tp.
 *  · NUNCA DUPLICAR: a ponte funded_espelho_posicoes tem unique (seguidora, mestre, posição) e é
 *    gravada ANTES da posição. Dois motores, ou um reinício a meio, não abrem duas vezes.
 *
 * MOTOR_ESCRITA=0 → `[espelho][seco]` no log e nada na base (nem pontes).
 * Uma leitura falhada da mestre nunca fecha nada (ver o cabeçalho de calculo.ts).
 *
 * Estado reconstruível da base: as ligações e as ausências são cache. Reiniciar é seguro — no
 * pior caso uma posição que fechou na mestre durante a paragem fecha 2 leituras depois de voltar.
 * Mestre não sincronizada (a ligar, caída, a ressincronizar) = leitura falhada: não fecha nada, e
 * as ausências contadas antes da queda recomeçam do zero.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MapaPrecos, Simbolo } from '../../lib/mtmfunded/simulado/matematica'
import { planearAbertura, planearFecho, posicaoDaLinha, precoFresco, validarModificacao } from '../../lib/mtmfunded/simulado/ordens'
import {
  comentarioEstrategia,
  diffEspelho,
  posicaoMestreDaMetaApi,
  simboloDoCatalogo,
  volumeEspelho,
  type AccaoEspelho,
  type Ponte,
  type PosicaoMestre,
  type PosicaoSeguidora,
} from '../../lib/mtmfunded/espelho/calculo'
import { Agendador, LeitorMestre, sdkMetaApi, type SdkEspelho } from './espelho-leitor'
import { aoLimiteMetaApi, espelhoPausadoAte, registarErroMetaApi } from './metaapi-partilhada'

export interface ContextoEspelho {
  db: SupabaseClient
  metaapiToken: string
  escrita: boolean
  log: (...a: unknown[]) => void
  simbolos: Map<string, Simbolo>
  precos: MapaPrecos
  precoEm: Map<string, number>
  /** Há fills neste símbolo agora (preço + sessão)? — a mesma regra do motor. */
  negociavel: (sym: string) => boolean
  /** A conta mudou por fora: o motor reavalia-a no próximo ciclo. */
  marcarSuja: (accountId: string) => void
  /** Só para testes: um SDK falso. Por defeito, o da MetaApi com `metaapiToken`. */
  sdk?: SdkEspelho
}

interface Seguidora {
  id: string
  user_id: string | null
  segue_estrategia: string
  sim_saldo: number
  sim_equity: number | null
  alavancagem: number
  created_at: string
}

interface Mestre {
  metaapiId: string
  slug: string
  nome: string
  seguidoras: Seguidora[]
}

/** Repetição curta enquanto há trabalho (abrir à espera de preço, 2.ª leitura antes de fechar). Só memória e base. */
const REPETIR_MS = Number(process.env.ESPELHO_REPETIR_MS || process.env.ESPELHO_POLL_MS || 3000)
const DEBOUNCE_MS = Number(process.env.ESPELHO_DEBOUNCE_MS || 250)
const RECONCILIAR_MS = Number(process.env.ESPELHO_RECONCILIAR_MS || 60_000)
const ATRASO_MAX_MS = Number(process.env.ESPELHO_ATRASO_MAX_MIN || 30) * 60_000

/** Símbolos canónicos que as mestres têm abertos — o motor subscreve-os no feed. */
export const simbolosDoEspelho = new Set<string>()

export function iniciarEspelho(ctx: ContextoEspelho): { parar: () => Promise<void> } {
  const { db, log } = ctx
  const seco = (chave: string, ...a: unknown[]) => {
    const agora = Date.now()
    if (agora - (ultimoSeco.get(chave) ?? 0) < 60_000) return
    ultimoSeco.set(chave, agora)
    log('[espelho][seco]', ...a)
  }
  const ultimoSeco = new Map<string, number>()
  const mestres = new Map<string, Mestre>()
  const leitores = new Map<string, LeitorMestre>()
  const ausencias = new Map<string, Map<string, number>>() // seguidora → (posição-mestre → n)
  const timers: NodeJS.Timeout[] = []
  let parado = false
  let sdk: SdkEspelho | null = ctx.sdk ?? null
  const agendador = new Agendador(
    (id) => { const m = mestres.get(id); return m ? processarMestre(m) : Promise.resolve({ repetir: false }) },
    () => mestres.keys(),
    { debounceMs: DEBOUNCE_MS, repetirMs: REPETIR_MS, reconciliarMs: RECONCILIAR_MS, log },
  )

  // ── quem segue o quê ──────────────────────────────────────────────────────
  async function carregarSeguidoras(): Promise<void> {
    const [{ data: contas, error: e1 }, { data: provs, error: e2 }] = await Promise.all([
      db.from('mtm_trading_accounts')
        .select('id, user_id, segue_estrategia, sim_saldo, sim_equity, alavancagem, created_at')
        .eq('motor', 'sim').eq('estado', 'ativa').not('segue_estrategia', 'is', null).limit(2000),
      // Só providers ATIVOS: um provider desligado pode apontar para uma conta apagada na MetaApi
      // (Gold Did Premium 9dfb4df3, 15/09) e o streaming ficava a reconectar a uma conta inexistente.
      db.from('mtmauto_providers').select('slug, nome, metaapi_account_id').eq('ativo', true),
    ])
    // Sem conseguir ler, mantém-se o que havia: um erro de rede não desliga as seguidoras.
    if (e1 || e2) { log('[espelho] leitura das seguidoras falhou:', (e1 ?? e2)?.message); return }
    const porSlug = new Map((provs ?? []).map((p) => [String(p.slug).toLowerCase(), p]))
    const novos = new Map<string, Mestre>()
    for (const c of contas ?? []) {
      const p = porSlug.get(String(c.segue_estrategia).toLowerCase())
      const id = p?.metaapi_account_id as string | undefined
      if (!p || !id) {
        seco(`sem-mestre:${c.segue_estrategia}`, `estratégia «${c.segue_estrategia}» sem conta-mestre — ${String(c.id).slice(0, 8)} não segue nada`)
        continue
      }
      if (!novos.has(id)) novos.set(id, { metaapiId: id, slug: String(p.slug), nome: String(p.nome ?? p.slug), seguidoras: [] })
      novos.get(id)!.seguidoras.push({
        id: String(c.id), user_id: (c.user_id as string) ?? null, segue_estrategia: String(c.segue_estrategia),
        sim_saldo: Number(c.sim_saldo ?? 0), sim_equity: c.sim_equity == null ? null : Number(c.sim_equity),
        alavancagem: Number(c.alavancagem ?? 100), created_at: String(c.created_at),
      })
    }
    for (const id of [...leitores.keys()]) {
      if (novos.has(id)) continue
      await leitores.get(id)?.fechar().catch(() => undefined)
      leitores.delete(id)
    }
    const antes = mestres.size
    const contagemAntes = new Map([...mestres].map(([k, v]) => [k, v.seguidoras.map((x) => x.id).sort().join(',')]))
    mestres.clear()
    for (const [k, v] of novos) mestres.set(k, v)
    if (parado || pausadoPorLimite()) return
    for (const [id, m] of mestres) {
      if (!leitores.has(id)) {
        try {
          if (!sdk) sdk = sdkMetaApi(ctx.metaapiToken)
          const l = new LeitorMestre(id, sdk, { log, aoMudar: (x) => agendador.sinalizar(x), aoErroMetaApi: registarErroMetaApi })
          leitores.set(id, l)
          l.iniciar()
        } catch (e) {
          log(`[espelho] leitor da mestre ${id.slice(0, 8)} não arrancou:`, e instanceof Error ? e.message : e)
        }
      }
      // Seguidoras novas nesta mestre: processa já em vez de esperar pela reconciliação.
      if (contagemAntes.get(id) !== m.seguidoras.map((x) => x.id).sort().join(',')) agendador.sinalizar(id)
    }
    if (antes !== mestres.size) log(`[espelho] ${mestres.size} conta(s)-mestre · ${[...mestres.values()].map((m) => `${m.slug}:${m.seguidoras.length}`).join(' ')}`)
  }

  // ── MetaApi (só memória: ver espelho-leitor.ts) ─────────────────────────────
  let avisadoPausa = 0
  /** O interruptor global está ligado? (Fecha as ligações na 1.ª vez que o vê.) */
  function pausadoPorLimite(): boolean {
    const ate = espelhoPausadoAte()
    if (!ate) {
      if (avisadoPausa) { avisadoPausa = 0; log('[espelho] fim da pausa por limite da MetaApi — a religar as mestres') }
      return false
    }
    if (avisadoPausa !== ate) {
      avisadoPausa = ate
      log(`[espelho] PAUSADO até ${new Date(ate).toISOString()} — limite da MetaApi visto no motor; a entrega aos subscritores tem prioridade`)
    }
    if (leitores.size) {
      const fechar = [...leitores.values()]
      leitores.clear()
      for (const l of fechar) void l.fechar().catch(() => undefined)
    }
    return true
  }
  const largarOuvinteLimite = aoLimiteMetaApi(() => { pausadoPorLimite() })

  /** null = não consegui ler (NÃO é «sem posições»). */
  function lerMestre(m: Mestre): PosicaoMestre[] | null {
    return leitores.get(m.metaapiId)?.ler() ?? null
  }

  function contrato(m: Mestre, simboloMestre: string): number | null {
    return leitores.get(m.metaapiId)?.contrato(simboloMestre) ?? null
  }

  // ── o ciclo de uma mestre ─────────────────────────────────────────────────
  /** `repetir` = volta a correr daqui a REPETIR_MS (há trabalho por acabar). */
  async function processarMestre(m: Mestre): Promise<{ repetir: boolean }> {
    if (pausadoPorLimite()) return { repetir: false }
    const leitor = leitores.get(m.metaapiId)
    const lidas = lerMestre(m)
    // Leitura falhada: não se toca na base nem nas ausências. O ouvinte volta a chamar quando a
    // mestre sincronizar.
    if (!lidas || !leitor) return { repetir: false }
    // Houve queda desde a última leitura: as ausências contadas antes não valem — recomeça-se.
    if (leitor.houveQuebraDesdeUltimaLeitura()) for (const seg of m.seguidoras) ausencias.delete(seg.id)
    for (const p of lidas) {
      const s = simboloDoCatalogo(p.symbol, ctx.simbolos)
      if (s) simbolosDoEspelho.add(s)
    }
    if (!m.seguidoras.length) return { repetir: false }

    const ids = m.seguidoras.map((s) => s.id)
    const { data: pontesDb, error } = await db.from('funded_espelho_posicoes')
      .select('id, follower_account_id, master_position_id, funded_position_id, volume_master_abertura, volume_seguidora_abertura, estado')
      .eq('master_account_id', m.metaapiId).in('follower_account_id', ids)
      .or(`estado.eq.aberta${lidas.length ? `,master_position_id.in.(${lidas.map((p) => `"${p.id}"`).join(',')})` : ''}`)
      .limit(5000)
    if (error) {
      // Sem a ponte não se sabe o que já está aberto — abrir às cegas é a duplicação.
      if (!/does not exist/.test(error.message)) log('[espelho] pontes:', error.message)
      return { repetir: !/does not exist/.test(error.message) }
    }
    const fundedIds = (pontesDb ?? []).map((p) => p.funded_position_id).filter(Boolean) as string[]
    const seguidorasPos = new Map<string, PosicaoSeguidora>()
    for (let i = 0; i < fundedIds.length; i += 200) {
      const { data } = await db.from('funded_positions').select('id, symbol, volume, sl, tp, estado').in('id', fundedIds.slice(i, i + 200))
      for (const r of data ?? []) {
        seguidorasPos.set(String(r.id), {
          id: String(r.id), symbol: String(r.symbol), volume: Number(r.volume),
          sl: r.sl == null ? null : Number(r.sl), tp: r.tp == null ? null : Number(r.tp), estado: r.estado as 'aberta' | 'fechada',
        })
      }
    }

    let repetir = false
    for (const seg of m.seguidoras) {
      const pontes: Ponte[] = (pontesDb ?? []).filter((p) => p.follower_account_id === seg.id).map((p) => ({
        id: String(p.id), master_position_id: String(p.master_position_id),
        funded_position_id: (p.funded_position_id as string) ?? null,
        volume_master_abertura: Number(p.volume_master_abertura),
        volume_seguidora_abertura: p.volume_seguidora_abertura == null ? null : Number(p.volume_seguidora_abertura),
        estado: p.estado as Ponte['estado'],
      }))
      const simbolosDasPontes: Record<string, Simbolo> = {}
      for (const s of seguidorasPos.values()) {
        const sm = ctx.simbolos.get(s.symbol)
        if (sm) simbolosDasPontes[s.symbol] = sm
      }
      const { accoes, ausencias: novas } = diffEspelho({
        mestre: lidas, pontes, seguidoras: seguidorasPos, simbolos: simbolosDasPontes,
        ausencias: ausencias.get(seg.id) ?? new Map(), seguidoraCriadaEm: seg.created_at,
        agora: new Date(), atrasoMaxMs: ATRASO_MAX_MS,
      })
      ausencias.set(seg.id, novas)
      if (accoes.length || novas.size) repetir = true
      for (const a of accoes) {
        try {
          await aplicar(m, seg, a, seguidorasPos)
        } catch (e) {
          log(`[espelho] ${seg.id.slice(0, 8)} ${a.tipo} falhou:`, e instanceof Error ? e.message : e)
        }
      }
    }
    return { repetir }
  }

  // ── aplicar uma decisão ───────────────────────────────────────────────────
  function precoVivo(sym: string) {
    const p = ctx.precos[sym]
    const em = ctx.precoEm.get(sym)
    if (!p || !em || !precoFresco(new Date(em)) || !ctx.negociavel(sym)) return null
    return { preco: p, tick: { bid: p.bid, ask: p.ask, em: new Date(em).toISOString(), fonte: 'metaapi:puprime' } }
  }

  async function marcarPonte(id: string, patch: Record<string, unknown>) {
    await db.from('funded_espelho_posicoes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function aplicar(m: Mestre, seg: Seguidora, a: AccaoEspelho, seguidorasPos: Map<string, PosicaoSeguidora>): Promise<void> {
    const curto = `${m.slug}→${seg.id.slice(0, 8)}`

    if (a.tipo === 'ignorar_antiga') {
      if (!ctx.escrita) return seco(`antiga:${seg.id}:${a.mestre.id}`, `${curto} não copia ${a.mestre.symbol} #${a.mestre.id}: ${a.motivo}`)
      // Grava-se como recusada para não voltar a ser considerada a cada leitura.
      const { error } = await db.from('funded_espelho_posicoes').insert({
        follower_account_id: seg.id, master_account_id: m.metaapiId, master_position_id: a.mestre.id, estrategia: m.slug,
        master_symbol: a.mestre.symbol, direcao: a.mestre.direcao, volume_master_abertura: a.mestre.volume,
        preco_master_abertura: a.mestre.openPrice, master_aberta_em: a.mestre.time, estado: 'recusada', erro: a.motivo,
      })
      if (error && error.code !== '23505') log(`[espelho] ${curto} ponte recusada:`, error.message)
      return
    }

    if (a.tipo === 'abrir') {
      const mp = a.mestre
      const symbol = simboloDoCatalogo(mp.symbol, ctx.simbolos)
      const recusar = async (motivo: string) => {
        if (!ctx.escrita) return seco(`recusa:${seg.id}:${mp.id}`, `${curto} recusaria ${mp.symbol} #${mp.id}: ${motivo}`)
        log(`[espelho] ${curto} não abre ${mp.symbol} #${mp.id}: ${motivo}`)
        const { error } = await db.from('funded_espelho_posicoes').insert({
          follower_account_id: seg.id, master_account_id: m.metaapiId, master_position_id: mp.id, estrategia: m.slug,
          master_symbol: mp.symbol, symbol, direcao: mp.direcao, volume_master_abertura: mp.volume,
          preco_master_abertura: mp.openPrice, master_aberta_em: mp.time, estado: 'recusada', erro: motivo.slice(0, 500),
        })
        if (error && error.code !== '23505') log(`[espelho] ${curto} ponte:`, error.message)
      }
      if (!symbol) return recusar(`símbolo ${mp.symbol} não existe no catálogo`)
      const s = ctx.simbolos.get(symbol)!
      simbolosDoEspelho.add(symbol)
      const vivo = precoVivo(symbol)
      // Sem preço fresco ainda (subscrição a chegar, mercado a abrir): tenta na próxima volta.
      // O prazo de ATRASO_MAX_MS no diff é o que acaba por desistir.
      if (!vivo) return seco(`sem-preco:${symbol}`, `${curto} à espera de preço para ${symbol}`)

      const eqM = leitores.get(m.metaapiId)?.equity() ?? null
      const tamanho = volumeEspelho({
        volumeMestre: mp.volume, equityMestre: eqM, equitySeguidora: seg.sim_equity ?? seg.sim_saldo,
        simbolo: s, contratoMestre: contrato(m, mp.symbol),
      })
      if (!tamanho.ok) {
        if (tamanho.motivo.includes('equity da mestre')) return seco(`sem-equity:${m.metaapiId}`, `${curto} à espera da equity da mestre`)
        return recusar(tamanho.motivo)
      }

      // Posições abertas da seguidora para a margem (e as conversões para USD).
      const { data: abertas } = await db.from('funded_positions').select('*').eq('account_id', seg.id).eq('estado', 'aberta')
      const simbolosAbertos: Record<string, Simbolo> = { [symbol]: s }
      for (const r of abertas ?? []) { const x = ctx.simbolos.get(String(r.symbol)); if (x) simbolosAbertos[x.symbol] = x }
      const plano = planearAbertura({
        simbolo: s, direcao: mp.direcao, volume: tamanho.volume, sl: null, tp: null, preco: vivo.preco,
        saldo: seg.sim_saldo, alavancagemConta: seg.alavancagem,
        posicoesAbertas: (abertas ?? []).map(posicaoDaLinha), simbolos: simbolosAbertos, precos: ctx.precos,
        // Conta de análise: a estratégia manda. Hedge e limite por par são regras do trader, não dela.
        regras: null,
      })
      if (!plano.ok) return recusar(plano.erro)
      // SL/TP copiados como níveis absolutos, mas só se estiverem do lado certo do NOSSO preço —
      // senão abria-se e fechava-se no mesmo tick. O próximo diff volta a tentar o nível da mestre.
      const lado = (nivel: number | null, tipo: 'sl' | 'tp') => {
        if (nivel == null) return null
        const px = plano.precoExecucao
        const acima = nivel > px
        const ok = mp.direcao === 'buy' ? (tipo === 'sl' ? !acima : acima) : (tipo === 'sl' ? acima : !acima)
        return ok ? nivel : null
      }
      const sl = lado(mp.sl, 'sl')
      const tp = lado(mp.tp, 'tp')
      const comentario = comentarioEstrategia(m.slug, m.nome)

      if (!ctx.escrita) {
        return seco(`abrir:${seg.id}:${mp.id}`, `${curto} abriria ${mp.direcao} ${symbol} ${tamanho.volume} (ideal ${tamanho.ideal}, escala ${tamanho.escala}) @${plano.precoExecucao} SL ${sl} TP ${tp} «${comentario}»`)
      }

      // 1) a ponte primeiro — é o cadeado contra a duplicação
      const { data: ponte, error: ePonte } = await db.from('funded_espelho_posicoes').insert({
        follower_account_id: seg.id, master_account_id: m.metaapiId, master_position_id: mp.id, estrategia: m.slug,
        symbol, master_symbol: mp.symbol, direcao: mp.direcao, volume_master_abertura: mp.volume, volume_master_atual: mp.volume,
        volume_seguidora_abertura: plano.volume, escala: tamanho.escala, preco_master_abertura: mp.openPrice,
        master_aberta_em: mp.time, estado: 'aberta',
      }).select('id').single()
      if (ePonte) {
        if (ePonte.code !== '23505') log(`[espelho] ${curto} ponte:`, ePonte.message)
        return
      }
      // 2) a posição
      const { data: pos, error: ePos } = await db.from('funded_positions').insert({
        account_id: seg.id, symbol, direcao: mp.direcao, volume: plano.volume, preco_entrada: plano.precoExecucao,
        sl, tp, comissao: plano.comissao, estado: 'aberta', origem: 'estrategia', comentario,
        ideia_ref: `espelho:${m.slug}:${mp.id}`.slice(0, 200),
        tick_entrada: {
          ...vivo.tick,
          mestre: { conta: m.metaapiId, posicao: mp.id, simbolo: mp.symbol, preco: mp.openPrice, volume: mp.volume, equity: eqM, aberta_em: mp.time },
          lote: { ideal: tamanho.ideal, escala: tamanho.escala },
        },
      }).select('id').single()
      if (ePos || !pos) {
        await marcarPonte(ponte.id, { estado: 'recusada', erro: `insert: ${ePos?.message ?? 'sem linha'}`.slice(0, 500) })
        return
      }
      await marcarPonte(ponte.id, { funded_position_id: pos.id })
      // 3) comissão e dia negociado — as mesmas funções do site
      if (plano.comissao) await db.rpc('funded_somar_saldo', { p_conta: seg.id, p_delta: -plano.comissao })
      await marcarDiaNegociado(seg.id)
      ctx.marcarSuja(seg.id)
      log(`[espelho] ${curto} abriu ${mp.direcao} ${symbol} ${plano.volume} @${plano.precoExecucao} (mestre ${mp.volume} @${mp.openPrice}, escala ${tamanho.escala})`)
      return
    }

    if (a.tipo === 'marcar') {
      if (!ctx.escrita) return seco(`marcar:${a.ponteId}`, `${curto} marcaria ponte ${a.ponteId.slice(0, 8)} ${a.estado}: ${a.motivo}`)
      await marcarPonte(a.ponteId, { estado: a.estado, erro: a.motivo })
      return
    }

    const pos = seguidorasPos.get(a.positionId)
    if (!pos) return
    const s = ctx.simbolos.get(pos.symbol)
    if (!s) return

    if (a.tipo === 'modificar') {
      // Um nível que já está do lado errado do NOSSO preço fechava a posição no tick seguinte por
      // uma diferença de corretora. Espera-se: ou o preço volta, ou a mestre fecha e o fecho vem daí.
      const pv = precoVivo(pos.symbol)
      const dir = (pv && (await db.from('funded_positions').select('direcao').eq('id', a.positionId).maybeSingle()).data?.direcao) as 'buy' | 'sell' | undefined
      if (pv && dir) {
        const erro = validarModificacao({ direcao: dir }, pv.preco, a.sl, a.tp)
        if (erro) return seco(`mod-lado:${a.positionId}:${a.sl}:${a.tp}`, `${curto} não move ${pos.symbol} para SL ${a.sl} TP ${a.tp}: ${erro}`)
      }
      if (!ctx.escrita) return seco(`mod:${a.positionId}:${a.sl}:${a.tp}`, `${curto} mudaria ${pos.symbol} SL ${pos.sl}→${a.sl} TP ${pos.tp}→${a.tp}`)
      const { data } = await db.from('funded_positions').update({ sl: a.sl, tp: a.tp }).eq('id', a.positionId).eq('estado', 'aberta').select('id')
      if (data?.length) {
        pos.sl = a.sl
        pos.tp = a.tp
        ctx.marcarSuja(seg.id)
        log(`[espelho] ${curto} ${pos.symbol} SL ${a.sl} TP ${a.tp}`)
      }
      return
    }

    const vivo = precoVivo(pos.symbol)
    if (!vivo) return seco(`sem-preco-fecho:${pos.symbol}`, `${curto} ${a.tipo} de ${pos.symbol} à espera de preço`)
    const { data: linha } = await db.from('funded_positions').select('*').eq('id', a.positionId).eq('estado', 'aberta').maybeSingle()
    if (!linha) return
    const aberta = posicaoDaLinha(linha)
    const precos = { ...ctx.precos, [pos.symbol]: vivo.preco }

    if (a.tipo === 'parcial') {
      const plano = planearFecho(aberta, s, vivo.preco, precos, a.volume)
      if (!plano.ok || !plano.parcial) return seco(`parcial-nao:${a.positionId}`, `${curto} parcial ${a.volume} recusado: ${plano.ok ? 'fecharia tudo' : plano.erro}`)
      if (!ctx.escrita) return seco(`parcial:${a.positionId}:${a.volume}`, `${curto} fecharia ${a.volume} de ${pos.symbol} (${Math.round(a.fechadoPct * 100)}% fechado na mestre) pnl ${plano.pnl}`)
      const { data: filha, error } = await db.rpc('funded_fechar_parcial', {
        p_mae: a.positionId, p_volume: plano.volumeFechado, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_tick: { ...vivo.tick, espelho: true },
      })
      if (error || !filha) return log(`[espelho] ${curto} parcial falhou:`, error?.message ?? 'posição mudou')
      await marcarPonte(a.ponteId, { fechado_pct: a.fechadoPct, volume_master_atual: a.volumeMestreAtual })
      pos.volume = plano.volumeRestante
      ctx.marcarSuja(seg.id)
      log(`[espelho] ${curto} parcial ${plano.volumeFechado} ${pos.symbol} @${plano.precoFecho} pnl ${plano.pnl}`)
      return
    }

    if (a.tipo === 'fechar') {
      const plano = planearFecho(aberta, s, vivo.preco, precos, null)
      if (!plano.ok) return log(`[espelho] ${curto} fecho recusado: ${plano.erro}`)
      if (!ctx.escrita) return seco(`fechar:${a.positionId}`, `${curto} fecharia ${pos.symbol} (fechou na mestre) pnl ${plano.pnl}`)
      const { data: ganhou, error } = await db.rpc('funded_fechar_posicao', {
        p_id: a.positionId, p_preco: plano.precoFecho, p_pnl: plano.pnl, p_motivo: 'estrategia', p_tick: { ...vivo.tick, espelho: true },
      })
      if (error) return log(`[espelho] ${curto} fecho falhou:`, error.message)
      await marcarPonte(a.ponteId, { estado: ganhou ? 'fechada' : 'fechada_local', fechado_pct: 1, volume_master_atual: 0 })
      ctx.marcarSuja(seg.id)
      log(`[espelho] ${curto} fechou ${pos.symbol} @${plano.precoFecho} pnl ${plano.pnl}${ganhou ? '' : ' (já estava fechada)'}`)
    }
  }

  async function marcarDiaNegociado(accountId: string): Promise<void> {
    const hoje = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10)
    const { data: c } = await db.from('mtm_trading_accounts').select('sim_ultimo_dia, sim_dias_negociados').eq('id', accountId).maybeSingle()
    if (!c || String(c.sim_ultimo_dia ?? '') === hoje) return
    await db.from('mtm_trading_accounts')
      .update({ sim_ultimo_dia: hoje, sim_dias_negociados: Number(c.sim_dias_negociados ?? 0) + 1 })
      .eq('id', accountId).eq('sim_dias_negociados', Number(c.sim_dias_negociados ?? 0))
  }

  // ── arranque ──────────────────────────────────────────────────────────────
  // Nada aqui é esperado pelo motor: uma mestre que não liga só atrasa o espelho dela — o feed de
  // preços (outra instância do SDK) e o ciclo de regras não dependem disto.
  void carregarSeguidoras().catch((e) => log('[espelho] arranque:', e instanceof Error ? e.message : e))
  timers.push(setInterval(() => { void carregarSeguidoras().catch(() => undefined) }, 30_000))
  log(`[espelho] ligado · escrita=${ctx.escrita ? 'LIGADA' : 'seco'} · streaming (zero RPC) · debounce ${DEBOUNCE_MS}ms · repetir ${REPETIR_MS}ms · reconciliar ${RECONCILIAR_MS / 1000}s · atraso máx ${ATRASO_MAX_MS / 60000} min`)

  return {
    async parar() {
      parado = true
      largarOuvinteLimite()
      agendador.parar()
      for (const t of timers) clearInterval(t)
      for (const l of leitores.values()) await l.fechar().catch(() => undefined)
      leitores.clear()
    },
  }
}
