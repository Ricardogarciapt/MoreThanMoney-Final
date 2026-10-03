/**
 * O AGENTE TRADER — decide o que abrir na conta simulada 77549217.
 *
 * ═══ A CONTA É PAPEL, E ISSO VERIFICA-SE A CADA PASSAGEM ═══════════════════════════════════
 *
 * `motor='sim'` e `metaapi_account_id` vazio: não há corretora do outro lado, não há dinheiro real.
 * Mas **isso é um facto na base de dados, não uma propriedade do código** — alguém pode ligar essa
 * conta à MetaApi amanhã, por engano ou por decisão, e este ficheiro continuaria a mandar ordens.
 *
 * Por isso a verificação não é um comentário: é `contaSegura()`, é pura, é provada, e corre ANTES
 * de qualquer execução. Se a conta deixar de ser papel, isto PÁRA e diz porquê. É um limite do
 * dono, escrito por extenso: nunca executar ordens com dinheiro real.
 *
 * ═══ ESTA CONTA JÁ TEM QUEM A ALIMENTE — E POR ISSO ISTO NASCE DESARMADO ═══════════════════
 *
 * Descobriu-se ao investigar, antes de escrever: a 77549217 tem `recolhe_todos_sinais = true` e a
 * etiqueta «Todos os sinais», e já é servida por `lib/mtmfunded/estrategias-sinais/todos-os-sinais.ts`
 * a lote fixo. Ou seja, **já há um escritor nesta conta.**
 *
 * Um segundo escritor a abrir os mesmos sinais duplicava posições e estragava a única medição de
 * desempenho honesta que a casa tem. Então:
 *
 *  · sem `site_settings.agente_trader.armado === true`, isto DECIDE e RELATA sem abrir nada. O
 *    dono pode vê-lo escolher durante os dias que quiser antes de lhe dar a faca;
 *  · há um tecto de aberturas por passagem, para que uma decisão enganada pare no tecto em vez de
 *    encher a conta antes de alguém acordar.
 *
 * ═══ PORQUE É QUE ELE NÃO ESTAVA A TRABALHAR, E O QUE MUDOU A 01/10 ═══════════════════════
 *
 * Não estava, e por duas razões diferentes que se somavam. Vale a pena separá-las porque só uma
 * delas era deliberada:
 *
 *  1. **o `?trader=1`.** A passagem diária (`/api/cron/agentes`, 06:00) só o corria quando alguém
 *     punha o parâmetro à mão. Foi uma decisão consciente, pelo motivo acima — a conta já tem outro
 *     escritor — mas a decisão certa era deixá-lo FORA DA EXECUÇÃO, não fora da passagem. Analisar,
 *     decidir e registar não duplica posição nenhuma: o que duplica é abrir. O resultado prático
 *     era um agente que nunca pensava, e portanto nunca tinha nada para mostrar no dia em que o
 *     dono lhe desse a faca — e que ia ser julgado pela régua das 48 h por não produzir. Agora ele
 *     corre em TODAS as passagens e o que fica dependente do interruptor é só a abertura;
 *  2. **a carência do ciclo do CEO.** Mesmo a correr, ele não recebia pedido nenhum: a carência
 *     travava a emissão inteira, e um agente novo passava 48 h sem nada que fazer para depois ser
 *     julgado pelo que não fez (corrigido em `ciclo-ceo.ts`, ver {@link NATUREZA} lá).
 *
 * O que NÃO mudou, e não muda: a conta é de PAPEL. `motor='sim'`, sem `metaapi_account_id`. Armar a
 * execução continua a ser decisão do dono — uma única chave, `site_settings.agente_trader` — e o
 * motivo está escrito acima e está escalado em `lib/agentes/desbloqueio.ts`. «Fazer o trader
 * trabalhar» é fazê-lo analisar, decidir e REGISTAR; nunca abrir uma ordem real.
 *
 * ═══ NÃO SE INVENTA UM CAMINHO DE EXECUÇÃO ═════════════════════════════════════════════════
 *
 * As escritas nos campos `sim_*` fazem-se por `abrirSinalNaConta`, que já existe e que trata da
 * ponte anti-duplicado (`funded_sinal_posicoes`), do preço de preenchimento (pior-dos-dois), do
 * lote e da gestão. Escrever em `funded_positions` à mão seria pior do que redundante: há um
 * trigger (`funded_copy_emitir_trg`) que emite para a caixa de saída do copiador em qualquer
 * insert — um insert directo propagava-se para contas REAIS em cópia.
 */

