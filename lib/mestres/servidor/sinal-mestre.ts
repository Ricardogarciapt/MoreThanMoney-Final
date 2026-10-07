/**
 * SINAL → MESTRE SIM — GoldKiller e Sensei (webhook TradingView) e o Premium (relay-post, via
 * lib/mestres/servidor/premium.ts) passam a abrir na conta SIMULADA da
 * casa que é a mestre da estratégia (mestres_estrategias.conta_mestre_id) e nas contas simuladas que a
 * seguem, com a gestão da estratégia (`sinais_config` → lib/mtmfunded/estrategias-sinais: BE, trailing,
 * parciais em PREÇO gravados na posição; o motor simulado do VPS executa-os ao nosso preço). É o mesmo
 * cano de Edge/King/Wolf (executar.ts), que já nasceram assim.
 *
 * `sinal_modo`:
 *  · desligado → nada (o caminho de sempre: ordem na mestre MT5 + espelho provider para a SIM)
 *  · sombra    → grava em `mestres_sinais` o que abriria (conta, lote, gestão) sem abrir nada
 *  · live      → abre na SIM e devolve `substituiMt5=true`: o webhook deixa de mandar a ordem para a
 *                mestre MT5 (senão o espelho provider traria a mesma trade uma segunda vez para a SIM).
 *
 * Chamado DENTRO dos portões do webhook (canExecuteProvider: interruptor por activo, gate de
 * qualidade, score, stops sãos). Nunca lança.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { abrirSinalNaConta, type ResultadoAbrir } from '@/lib/mtmfunded/estrategias-sinais/abrir'
import { chaveDoSinal, configDoProvider, gestaoDoSinal, impressaoDoTrade, loteParaConta } from '@/lib/mtmfunded/estrategias-sinais/calculo'
import { lerTravas, temTravas, travasDaMestre } from '@/lib/copia-contas/mestre-travas'
import { lerConfigGlobal, lerEstrategiaMestre, type ModoEstrategia } from '../tipos'
import { COMENTARIO_PREMIUM, SLUG_PREMIUM } from '../premium'

export interface AlvoDaFonte {
  slug: string
  comentario: string
  /**
   * Premium: `mtmauto_providers.ativo` do premium-ouro está FALSE de propósito (o dono desligou o MTM Auto
   * Premium a 17/09 — ligá-lo punha o mtm-auto e o espelho das seguidoras a executar pela conta MT5).
   * Aqui o interruptor é só `mestres_estrategias.sinal_modo` (+ kill-switch).
   */
  ignoraProviderAtivo?: boolean
  /**
   * Premium: o SME numera cada setup (1., 2., 3.…) e cada um é uma trade — a chave é o id EXACTO da
   * mensagem, e a regra «não abrir sem a anterior em BE + parcial» é decidida antes (lib/mestres/premium).
   */
  permitirDuplicado?: boolean
  /** prefixo da referência na chave do sinal ('tv' = registo do webhook; 'tg' = mensagem Telegram) */
  prefixo?: string
}

export const ESTRATEGIA_DO_WEBHOOK: Record<string, AlvoDaFonte> = {
  goldkiller: { slug: 'Goldkiller', comentario: 'MTM Auto GoldKiller' },
  sensei: { slug: 'sensei', comentario: 'MTM Auto Sensei' },
  /**
   * MTM Scanner (24/09, pedido do dono: «as entradas de mtm scanner devem ser passadas para a conta
   * que criaste de 10k mas apenas as que tiverem todas as confirmações»). A mestre é a conta 77696002
   * («Mestre · MTM Auto Scanner»); o filtro das confirmações está em lib/mtmcopy/scanner-confirmacoes
   * e é aplicado no webhook ANTES de chegar aqui. O scanner continua a NÃO executar em contas MT5 —
   * `canExecuteProvider` exclui-o de propósito desde 18/08, e isso não muda.
   */
  mtmscanner: { slug: 'mtm-scanner', comentario: 'MTM Auto Scanner' },
  /**
   * Aurum Flow (07/10, pedido do dono: a mestre «recomeça do zero e passa a seguir os sinais do
   * webhook ?strategy=aurum»). Só cripto; o webhook traduz o perpétuo para o símbolo da casa
   * (lib/mestres/aurum.ts) e respeita o perps-gate antes de chegar aqui.
   */
  aurum: { slug: 'aurum-flow', comentario: 'MTM Auto Aurum Flow' },
  // Premium (relay-post → processador → lib/mestres/servidor/premium.ts), não o webhook TradingView.
  premium: { slug: SLUG_PREMIUM, comentario: COMENTARIO_PREMIUM, ignoraProviderAtivo: true, permitirDuplicado: true, prefixo: 'tg' },
}

