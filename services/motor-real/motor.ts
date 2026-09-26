/**
 * MOTOR EM TEMPO REAL — gestão das posições das contas REAIS tick a tick (VPS).
 *
 * Substitui o `mtm-premium-streaming` (as contas da fotografia continuam a escrever
 * `metaapi_snapshot` igual) e acrescenta a gestão: a cada tick, para cada posição aberta que um
 * monitor gere hoje (Premium, T2T, MTM Auto), corre as MESMAS regras (lib/gestao-real) sobre o preço
 * do streaming. Mais o tipo `provider`: as contas MESTRE das estratégias, cujas posições não têm
 * linha nenhuma na base e por isso não eram geridas por ninguém — aí as regras são as DA ESTRATÉGIA
 * (`mtmauto_providers.sinais_config`, lib/gestao-real/provider.ts) e o modo é SEMPRE sombra.
 *
 *  · SOMBRA (por omissão): não envia nada. Regista em `gestao_real_sombra` o que faria e, quando o
 *    monitor actual age (o streaming vê a posição mudar), a latência e a divergência.
 *  · LIVE: só com MOTOR_REAL_ESCRITA=1 E a conta em `site_settings.motor_real_contas_live`, e só para
 *    tipos em TIPOS_LIVE_SUPORTADOS (fase 1: premium). O batimento anuncia a conta 15 s ANTES de o
 *    motor começar a mandar, para o monitor antigo (que lê o mesmo batimento) já ter parado.
 *
 * Streaming só nas contas com posições ABERTAS (mais as da fotografia), com tecto, graça depois do
 * fecho, recuo perante erros e o travão de quota/contas inexistentes partilhado com o site.
 *
 * Construir, instalar, ler a comparação e passar a live: deploy/vps-stream/motor-real/README.md
 */
import { createClient } from '@supabase/supabase-js'
import { carregarSdk, eLimiteMetaApi } from '../funded-motor/metaapi-partilhada'
import { LigacaoReal } from './ligacao'
import { carregarEscopo, chaveItem, type Escopo } from './escopo'
import { criarExecutorLive } from './live'
import { PrecosNossos } from './precos-nossos'
import { GuardaDeploy, buscadorMetaApi } from './conta-deployada'
import { contasStreaming } from '../../lib/mtmcopy/metaapi-snapshot-regras'
import { contaInexistente, marcarContaInexistente } from '../../lib/mtmcopy/metaapi-inexistentes'
import { leituraDeFundoBloqueada, registarErroQuota } from '../../lib/mtmcopy/metaapi-quota'
import { eLimiteDeEquipa, neutralizarErroDeEquipa, RegistoPorToken, type TokenResolvido } from '../../lib/copia-contas/tokens'
import { avaliarItem, pipDoItem, type ContextoAvaliacao, type ItemGestao, type Sobreposicao } from '../../lib/gestao-real/avaliar'
import { acharPosicao, configPremiumDoAmbiente } from '../../lib/gestao-real/premium'
import { configT2TDoAmbiente } from '../../lib/gestao-real/t2t'
import { configMtmAutoDoAmbiente } from '../../lib/gestao-real/mtmauto'
import { RegistoSombra, diferencasPosicoes, type LinhaSombra, type PosicaoVista } from '../../lib/gestao-real/sombra'
import { aposFalhaLigar, planear, type ConfigPlaneamento, type EstadoConta } from '../../lib/gestao-real/planeamento'
import { CHAVE_LISTA_LIVE, SERVICO_PULSO, TIPOS_LIVE_SUPORTADOS, chaveLive, lerListaLive, listaPedeLive, type EntradaLive, type TipoGestao } from '../../lib/gestao-real/contas-live-regras'

type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