/** A conta de papel do agente. Está aqui em vez de num env para poder ser lida nos checks. */
export const CONTA_PAPEL_LOGIN = '77549217'

/** Quantas posições o agente pode ter abertas ao mesmo tempo. */
export const MAX_ABERTAS = 6
/** Quantas na mesma direcção do mesmo símbolo. Mais do que uma é dobrar a aposta, não diversificar. */
export const MAX_POR_SIMBOLO = 1
/** Aberturas por passagem. O travão que faz um erro parar no tecto. */
export const TECTO_POR_PASSAGEM = 3

/**
 * O PREFIXO DA CHAVE DESTE AGENTE.
 *
 * As posições do agente têm chave própria para a ponte dele nunca colidir com a que
 * `todos-os-sinais.ts` cria para o mesmo sinal na mesma conta.
 *
 * E tem de ser usado NOS DOIS SÍTIOS — ao escrever e ao comparar. Estava só no lado da escrita: o
 * trader gravava `agente-trader:X` e depois perguntava se já tinha aberto `X`, que nunca batia. O
 * defeito andou escondido atrás do `MAX_POR_SIMBOLO = 1`, que apanhava a segunda abertura por
 * outro caminho — e registava-a como «símbolo cheio» quando a verdade era «já o abri eu». No dia
 * em que alguém pusesse esse limite a 2 para permitir reforços, passava a duplicar a sério.
 */
export const PREFIXO_CHAVE = 'agente-trader:'

/** A chave desta posição, como fica gravada. Um único sítio para os dois lados. */
export function chaveDoAgente(chaveDoSinal: string): string {
  return `${PREFIXO_CHAVE}${chaveDoSinal}`
}
/** Um sinal mais velho do que isto não se abre: o preço já não é o que ele viu. */
export const FRESCURA_MINUTOS = 15

/**
 * A chave por onde este agente se reconhece em `agentes_equipa`.
 *
 * Pela chave e não pelo NOME: o nome já mudou uma vez (a 166 semeou «Trader Papel» e em produção
 * ele chama-se «Sensei»), e um registo que procure pelo nome deixa de encontrar o agente no dia em
 * que alguém lhe muda o rótulo no painel — sem erro, só sem rasto.
 */
export const CHAVE_RECEITA_DO_TRADER = 'AG-TRADER'

/** A conta, como vem de `mtm_trading_accounts`. */
export interface ContaDoTrader {
  id: string
  mt5_login?: string | null
  motor?: string | null
  metaapi_account_id?: string | null
  estado?: string | null
  sim_saldo?: number | string | null
  pausada_em?: string | null
}

/**
 * O PORTÃO DE SEGURANÇA — puro, e o mais importante deste ficheiro.
 *
 * Diz «não» por omissão: qualquer campo em falta ou inesperado é motivo para não executar. Um
 * portão que deixa passar o que não reconhece não é um portão.
 */