const cacheConfig = new Map<string, { linha: Record<string, unknown> | null; global: unknown; em: number }>()

/** Os quatro modos de NÃO abrir na mestre. Cada um responde de maneira diferente à mestre MT5. */
export type NaoExecucaoMestre = 'kill-switch' | 'estrategia-inactiva' | 'erro-antes-de-abrir' | 'erro-depois-de-abrir'

/**
 * A ordem na mestre MT5 também é travada? (função pura — teste em `__tests__/mestres.check.ts`)
 *
 * É a pergunta que o defeito de 24/09 respondia sempre igual e sem o dizer. As quatro respostas:
 *
 *  · `erro-depois-de-abrir` → TRAVA. Já se enviaram ordens para as contas SIM; mandar o sinal para
 *    a MT5 abria a MESMA trade outra vez, e o espelho provider trazia-a duplicada para a SIM.
 *  · `erro-antes-de-abrir`  → NÃO trava. Nada abriu em lado nenhum; um timeout do Supabase não pode
 *    custar o sinal, e o caminho de sempre (MT5 + espelho) continua a existir.
 *  · `kill-switch`          → trava se o modo era `live`. O kill é uma trava de emergência: deixar a
 *    ordem ir para a MT5 fazia o espelho provider trazê-la de volta para a SIM — o kill seria
 *    contornado pelas traseiras. Em `sombra` a MT5 é o executor normal e não se lhe toca.
 *  · `estrategia-inactiva`  → igual. `mtmauto_providers.ativo=false` é o dono a desligar o MTM Auto
 *    daquela estratégia (premium-ouro, 17/09); abrir na MT5 contrariava essa decisão.
 *
 * O preço de travar é o sinal não abrir. Por isso nenhum destes casos pode ficar calado: quem trava
 * grava o motivo em `mestres_sinais` e devolve-o para o registo do sinal.
 */
export function travarOrdemMt5(caso: NaoExecucaoMestre, modo: ModoEstrategia): boolean {
  if (caso === 'erro-depois-de-abrir') return true
  if (caso === 'erro-antes-de-abrir') return false
  return modo === 'live'
}

export interface SinalWebhook {
  fonte: string
  symbol: string
  direcao: 'buy' | 'sell'
  entrada: number | null
  sl: number | null
  tps: number[]
  /** id do registo do webhook (tradingview_signals) — chave de idempotência */
  externalRef: string
  /**
   * Premium: entra a MERCADO com os níveis absolutos do trader (`entrada=null` → nada se re-ancora) e a
   * referência (1.º valor da zona) serve só para o registo e para a gestão calculada em sombra.
   */
  entradaReferencia?: number | null
}

export interface ResultadoSinalMestre {
  modo: ModoEstrategia
  /**
   * `true` = o webhook NÃO manda a ordem para a mestre MT5. Duas leituras muito diferentes:
   *  · abriu-se na SIM e a MT5 seria uma segunda trade (o caso normal do live);
   *  · NÃO se abriu nada e a MT5 também não deve abrir (kill-switch, estratégia desligada).
   * `motivo` diz qual é, e é ele que fica no registo do sinal.
   */
  substituiMt5: boolean
  estrategia?: string
  contas?: ResultadoAbrir[]
  /** Porque é que não se abriu (ou o que aconteceu). Vazio só quando abriu tudo como devia. */
  motivo?: string
}