const env = (k: string) => process.env[k]?.trim() ?? ''
const num = (k: string, d: number) => { const v = Number(env(k)); return Number.isFinite(v) && v > 0 ? v : d }
const CFG = {
  supabaseUrl: env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  token: env('METAAPI_TOKEN'),
  escrita: env('MOTOR_REAL_ESCRITA') === '1',
  siteBase: env('MTM_API_BASE') || 'https://www.morethanmoney.pt',
  cronSecret: env('CRON_SECRET'),
  fotografia: contasStreaming(env('MOTOR_REAL_FOTOGRAFIA_CONTAS') || env('PREMIUM_STREAMING_CONTAS')),
  tipos: {
    premium: env('MOTOR_REAL_PREMIUM') !== '0',
    t2t: env('MOTOR_REAL_T2T') !== '0',
    mtmauto: env('MOTOR_REAL_MTMAUTO') !== '0',
    provider: env('MOTOR_REAL_PROVIDER') !== '0',
  },
  observarScanner: env('MOTOR_REAL_PROVIDER_OBSERVAR_SCANNER') === '1',
  intervaloProviderMs: num('MOTOR_REAL_PROVIDER_INTERVALO_MS', 1_000),
  subscritores: env('MOTOR_REAL_SUBSCRITORES') === '1',
  tickMs: num('MOTOR_REAL_TICK_MS', 250),
  escopoMs: num('MOTOR_REAL_ESCOPO_MS', 15_000),
  cotacoesMs: num('MOTOR_REAL_COTACOES_MS', 500),
  /**
   * Subscrever cotações na MetaApi. DESLIGADO por omissão: os preços vêm da nossa fonte
   * (`precos-nossos.ts`). Ligar só para comparar os dois lados — ver a nota em `ligacao.ts`.
   */
  cotacoesMetaApi: env('MOTOR_REAL_COTACOES_METAAPI') === '1',
  /** De quanto em quanto tempo se relê a `funded_precos` para memória. */
  precosNossosMs: num('MOTOR_REAL_PRECOS_MS', 1_000),
  /** Mapa nome-da-corretora:nosso-nome, ex.: "GOLD:XAUUSD,XAUUSD.X:XAUUSD". */
  mapaSimbolos: env('MOTOR_REAL_MAPA_SIMBOLOS'),
  /**
   * Pastas raiz dos terminais do conector — a entrega RÁPIDA dos preços (ver `precos-nossos.ts`).
   * Partilha a variável com o motor do funded de propósito: é o mesmo ficheiro, no mesmo VPS.
   */
  conectorRaizes: (env('CONECTOR_TICKS_RAIZES') || '').split(',').map((x) => x.trim()).filter(Boolean),
  conectorTrabalho: env('CONECTOR_TICKS_TRABALHO') || 'mtm-conector',
  conectorRitmoMs: num('CONECTOR_TICKS_MS', 25),
  /** Verificar na MetaApi se a conta está deployada antes de lhe abrir streaming. */
  guardaDeploy: env('MOTOR_REAL_GUARDA_DEPLOY') !== '0',
  gravarMs: num('MOTOR_REAL_GRAVAR_MS', 5_000),
  entradaLiveMs: num('MOTOR_REAL_ENTRADA_LIVE_MS', 15_000),
  planeamento: {
    maxContas: num('MOTOR_REAL_MAX_CONTAS', 30),
    gracaMs: num('MOTOR_REAL_GRACA_MIN', 10) * 60_000,
    pausaLimiteMs: num('MOTOR_REAL_PAUSA_LIMITE_MIN', 15) * 60_000,
  } satisfies ConfigPlaneamento,
  sombra: { janelaMs: num('MOTOR_REAL_SOMBRA_JANELA_MS', 5_000), esperaMs: num('MOTOR_REAL_SOMBRA_ESPERA_MS', 120_000) },
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

async function main() {
  if (!CFG.supabaseUrl || !CFG.supabaseKey || !CFG.token) {
    console.error('[motor-real] faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / METAAPI_TOKEN')
    process.exit(2)
  }
  if (CFG.escrita && !CFG.cronSecret) {
    console.error('[motor-real] MOTOR_REAL_ESCRITA=1 exige CRON_SECRET (efeitos no site) — a arrancar em SOMBRA')
    CFG.escrita = false
  }
  // Os módulos partilhados com o site (quota, contas inexistentes, interruptores) usam o cliente
  // de lib/supabase-admin-client, que lê estas duas variáveis.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= CFG.supabaseUrl
  const db = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sdk = carregarSdk()
  const MetaApi = sdk.default ?? sdk
  const apis = new RegistoPorToken<Qualquer>((t: TokenResolvido) => new MetaApi(t.token))

  const cfgs = {
    premium: { ...configPremiumDoAmbiente(process.env), trailingTempoReal: false },
    t2t: configT2TDoAmbiente(process.env),
    mtmauto: configMtmAutoDoAmbiente(process.env),
  }
  log(`[motor-real] arranque · escrita=${CFG.escrita ? 'LIVE PERMITIDO' : 'SOMBRA'} · tipos=${JSON.stringify(CFG.tipos)} · fotografia=${CFG.fotografia.map((c) => c.slice(0, 8)).join(',') || '—'} · regras=${JSON.stringify(cfgs)}`)

  const ligacoes = new Map<string, LigacaoReal>()
  const estados = new Map<string, EstadoConta>()
  const itens = new Map<string, ItemGestao>()
  const sobreposicoes = new Map<string, Sobreposicao>()
  const vistas = new Map<string, Map<string, PosicaoVista> | null>()
  const resemear = new Set<string>()
  const entradaLive = new Map<string, number>()
  const jaEfectivo = new Set<string>()
  let escopo: Escopo | null = null
  let tokens = new Map<string, TokenResolvido>()
  let listaLive: EntradaLive[] = []
  let pausaGlobalAte = 0
  let porGravar: LinhaSombra[] = []
  const contadores = { ticks: 0, avaliacoes: 0, decisoes: 0, observacoes: 0, gravadas: 0, erros: 0 }

  /**
   * A FONTE DE PREÇOS DA CASA. Arranca antes de qualquer ligação: um tick que chegue sem preço não
   * decide nada, e é melhor o primeiro tick esperar 1 s pela primeira leitura do que passar em
   * claro com o motor a achar que não conhece o símbolo.
   */
  const mapaSimbolos = new Map<string, string>()
  for (const par of CFG.mapaSimbolos.split(',')) {
    const [de, para] = par.split(':').map((x) => x?.trim().toUpperCase())
    if (de && para) mapaSimbolos.set(de, para)
  }
  const ficheirosConector = CFG.conectorRaizes.map((r) => `${r}/MQL5/Files/${CFG.conectorTrabalho}/ticks.json`)
  const precos = new PrecosNossos({
    db,
    intervaloMs: CFG.precosNossosMs,
    mapa: mapaSimbolos,
    ficheirosConector,
    ritmoConectorMs: CFG.conectorRitmoMs,
    log,
  })
  await precos.iniciar()
  log(`[precos-nossos] ${JSON.stringify(precos.resumo())}`)

  /**
   * O preço de um símbolo, para o motor.
   *
   * A NOSSA fonte primeiro; a MetaApi só se ela não souber — e só sabe quando a subscrição de
   * cotações estiver ligada de propósito. A ordem é o ponto todo desta mudança: sem uma conta
   * deployada na MetaApi o motor ficava sem preço nenhum, e a nossa cadeia estava a receber ticks
   * ao lado sem ninguém os usar.
   */
  const precoDe = (conta: string, simbolo: string): number | null =>
    precos.preco(simbolo) ?? ligacoes.get(conta)?.precoMedio(simbolo) ?? null

  /**
   * O guarda das contas desmontadas. Usa o token da casa: as contas de equipa têm o seu próprio
   * token e o erro delas já é neutralizado noutro sítio (`neutralizarErroDeEquipa`).
   */
  const guardaDeploy = CFG.guardaDeploy ? new GuardaDeploy(buscadorMetaApi(CFG.token), log) : null

  const registo = new RegistoSombra(CFG.sombra, (s) => pipDoItem('premium', s))
  const executor = criarExecutorLive({
    db,
    tokenDe: (c) => tokens.get(c)?.token ?? null,
    especificacao: (c, s) => ligacoes.get(c)?.especificacao(s) ?? null,
    siteBase: CFG.siteBase,
    cronSecret: CFG.cronSecret,
  })

  const norm = (c: string) => c.trim().toLowerCase()
  // `TipoGestao` é o dos tipos que PODEM ir a live (cópia byte a byte com o mtm-auto, não se mexe);
  // o motor também gere `provider`, que é sempre sombra.
  const tiposDaConta = (conta: string): Set<TipoGestao | 'provider'> =>
    new Set([...itens.values()].filter((i) => norm(i.conta) === norm(conta)).map((i) => i.tipo))
  const ligacaoDe = (conta: string) => [...ligacoes.values()].find((l) => norm(l.conta) === norm(conta))
  const contaDaChave = (k: string) => ligacaoDe(k.split(':')[0]!)?.conta ?? k.split(':')[0]!

  /** Modo efectivo de um tipo numa conta. */
  const modoDe = (conta: string, tipo: TipoGestao, agora: number): 'sombra' | 'live' => {
    const desde = entradaLive.get(chaveLive(conta, tipo))
    return desde != null && agora - desde >= CFG.entradaLiveMs ? 'live' : 'sombra'
  }

  function acertarLive(agora: number): boolean {
    let mudou = false
    const queridas = new Set<string>()
    if (CFG.escrita) {
      // Pela lista e pela ligação, não pelos itens: entre dois sinais a conta continua em live, senão
      // cada trade nova passava os primeiros 15 s com o monitor antigo.
      for (const [conta, l] of ligacoes) {
        if (!l.sincronizada) continue
        for (const tipo of TIPOS_LIVE_SUPORTADOS) {
          if (listaPedeLive(listaLive, conta, tipo)) queridas.add(chaveLive(conta, tipo))
        }
      }
    }
    for (const k of queridas) {
      if (!entradaLive.has(k)) { entradaLive.set(k, agora); mudou = true; log(`[live] ${k} a entrar em live em ${CFG.entradaLiveMs / 1000}s (batimento anunciado)`) }
    }
    for (const k of [...entradaLive.keys()]) {
      if (queridas.has(k)) continue
      entradaLive.delete(k)
      mudou = true
      resemear.add(contaDaChave(k))
      log(`[live] ${k} saiu de live — o monitor antigo volta a gerir; itens re-semeados`)
    }
    // Passou a live efectivo: re-semear JÁ da base (o estado virtual da sombra não serve para mandar).
    for (const [k, desde] of entradaLive) {
      if (agora - desde >= CFG.entradaLiveMs && !jaEfectivo.has(k)) {
        jaEfectivo.add(k)
        resemear.add(contaDaChave(k))
        log(`[live] ${k} EM LIVE — itens re-semeados da base`)
        void cicloEscopo()
      }
    }
    for (const k of [...jaEfectivo]) if (!entradaLive.has(k)) jaEfectivo.delete(k)
    return mudou
  }

  // ── escopo + planeamento ──────────────────────────────────────────────────────
  let aLerEscopo = false
  async function cicloEscopo(): Promise<void> {
    if (aLerEscopo) return
    aLerEscopo = true
    const agora = Date.now()
    // Só as contas marcadas ANTES desta leitura: uma marcação a meio espera pela seguinte.
    const aResemear = new Set(resemear)
    try {
      const { data: s } = await db.from('site_settings').select('value').eq('key', CHAVE_LISTA_LIVE).maybeSingle()
      listaLive = lerListaLive(s?.value)
      escopo = await carregarEscopo(db, {
        tokenCasa: CFG.token,
        contasFotografia: CFG.fotografia,
        subscritores: CFG.subscritores,
        tipos: CFG.tipos,
        observarScanner: CFG.observarScanner,
        intervaloProviderMs: CFG.intervaloProviderMs,
      })
      tokens = escopo.tokens
      cfgs.premium.trailingTempoReal = escopo.switches.trailing_tempo_real

      const vivos = new Set<string>()
      for (const novo of escopo.itens) {
        const k = chaveItem(novo)
        vivos.add(k)
        const antigo = itens.get(k)
        if (!antigo || (aResemear.has(novo.conta) && !antigo.ocupado)) itens.set(k, novo)
        // Provider: o item é a estratégia e vive entre leituras (o estado por posição está nele).
        // A CONFIGURAÇÃO tem de acompanhar — o dono muda `sinais_config` e isto entra no ciclo
        // seguinte sem reiniciar o serviço; o estado das posições abertas não se perde.
        else if (antigo.tipo === 'provider' && novo.tipo === 'provider') antigo.cfg = novo.cfg
      }
      for (const [k, i] of itens) if (!vivos.has(k) && !i.ocupado) itens.delete(k)
      for (const conta of aResemear) {
        for (const sk of [...sobreposicoes.keys()]) if (sk.startsWith(`${conta}|`)) sobreposicoes.delete(sk)
        resemear.delete(conta)
      }

      for (const p of escopo.pedidos) {
        const e = estados.get(p.conta) ?? { ligada: false, pedidaEm: 0, paradaAte: 0, falhas: 0 }
        estados.set(p.conta, { ...e, pedidaEm: agora })
      }
      const bloqueio = new Map<string, string>()
      for (const p of escopo.pedidos) {
        if (ligacoes.has(p.conta) || bloqueio.has(p.conta)) continue
        if (await contaInexistente(p.conta)) bloqueio.set(p.conta, 'conta inexistente na MetaApi (registo 24 h)')
        else if (p.chaveToken === 'casa' && (await leituraDeFundoBloqueada(p.conta))) bloqueio.set(p.conta, 'travão de quota da MetaApi')
        /**
         * UMA CONTA DESMONTADA NA METAAPI NÃO SE TOCA. Ver `conta-deployada.ts`: insistir nela
         * fazia a MetaApi armar o travão GLOBAL, e com o travão global o motor recusava TODAS as
         * contas — incluindo as que estavam boas. A verificação é um GET, não é streaming, e
         * reabre-se sozinha de 10 em 10 minutos para apanhar a conta no momento em que for
         * deployada.
         */
        else if (guardaDeploy && !(await guardaDeploy.podeLigar(p.conta))) bloqueio.set(p.conta, 'não está deployada na MetaApi')
        else if (p.chaveToken !== 'casa' && apis.pausadaAte(p.chaveToken as never, agora)) bloqueio.set(p.conta, `chave ${p.chaveToken} em pausa`)
      }
      const plano = planear(escopo.pedidos, estados, agora, CFG.planeamento, { pausaGlobalAte, bloqueada: (c) => bloqueio.get(c) ?? null })
      for (const conta of plano.desligar) await desligar(conta, 'sem posições abertas (graça passada) ou sem vaga')
      for (const conta of plano.ligar) ligar(conta)
      if (plano.recusadas.length) log('[escopo] recusadas:', plano.recusadas.map((r) => `${r.conta.slice(0, 8)} (${r.motivo})`).join(' · '))
      if (escopo.notas.length) log('[escopo]', escopo.notas.join(' · '))
    } catch (e) {
      contadores.erros++
      log('[escopo] falhou (mantém o que tinha):', e instanceof Error ? e.message : e)
    } finally {
      aLerEscopo = false
    }
  }

  function ligar(conta: string): void {
    const tk = tokens.get(conta) ?? { chave: 'casa' as const, token: CFG.token }
    const l = new LigacaoReal({
      conta,
      chaveToken: tk.chave,
      api: apis.cliente(tk),
      sdk,
      db,
      fotografia: CFG.fotografia.includes(conta),
      intervaloCotacoesMs: CFG.cotacoesMs,
      subscreverCotacoes: CFG.cotacoesMetaApi,
      intervaloFotoMs: num('PREMIUM_STREAMING_INTERVALO_MS', 1000),
      batimentoFotoMs: num('PREMIUM_STREAMING_BATIMENTO_MS', 2000),
      aoFalhar: (erro) => void falhouLigar(conta, tk, erro),
      aoRessincronizar: () => {
        vistas.set(conta, null)
        registo.largarConta(conta, Date.now())
        resemear.add(conta)
        if (acertarLive(Date.now())) void gravarPulso()
        void cicloEscopo()
      },
    })
    ligacoes.set(conta, l)
    vistas.set(conta, null)
    estados.set(conta, { ...(estados.get(conta) ?? { pedidaEm: Date.now(), paradaAte: 0, falhas: 0 }), ligada: true })
    l.iniciar()
  }

  async function falhouLigar(conta: string, tk: TokenResolvido, erro: unknown): Promise<void> {
    const e = neutralizarErroDeEquipa(erro, tk.chave)
    const limite = tk.chave === 'casa' ? eLimiteMetaApi(e) : eLimiteDeEquipa(e)
    const agora = Date.now()
    if (tk.chave === 'casa') {
      await registarErroQuota(conta, e)
      if (limite) pausaGlobalAte = agora + CFG.planeamento.pausaLimiteMs
    } else if (limite) {
      apis.pausar(tk.chave, agora + CFG.planeamento.pausaLimiteMs)
    }
    await marcarContaInexistente(conta, e, { nivelConta: true, origem: 'motor-real:ligar' })
    const antes = estados.get(conta) ?? { ligada: false, pedidaEm: agora, paradaAte: 0, falhas: 0 }
    estados.set(conta, aposFalhaLigar(antes, limite, agora, CFG.planeamento))
    ligacoes.get(conta)?.fechar().catch(() => undefined)
    ligacoes.delete(conta)
    vistas.delete(conta)
    log(`[ligacao] ${conta.slice(0, 8)} não ligou (${limite ? 'LIMITE' : 'erro'}; ${tk.chave}):`, e instanceof Error ? e.message : e)
  }

  async function desligar(conta: string, porque: string): Promise<void> {
    const l = ligacoes.get(conta)
    if (!l) return
    ligacoes.delete(conta)
    vistas.delete(conta)
    registo.largarConta(conta, Date.now())
    const e = estados.get(conta)
    if (e) estados.set(conta, { ...e, ligada: false })
    await l.fechar()
    log(`[ligacao] ${conta.slice(0, 8)} desligada: ${porque}`)
  }

  // ── tick ────────────────────────────────────────────────────────────────────────
  let aCorrer = false
  async function tick(): Promise<void> {
    if (aCorrer) return
    aCorrer = true
    const agora = Date.now()
    contadores.ticks++
    try {
      if (acertarLive(agora)) void gravarPulso()
      for (const [conta, l] of ligacoes) {
        void l.talvezPublicar()
        const posicoes = l.posicoes()
        if (!posicoes) continue
        if (resemear.has(conta)) { vistas.set(conta, diferencasPosicoes(conta, null, posicoes, agora).vista); continue }

        // O que mudou nas posições (o monitor, a corretora ou — em live — o próprio motor).
        const { observacoes, vista } = diferencasPosicoes(conta, vistas.get(conta) ?? null, posicoes, agora)
        vistas.set(conta, vista)
        const contaEmLive = [...entradaLive.keys()].some((k) => k.startsWith(`${norm(conta)}:`) && modoDe(conta, k.split(':')[1] as TipoGestao, agora) === 'live')
        if (!contaEmLive) for (const o of observacoes) { registo.observar(o, agora); contadores.observacoes++ }

        const doConta = [...itens.values()].filter((i) => i.conta === conta && !i.terminado && !i.ocupado)
        if (!doConta.length) continue
        const foto = { conta, posicoes, precoMedio: (s: string) => precoDe(conta, s), agora }
        // Posições que já têm dono (a linha que as originou). O tipo `provider` é o resto: a conta
        // mestre de uma estratégia também executa Premium e MTM Auto, e sem isto a mesma posição
        // seria decidida duas vezes, com duas regras diferentes, e a sombra ficaria ilegível.
        const geridas = new Set<string>()
        for (const i of doConta) {
          if (i.tipo === 't2t') { if (i.linha.broker_position_id) geridas.add(String(i.linha.broker_position_id)) }
          else if (i.tipo === 'mtmauto') { if (i.execucao.broker_position_id) geridas.add(String(i.execucao.broker_position_id)) }
          else if (i.tipo === 'premium') { const p = acharPosicao(posicoes, i.linha); if (p) geridas.add(String(p.id)) }
        }
        for (const item of doConta) {
          const modo = item.tipo === 'premium' ? modoDe(conta, 'premium', agora) : 'sombra'
          const ctx: ContextoAvaliacao = {
            modo,
            cfg: cfgs,
            registo,
            sobreposicoes,
            posicoesDe: (c) => ligacoes.get(c)?.posicoes() ?? null,
            subscritores: escopo?.subscritores ?? [],
            posicoesGeridas: geridas,
            trailingTempoReal: cfgs.premium.trailingTempoReal,
            live: modo === 'live' ? executor : undefined,
          }
          contadores.avaliacoes++
          if (modo === 'live') {
            item.ocupado = true
            void avaliarItem(item, foto, ctx)
              .then((notas) => { if (notas.length) log(`[live] ${conta.slice(0, 8)}`, notas.join(' · ')) })
              .catch((e) => { contadores.erros++; log(`[live] ${chaveItem(item)} erro:`, e instanceof Error ? e.message : e) })
              .finally(() => { item.ocupado = false })
          } else {
            const notas = await avaliarItem(item, foto, ctx)
            if (notas.length) { contadores.decisoes++; if (process.env.MOTOR_REAL_LOG_NOTAS === '1') log(`[sombra] ${conta.slice(0, 8)}`, notas.join(' · ')) }
          }
        }
      }
    } catch (e) {
      contadores.erros++
      log('[tick] erro:', e instanceof Error ? e.message : e)
    } finally {
      aCorrer = false
    }
  }

  // ── gravações (em lote) ─────────────────────────────────────────────────────────
  async function gravarSombra(): Promise<void> {
    porGravar.push(...registo.recolher(Date.now()))
    if (porGravar.length > 5_000) {
      log(`[sombra] fila com ${porGravar.length} linhas — descartadas as ${porGravar.length - 5_000} mais antigas`)
      porGravar = porGravar.slice(-5_000)
    }
    while (porGravar.length) {
      const lote = porGravar.slice(0, 500)
      const { error } = await db.from('gestao_real_sombra').insert(lote)
      if (error) { log('[sombra] gravação falhou (tenta no próximo ciclo):', error.message); return }
      porGravar = porGravar.slice(lote.length)
      contadores.gravadas += lote.length
    }
  }

  async function gravarPulso(): Promise<void> {
    const agora = Date.now()
    const live = [...entradaLive.keys()].filter((k) => ligacaoDe(k.split(':')[0]!)?.sincronizada === true)
    const { error } = await db.from('gestao_real_pulso').upsert({
      servico: SERVICO_PULSO,
      em: new Date(agora).toISOString(),
      escrita: CFG.escrita,
      live,
      contas: [...ligacoes.values()].map((l) => ({ ...l.resumo(), tipos: [...tiposDaConta(l.conta)] })),
      detalhe: {
        itens: itens.size,
        emEspera: registo.emEspera,
        porGravar: porGravar.length,
        pausaGlobalAte: pausaGlobalAte > agora ? new Date(pausaGlobalAte).toISOString() : null,
        contadores,
        regras: cfgs,
      },
    }, { onConflict: 'servico' })
    if (error) log('[pulso] falhou:', error.message)
  }

  let ultimaLimpeza = 0
  async function limpar(): Promise<void> {
    if (Date.now() - ultimaLimpeza < 3_600_000) return
    ultimaLimpeza = Date.now()
    const { error } = await db.from('gestao_real_sombra').delete().lt('decidido_em', new Date(Date.now() - 30 * 86_400_000).toISOString())
    if (error) log('[limpeza] falhou:', error.message)
  }

  await cicloEscopo()
  const iTick = setInterval(() => void tick(), CFG.tickMs)
  const iEscopo = setInterval(() => void cicloEscopo(), CFG.escopoMs)
  const iGravar = setInterval(() => void (async () => {
    await gravarSombra().catch((e) => log('[sombra] erro:', e))
    await gravarPulso().catch((e) => log('[pulso] erro:', e))
    await executor.descarregarPicos().catch((e) => log('[live] picos:', e))
    await limpar().catch(() => undefined)
  })(), CFG.gravarMs)
  const iLog = setInterval(() => {
    log('[pulso]', JSON.stringify({ ...contadores, precos: precos.resumo(), deploy: guardaDeploy?.resumo() ?? null, itens: itens.size, emEspera: registo.emEspera, live: [...entradaLive.keys()], contas: [...ligacoes.values()].map((l) => l.resumo()) }))
  }, 60_000)

  let aSair = false
  const sair = async (sinal: string) => {
    if (aSair) return
    aSair = true
    log(`[motor-real] ${sinal} — a largar o live, gravar a sombra e fechar as ligações`)
    for (const i of [iTick, iEscopo, iGravar, iLog]) clearInterval(i)
    entradaLive.clear()
    CFG.escrita = false
    // Pára o relógio dos preços antes de tudo: a partir daqui ninguém decide, e uma leitura a mais
    // só atrasaria a saída dentro dos 8 s de graça.
    precos.parar()
    await Promise.race([
      (async () => {
        await gravarPulso().catch(() => undefined)
        for (const l of ligacoes.values()) registo.largarConta(l.conta, Date.now())
        await gravarSombra().catch(() => undefined)
        await executor.descarregarPicos().catch(() => undefined)
        await Promise.all([...ligacoes.values()].map((l) => l.fechar()))
      })(),
      new Promise((r) => setTimeout(r, 8_000)),
    ])
    process.exit(0)
  }
  process.on('SIGTERM', () => void sair('SIGTERM'))
  process.on('SIGINT', () => void sair('SIGINT'))
}

void main()