export function contaSegura(conta: ContaDoTrader | null | undefined): { seguro: boolean; porque: string } {
  if (!conta) return { seguro: false, porque: 'Conta não encontrada.' }

  const login = String(conta.mt5_login ?? '').trim()
  if (login !== CONTA_PAPEL_LOGIN) {
    return { seguro: false, porque: `Esta não é a conta de papel: esperava ${CONTA_PAPEL_LOGIN} e veio ${login || '(vazio)'}.` }
  }

  const motor = String(conta.motor ?? '').trim().toLowerCase()
  if (motor !== 'sim') {
    return {
      seguro: false,
      porque:
        `PARAR: a conta ${login} tem motor='${motor || '(vazio)'}' e não 'sim'. ` +
        'Deixou de ser papel — não se executa uma única ordem. Avisar o Ricardo.',
    }
  }

  /**
   * Um `metaapi_account_id` preenchido significa corretora do outro lado. É o sinal mais claro de
   * que a conta passou a real, e chega sozinho para travar tudo.
   */
  const metaapi = String(conta.metaapi_account_id ?? '').trim()
  if (metaapi) {
    return {
      seguro: false,
      porque:
        `PARAR: a conta ${login} tem metaapi_account_id ('${metaapi}'), ou seja uma corretora ligada. ` +
        'Não se executa uma única ordem com dinheiro real. Avisar o Ricardo.',
    }
  }

  if (String(conta.estado ?? '').trim().toLowerCase() !== 'ativa') {
    return { seguro: false, porque: `A conta está '${conta.estado ?? '(vazio)'}' e não 'ativa'.` }
  }

  if (conta.pausada_em) {
    return { seguro: false, porque: 'A conta está pausada pelo admin — a pausa fecha as portas de abertura.' }
  }

  return { seguro: true, porque: `Conta ${login} é papel: motor='sim', sem MetaApi, activa.` }
}

/** Um sinal já lido, reduzido ao que decide. Vem de `mestres_sinais`. */
export interface SinalDoTrader {
  /** `estrategia:chave` — o que identifica o sinal de forma estável. */
  chave: string
  estrategia: string
  symbol: string
  direcao: 'buy' | 'sell'
  entrada?: number | null
  sl?: number | null
  tps?: number[] | null
  criadoEm: string
}

/** Uma posição aberta, reduzida ao que decide. */
export interface AbertaDoTrader {
  symbol: string
  direcao: 'buy' | 'sell'
  /** A chave do sinal que a abriu, quando existe. */
  chave?: string | null
}

export type MotivoRecusa =
  | 'sem_sl'
  | 'velho'
  | 'ja_aberto'
  | 'repetido_no_lote'
  | 'simbolo_cheio'
  | 'conta_cheia'
  | 'tecto_da_passagem'
  | 'dados_incompletos'

export interface Decisao {
  sinal: SinalDoTrader
  abrir: boolean
  motivo: MotivoRecusa | null
  /** Em português, para o painel e para o registo. */
  porque: string
}

const PORQUES: Record<MotivoRecusa, string> = {
  sem_sl: 'Sinal sem stop loss. Não se abre o que não tem onde fechar.',
  velho: 'Sinal demasiado antigo — o preço já não é o que ele viu.',
  ja_aberto: 'Já existe uma posição aberta por este sinal.',
  repetido_no_lote: 'O mesmo sinal apareceu duas vezes nesta leitura.',
  simbolo_cheio: 'Já há posição aberta neste símbolo e direcção.',
  conta_cheia: 'A conta já tem o máximo de posições abertas.',
  tecto_da_passagem: 'Tecto de aberturas desta passagem atingido — fica para a próxima.',
  dados_incompletos: 'Falta símbolo ou direcção.',
}

/**
 * A DECISÃO — pura.
 *
 * A ordem das recusas é a regra, e cada uma existe por uma razão que se escreve:
 *
 *  1. dados incompletos e sem SL saem primeiro, porque são defeito do sinal e não do contexto;
 *  2. velhos a seguir: abrir um sinal de ontem ao preço de hoje é entrar onde ninguém entrou;
 *  3. já aberto / repetido no lote: o anti-duplicado desta camada. `abrirSinalNaConta` tem o seu
 *     próprio, na base, com índice único — este existe para não lhe mandar trabalho inútil nem
 *     gastar o tecto da passagem com pedidos que vão ser recusados;
 *  4. símbolo cheio e conta cheia: os limites de exposição;
 *  5. o tecto da passagem é o ÚLTIMO, para que a contagem reflicta o que realmente se ia abrir.
 *
 * Os mais recentes decidem-se primeiro: se o tecto cortar, corta o sinal mais velho, que é o que
 * tem o preço mais estragado.
 */