export async function encaminharSinalParaMestre(s: SinalWebhook): Promise<ResultadoSinalMestre> {
  const alvo = ESTRATEGIA_DO_WEBHOOK[s.fonte]
  if (!alvo) return { modo: 'desligado', substituiMt5: false, motivo: `fonte ${s.fonte} não é uma estratégia com mestre` }
  /** Já se enviou alguma ordem para as contas SIM? (decide o que o `catch` faz com a mestre MT5) */
  let tocouNasContas = false
  try {
    const db = getSupabaseAdmin()
    // Cache de 5 s: isto corre no caminho quente do webhook, antes da ordem na mestre MT5.
    const c = cacheConfig.get(alvo.slug)
    const lido = c && Date.now() - c.em < 5_000 ? c : await (async () => {
      const [{ data: linha, error }, { data: cfgGlobal }] = await Promise.all([
        db.from('mestres_estrategias').select('*').ilike('slug', alvo.slug).maybeSingle(),
        db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle(),
      ])
      const v = { linha: error ? null : (linha as Record<string, unknown> | null), global: cfgGlobal?.value ?? null, em: Date.now() }
      cacheConfig.set(alvo.slug, v)
      return v
    })()
    if (!lido.linha) return { modo: 'desligado', substituiMt5: false, motivo: `estratégia ${alvo.slug} sem linha em mestres_estrategias` }
    const est = lerEstrategiaMestre(lido.linha)
    if (est.sinalModo === 'desligado') return { modo: 'desligado', substituiMt5: false, motivo: 'sinal_modo desligado (o sinal segue pela mestre MT5, como sempre)' }
    const global = lerConfigGlobal(lido.global)

    const ref = s.entradaReferencia ?? s.entrada
    // Sem referência (webhook sem registo, mensagem sem id) a chave cai nos níveis + hora — nunca numa
    // chave fixa `tv:` que juntava sinais diferentes.
    // Calculada AQUI, antes dos travões, para que uma não-execução também possa ficar em
    // `mestres_sinais` com a mesma chave que a execução teria tido (defeito 2, 24/09).
    const chave = chaveDoSinal({ fonte: est.slug, msgId: s.externalRef && s.externalRef !== '0' ? `${alvo.prefixo ?? 'tv'}:${s.externalRef}` : null, symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl })
    const impressao = impressaoDoTrade({ symbol: s.symbol, direcao: s.direcao, entrada: ref })
    /** Deixa o motivo da não-execução onde ele se procura: na linha do sinal desta estratégia. */
    const gravarNaoExecucao = async (motivo: string): Promise<void> => {
      await db.from('mestres_sinais').upsert({
        estrategia: est.slug, chave, modo: est.sinalModo === 'live' ? 'live' : 'sombra',
        symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl, tps: s.tps,
        resultado: { naoExecutado: motivo, contas: [] },
      }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true }).then(() => undefined, () => undefined)
    }

    /**
     * KILL-SWITCH. Trava de emergência do motor das mestres: nada abre em lado nenhum, e por isso
     * `substituiMt5` fica TRUE. Devolver `false` mandaria a ordem para a mestre MT5 e o espelho
     * provider trazia-a de volta para a SIM — o kill-switch seria contornado pelas traseiras,
     * exactamente a trade que se queria travar. Não abrir nada é a resposta certa; o que faltava
     * era dizê-lo em vez de ficar calado.
     */
    if (global.kill) {
      const motivo = 'kill-switch do motor das mestres: nada abriu, e a ordem MT5 também foi travada'
      await gravarNaoExecucao(motivo)
      return { modo: est.sinalModo, substituiMt5: travarOrdemMt5('kill-switch', est.sinalModo), estrategia: est.slug, motivo }
    }

    const { data: prov } = await db.from('mtmauto_providers').select('*').eq('id', est.providerId).maybeSingle()
    /**
     * ESTRATÉGIA INACTIVA. `mtmauto_providers.ativo = false` é o interruptor com que o dono desliga
     * o MTM Auto de uma estratégia (foi o que fez ao premium-ouro a 17/09 — por isso o Premium tem
     * `ignoraProviderAtivo`). Também aqui `substituiMt5` fica TRUE: passar ao MT5 abriria a ordem
     * que o dono acabou de desligar, e o espelho provider duplicava-a na SIM se o provider fosse
     * religado. A escolha é deliberada — entre «não abrir nada» e «abrir na MT5 contra a decisão
     * do dono», não abrir é o lado seguro. Com rasto, para não ser silêncio.
     */
    if (!prov || prov.apagado_em || (prov.ativo !== true && !alvo.ignoraProviderAtivo)) {
      const motivo = !prov
        ? `provider ${est.providerId} não existe: nada abriu, e a ordem MT5 também foi travada`
        : prov.apagado_em
          ? `provider ${est.providerId} apagado: nada abriu, e a ordem MT5 também foi travada`
          : `MTM Auto da estratégia desligado (mtmauto_providers.ativo=false): nada abriu, e a ordem MT5 também foi travada`
      await gravarNaoExecucao(motivo)
      return { modo: est.sinalModo, substituiMt5: travarOrdemMt5('estrategia-inactiva', est.sinalModo), estrategia: est.slug, motivo }
    }
    const cfg = { ...configDoProvider(prov as Record<string, unknown>), ...(alvo.permitirDuplicado ? { permitirDuplicado: true } : {}) }

    /**
     * AS TRAVAS DA MESTRE (lib/copia-contas/mestre-travas.ts) — janela horária, fecho de fim de
     * semana, bloqueio de notícias, drawdown do dia e margem livre.
     *
     * É AQUI e não em cada seguidor porque este é o único sítio por onde um sinal entra na conta
     * mestre: travado aqui, nada sai para conta nenhuma — e a cadeia inteira pára sem se escrever
     * uma linha em `mestres_contas`. Ver o cabeçalho de mestre-travas.ts para o porquê de não se
     * bloquear cada seguidor à mão.
     *
     * `substituiMt5` fica TRUE, pela mesma razão do kill-switch e da estratégia inactiva: deixar a
     * ordem seguir para a mestre MT5 fazia o espelho provider trazê-la de volta para a SIM, e a
     * trava era contornada pelas traseiras. Entre «não abrir» e «abrir contra a regra que o gestor
     * acabou de configurar», não abrir é o lado seguro — com o motivo gravado, para não ser silêncio.
     *
     * As travas só decidem ABRIR. Nada aqui toca em BE, trailing, parciais ou fechos do que já está
     * aberto: parar a gestão de uma posição viva é pior do que o prejuízo que se queria travar.
     */
    const travas = lerTravas((prov as Record<string, unknown>).sinais_config)
    if (temTravas(travas)) {
      // `0` é um valor válido (margem usada zero é uma conta sem posições), por isso não se usa `||`.
      const numOuNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
      // Só se vai à base buscar equity/margem quando há alguma trava ligada — isto corre no caminho
      // quente do webhook, antes da ordem na mestre MT5.
      const { data: mestreTravas } = await db.from('mtm_trading_accounts')
        .select('sim_equity, sim_saldo, sim_margem, sim_ancora_dia').eq('id', est.contaMestreId).maybeSingle()
      const equity = numOuNull(mestreTravas?.sim_equity) ?? numOuNull(mestreTravas?.sim_saldo)
      const margemUsada = numOuNull(mestreTravas?.sim_margem)
      const v = travasDaMestre(travas, {
        agora: new Date(),
        symbol: s.symbol,
        /**
         * SEM FONTE DE EVENTOS ECONÓMICOS no lado do site: o único calendário da casa é o CSV em UTC
         * das EA MT5, que vive no terminal e não numa tabela. Com a lista vazia a trava das notícias
         * nunca dispara — e é por isso que ela aparece marcada «NÃO APLICADO» no quadro branco
         * (lib/copia-contas/mestre-controlos.ts). Preferiu-se passar aqui uma lista vazia, com a
         * ligação já feita, a deixar a função de fora e dar a impressão de que só falta configurar.
         */
        eventos: [],
        equity,
        equityInicioDoDia: numOuNull(mestreTravas?.sim_ancora_dia),
        // Margem LIVRE = equity − margem usada. A conta mestre é simulada, por isso os dois números
        // vêm do motor simulado; sem um deles, `margemInsuficiente` não trava (é o desenho).
        margemLivre: equity != null && margemUsada != null ? equity - margemUsada : null,
      })
      if (!v.podeAbrir) {
        const motivo = `travas da mestre: ${v.motivo}`
        await gravarNaoExecucao(motivo)
        return { modo: est.sinalModo, substituiMt5: travarOrdemMt5('estrategia-inactiva', est.sinalModo), estrategia: est.slug, motivo }
      }
    }

    const contas = new Set<string>([est.contaMestreId])
    const { data: seguidoras } = await db.from('mtm_trading_accounts').select('id')
      .eq('motor', 'sim').eq('estado', 'ativa').ilike('segue_estrategia', est.slug).limit(2000)
    for (const c of seguidoras ?? []) contas.add(String(c.id))

    if (est.sinalModo === 'sombra') {
      // O que abriria na mestre: lote e gestão calculados como no live, sem tocar em posições.
      const { data: mestre } = await db.from('mtm_trading_accounts').select('sim_saldo, saldo_inicial').eq('id', est.contaMestreId).maybeSingle()
      const { data: simb } = await db.from('funded_symbols').select('*').eq('symbol', s.symbol.toUpperCase()).maybeSingle()
      const saldo = Number(mestre?.sim_saldo ?? mestre?.saldo_inicial ?? 0)
      const volume = simb ? loteParaConta(saldo, cfg, simb as never) : null
      const gestao = simb && volume && ref ? gestaoDoSinal({ simbolo: simb as never, direcao: s.direcao, precoExecucao: ref, volume, sl: s.sl, tps: s.tps, cfg }) : null
      await db.from('mestres_sinais').upsert({
        estrategia: est.slug, chave, modo: 'sombra', symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl, tps: s.tps,
        resultado: { contas: contas.size, mestre: est.contaMestreId, volumeMestre: volume, gestao: gestao?.gestao ?? null, tpFinal: gestao?.tpFinal ?? null },
      }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
      return { modo: 'sombra', substituiMt5: false, estrategia: est.slug }
    }

    const ids = [...contas]
    const resultados: ResultadoAbrir[] = []
    // A partir da primeira ordem enviada, um erro mais à frente já não pode devolver o sinal à
    // mestre MT5 — ver o `catch` no fim.
    tocouNasContas = true
    for (let i = 0; i < ids.length; i += 10) {
      resultados.push(...(await Promise.all(ids.slice(i, i + 10).map((accountId) => abrirSinalNaConta({
        accountId, estrategia: est.slug, chave, impressao, fonte: est.slug, comentario: alvo.comentario,
        symbol: s.symbol, direcao: s.direcao, entrada: s.entrada, sl: s.sl, tps: s.tps, cfg,
      })))))
    }
    await db.from('mestres_sinais').upsert({
      estrategia: est.slug, chave, modo: 'live', symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl, tps: s.tps,
      resultado: { contas: resultados.map((r) => ({ conta: r.accountId, estado: r.estado, volume: r.volume ?? null, motivo: r.motivo ?? null })) },
    }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
    // A mestre é a conta que manda: se NELA não abriu nada, o sinal não existe para o resto do
    // sistema e isso tem de sair dito (era o outro modo de ficar calado com `substituiMt5: true`).
    const mestreAbriu = resultados.some((r) => r.accountId === est.contaMestreId && r.estado === 'aberta')
    const motivoMestre = mestreAbriu
      ? undefined
      : `a mestre ${est.contaMestreId.slice(0, 8)} não abriu: ${resultados.find((r) => r.accountId === est.contaMestreId)?.motivo ?? 'sem resposta da conta mestre'}`
    return { modo: 'live', substituiMt5: true, estrategia: est.slug, contas: resultados, motivo: motivoMestre }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    /**
     * ERRO INESPERADO (timeout do Supabase, por exemplo). A escolha depende de ONDE rebentou:
     *  · ANTES de tocar nas contas → nada abriu, e deixar o sinal sem execução nenhuma é pior do
     *    que o caminho de sempre: devolve-se `substituiMt5: false` e o webhook manda a ordem MT5.
     *  · DEPOIS de já ter enviado ordens para as contas SIM (o upsert em `mestres_sinais` é o
     *    candidato mais provável) → `false` abriria a MESMA trade outra vez na mestre MT5, e o
     *    espelho provider trazia-a para a SIM em duplicado. Aí trava-se a MT5.
     * Em qualquer dos casos o motivo vai no resultado e acaba no registo do sinal — antes o erro
     * era engolido e devolvia `desligado` seco, sem deixar rasto nenhum.
     */
    return tocouNasContas
      ? { modo: 'live', substituiMt5: travarOrdemMt5('erro-depois-de-abrir', 'live'), motivo: `erro depois de abrir nas contas SIM (ordem MT5 travada para não duplicar): ${erro}` }
      : { modo: 'desligado', substituiMt5: travarOrdemMt5('erro-antes-de-abrir', 'desligado'), motivo: `erro antes de abrir (o sinal seguiu pela mestre MT5): ${erro}` }
  }
}