export function decidirOperacoes(entrada: {
  sinais: SinalDoTrader[]
  abertas: AbertaDoTrader[]
  agora?: Date
  maxAbertas?: number
  maxPorSimbolo?: number
  tecto?: number
  frescuraMinutos?: number
}): Decisao[] {
  const agora = entrada.agora ?? new Date()
  const maxAbertas = entrada.maxAbertas ?? MAX_ABERTAS
  const maxPorSimbolo = entrada.maxPorSimbolo ?? MAX_POR_SIMBOLO
  const tecto = entrada.tecto ?? TECTO_POR_PASSAGEM
  const frescura = entrada.frescuraMinutos ?? FRESCURA_MINUTOS

  /**
   * As chaves já abertas, com o prefixo TIRADO quando é nossa. Assim compara-se igual com igual:
   * o que vem da base é `agente-trader:estrategia:chave` e o sinal é `estrategia:chave`.
   * Guardam-se também as alheias como vêm, para o caso de a ponte de outro escritor usar a mesma
   * chave sem prefixo — aí também não se abre por cima.
   */
  const chavesAbertas = new Set(
    entrada.abertas
      .flatMap((a) => {
        const bruta = String(a.chave ?? '').trim()
        if (!bruta) return []
        return bruta.startsWith(PREFIXO_CHAVE) ? [bruta, bruta.slice(PREFIXO_CHAVE.length)] : [bruta]
      }),
  )
  /** Quantas abertas por símbolo+direcção. É a contagem que o limite de exposição consulta. */
  const porSimbolo = new Map<string, number>()
  for (const a of entrada.abertas) {
    const k = `${String(a.symbol).toUpperCase()}:${a.direcao}`
    porSimbolo.set(k, (porSimbolo.get(k) ?? 0) + 1)
  }

  let abertasAgora = entrada.abertas.length
  let abertosNestaPassagem = 0
  const vistosNestaLeitura = new Set<string>()

  const ordenados = [...entrada.sinais].sort(
    (a, b) => Date.parse(String(b.criadoEm)) - Date.parse(String(a.criadoEm)),
  )

  const decisoes: Decisao[] = []
  const recusar = (sinal: SinalDoTrader, motivo: MotivoRecusa): Decisao => ({
    sinal, abrir: false, motivo, porque: PORQUES[motivo],
  })

  for (const s of ordenados) {
    const symbol = String(s.symbol ?? '').trim().toUpperCase()
    if (!symbol || (s.direcao !== 'buy' && s.direcao !== 'sell')) {
      decisoes.push(recusar(s, 'dados_incompletos'))
      continue
    }

    /**
     * Sem stop loss não se abre. Uma posição sem SL numa conta de papel não parte nada, mas a
     * medição que sai dela não se parece com nada que se possa fazer a sério — e é a medição o
     * único produto desta conta.
     */
    if (s.sl == null || !Number.isFinite(Number(s.sl))) {
      decisoes.push(recusar(s, 'sem_sl'))
      continue
    }

    const t = Date.parse(String(s.criadoEm))
    // Data ilegível conta como velha: na dúvida não se abre.
    if (!Number.isFinite(t) || (agora.getTime() - t) / 60_000 > frescura) {
      decisoes.push(recusar(s, 'velho'))
      continue
    }

    const chave = String(s.chave ?? '').trim()
    if (chave && chavesAbertas.has(chave)) {
      decisoes.push(recusar(s, 'ja_aberto'))
      continue
    }
    if (chave && vistosNestaLeitura.has(chave)) {
      decisoes.push(recusar(s, 'repetido_no_lote'))
      continue
    }

    const k = `${symbol}:${s.direcao}`
    if ((porSimbolo.get(k) ?? 0) >= maxPorSimbolo) {
      decisoes.push(recusar(s, 'simbolo_cheio'))
      continue
    }
    if (abertasAgora >= maxAbertas) {
      decisoes.push(recusar(s, 'conta_cheia'))
      continue
    }
    if (abertosNestaPassagem >= tecto) {
      decisoes.push(recusar(s, 'tecto_da_passagem'))
      continue
    }

    if (chave) vistosNestaLeitura.add(chave)
    porSimbolo.set(k, (porSimbolo.get(k) ?? 0) + 1)
    abertasAgora++
    abertosNestaPassagem++
    decisoes.push({
      sinal: s,
      abrir: true,
      motivo: null,
      porque: `Abre: ${symbol} ${s.direcao} de ${s.estrategia}, com SL em ${s.sl}.`,
    })
  }

  return decisoes
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A partir daqui há base de dados. Tudo o que decide ficou acima, puro e provado.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

export interface ResultadoTrader {
  ok: boolean
  /** `false` só quando o interruptor está armado E a conta passou o portão. */
  armado: boolean
  /** O que o portão de segurança disse. Aparece sempre, mesmo quando corre bem. */
  seguranca: string
  decisoes: Array<{ chave: string; symbol: string; direcao: string; abrir: boolean; porque: string }>
  abertas: Array<{ chave: string; estado: string; motivo?: string }>
  erros: string[]
}

const CHAVE_INTERRUPTOR = 'agente_trader'

/**
 * CORRER O TRADER.
 *
 * Lê os sinais recentes das mestres, as posições abertas, decide, e — só se estiver armado e a
 * conta passar o portão — manda abrir pelo caminho que já existe.
 */
export async function correrTrader(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date } = {},
): Promise<ResultadoTrader> {
  const agora = opcoes.agora ?? new Date()
  const erros: string[] = []

  // ── O portão, antes de tudo ──────────────────────────────────────────────────────────────
  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, motor, metaapi_account_id, estado, sim_saldo, pausada_em')
    .eq('mt5_login', CONTA_PAPEL_LOGIN)
    .maybeSingle()
  if (erroConta) {
    return { ok: false, armado: false, seguranca: `Não foi possível ler a conta: ${erroConta.message ?? 'erro'}`, decisoes: [], abertas: [], erros: [erroConta.message ?? 'erro'] }
  }

  const portao = contaSegura(conta as ContaDoTrader | null)
  if (!portao.seguro) {
    // Não é um erro de programa: é a regra a funcionar. Devolve-se `ok: true` com o motivo bem
    // visível, para o painel o mostrar em vez de o esconder atrás de um 500.
    return { ok: true, armado: false, seguranca: portao.porque, decisoes: [], abertas: [], erros: [] }
  }
  const contaId = String((conta as ContaDoTrader).id)

  // ── O interruptor ────────────────────────────────────────────────────────────────────────
  const { data: interruptor } = await db
    .from('site_settings').select('value').eq('key', CHAVE_INTERRUPTOR).maybeSingle()
  const bruto =
    typeof (interruptor as Record<string, unknown> | null)?.value === 'string'
      ? JSON.parse(String((interruptor as Record<string, unknown>).value))
      : (interruptor as Record<string, unknown> | null)?.value
  // Só o booleano `true` arma. Ler qualquer coisa "verdadeira" abria isto com um `"sim"` distraído.
  const armado = (bruto as { armado?: unknown } | null)?.armado === true
  const ensaio = opcoes.ensaio === true || !armado

  // ── Os factos ────────────────────────────────────────────────────────────────────────────
  const desde = new Date(agora.getTime() - FRESCURA_MINUTOS * 60_000 * 2).toISOString()
  const [sinaisQ, pontesQ] = await Promise.all([
    db.from('mestres_sinais')
      .select('estrategia, chave, modo, symbol, direcao, entrada, sl, tps, criado_em')
      .gte('criado_em', desde).order('criado_em', { ascending: false }).limit(200),
    db.from('funded_sinal_posicoes')
      .select('chave, symbol, direcao, estado')
      .eq('account_id', contaId).in('estado', ['a_abrir', 'aberta']).limit(500),
  ])
  if (sinaisQ.error) erros.push(`mestres_sinais: ${sinaisQ.error.message ?? 'erro'}`)
  if (pontesQ.error) erros.push(`funded_sinal_posicoes: ${pontesQ.error.message ?? 'erro'}`)
  if (erros.length) {
    // Sem saber o que já está aberto, decidir era abrir em cima do que já existe.
    return { ok: false, armado, seguranca: portao.porque, decisoes: [], abertas: [], erros }
  }

  const sinais: SinalDoTrader[] = ((sinaisQ.data ?? []) as Record<string, unknown>[])
    // `sombra` é a mestre a decidir sem publicar. Seguir sombra era negociar o que a casa decidiu
    // ainda não assumir.
    .filter((r) => String(r.modo ?? '') !== 'sombra')
    .map((r) => ({
      chave: `${String(r.estrategia ?? '')}:${String(r.chave ?? '')}`,
      estrategia: String(r.estrategia ?? ''),
      symbol: String(r.symbol ?? ''),
      direcao: String(r.direcao ?? '') as 'buy' | 'sell',
      entrada: r.entrada == null ? null : Number(r.entrada),
      sl: r.sl == null ? null : Number(r.sl),
      tps: Array.isArray(r.tps) ? (r.tps as unknown[]).map(Number).filter(Number.isFinite) : [],
      criadoEm: String(r.criado_em ?? ''),
    }))

  const abertas: AbertaDoTrader[] = ((pontesQ.data ?? []) as Record<string, unknown>[]).map((r) => ({
    symbol: String(r.symbol ?? ''),
    direcao: String(r.direcao ?? '') as 'buy' | 'sell',
    chave: (r.chave as string | null) ?? null,
  }))

  const decisoes = decidirOperacoes({ sinais, abertas, agora })

  // ── A execução, pelo caminho que já existe ───────────────────────────────────────────────
  const feitas: ResultadoTrader['abertas'] = []
  const aAbrir = decisoes.filter((d) => d.abrir)

  if (!ensaio && aAbrir.length) {
    const [{ abrirSinalNaConta }, { CONFIG_PADRAO }] = await Promise.all([
      import('@/lib/mtmfunded/estrategias-sinais/abrir'),
      import('@/lib/mtmfunded/estrategias-sinais/calculo'),
    ])
    for (const d of aAbrir) {
      try {
        const r = await abrirSinalNaConta({
          accountId: contaId,
          estrategia: d.sinal.estrategia,
          // A chave do agente é PRÓPRIA, com prefixo: assim a ponte dele nunca colide com a que
          // `todos-os-sinais.ts` cria para o mesmo sinal na mesma conta.
          chave: chaveDoAgente(d.sinal.chave),
          impressao: null,
          fonte: 'agente-trader',
          comentario: 'Agente Trader',
          symbol: d.sinal.symbol,
          direcao: d.sinal.direcao,
          entrada: d.sinal.entrada ?? null,
          sl: d.sinal.sl ?? null,
          tps: d.sinal.tps ?? [],
          cfg: CONFIG_PADRAO,
        })
        feitas.push({ chave: d.sinal.chave, estado: r.estado, motivo: r.motivo })
        if (!r.ok && r.estado === 'erro') erros.push(`${d.sinal.chave}: ${r.motivo ?? 'erro'}`)
      } catch (e) {
        const m = e instanceof Error ? e.message.slice(0, 200) : 'erro'
        feitas.push({ chave: d.sinal.chave, estado: 'erro', motivo: m })
        erros.push(`${d.sinal.chave}: ${m}`)
      }
    }
  }

  return {
    ok: erros.length === 0,
    armado: armado && !opcoes.ensaio,
    seguranca:
      portao.porque +
      (armado
        ? ''
        : ` Desarmado: decide e relata sem abrir. Para armar: site_settings.${CHAVE_INTERRUPTOR} = {"armado": true}.`),
    decisoes: decisoes.map((d) => ({
      chave: d.sinal.chave, symbol: d.sinal.symbol, direcao: d.sinal.direcao, abrir: d.abrir, porque: d.porque,
    })),
    abertas: feitas,
    erros,
  }
}


/**
 * REGISTAR NO LIVRO DO AGENTE — é isto que faz dele um agente que trabalha, e não um que espera.
 *
 * Sem este registo, uma passagem em que ele analisou dez sinais e decidiu não abrir nenhum é
 * indistinguível de uma passagem em que ele não correu. E as duas pedem coisas opostas ao dono: na
 * primeira o agente está a trabalhar e a ser prudente; na segunda está morto e ninguém sabe.
 *
 * Grava-se SEMPRE, inclusive quando não há sinais e quando o portão de segurança disse não. O
 * «porquê não» é a parte mais valiosa: é o que permite, daqui a um mês, responder à pergunta «ele
 * tem decidido bem?» com decisões em vez de com uma conta de posições que ele nunca abriu.
 *
 * Em `ensaio` não escreve nada — e devolve a frase, para quem corre o ensaio ver o que ficaria.
 */
export async function registarDecisoesNoLivro(
  db: Db,
  resultado: ResultadoTrader,
  opcoes: { ensaio?: boolean; chaveDoAgente?: string } = {},
): Promise<{ gravado: boolean; detalhe: string; erro?: string }> {
  const chave = opcoes.chaveDoAgente ?? CHAVE_RECEITA_DO_TRADER

  const abrir = resultado.decisoes.filter((d) => d.abrir)
  const nao = resultado.decisoes.filter((d) => !d.abrir)

  const linhas: string[] = [
    `Passagem na conta de papel ${CONTA_PAPEL_LOGIN}: ${resultado.decisoes.length} sinal(is) analisado(s), ` +
      `${abrir.length} a abrir, ${nao.length} recusado(s). ${resultado.armado ? 'ARMADO' : 'desarmado (decide e relata)'}.`,
    `Portão: ${resultado.seguranca}`,
  ]
  // O detalhe de cada decisão, com tecto: um detalhe de 50 KB não se lê, e o que interessa são as
  // primeiras. O número total fica na primeira linha, por isso nada se perde de medível.
  for (const d of resultado.decisoes.slice(0, 12)) {
    linhas.push(`${d.abrir ? '→' : '×'} ${d.symbol} ${d.direcao} (${d.chave}): ${d.porque}`)
  }
  if (resultado.decisoes.length > 12) linhas.push(`… e mais ${resultado.decisoes.length - 12}.`)
  if (resultado.decisoes.length === 0) {
    linhas.push(
      'Nenhum sinal fresco das mestres nesta janela. Isto é trabalho feito, não ausência de trabalho: ' +
        'o agente olhou e não havia nada que cumprisse a frescura.',
    )
  }
  const detalhe = linhas.join('\n')

  if (opcoes.ensaio) return { gravado: false, detalhe }

  const { data, error: erroAgente } = await db
    .from('agentes_equipa')
    .select('id')
    .eq('chave_receita', chave)
    .maybeSingle()
  if (erroAgente || !data) {
    // Não se cria o agente nem se escolhe outro: um registo no livro do agente errado é pior do que
    // nenhum registo, porque passa a contar trabalho de um para outro.
    return {
      gravado: false,
      detalhe,
      erro: `não há agente com chave_receita='${chave}' — o registo não se faz no livro de outro`,
    }
  }

  const { error } = await db.from('agentes_eventos').insert({
    agente_id: String((data as { id: string }).id),
    tipo: 'trabalho',
    detalhe,
  })
  if (error) return { gravado: false, detalhe, erro: error.message ?? 'erro' }
  return { gravado: true, detalhe }
}
