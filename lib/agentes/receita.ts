/**
 * A RECEITA DOS AGENTES — quanto é que cada um trouxe, e o que NÃO se consegue atribuir.
 *
 * ═══ A REGRA QUE MANDA EM TODO ESTE FICHEIRO ═══════════════════════════════════════════════
 *
 * **Receita que não é atribuível não se inventa nem se divide.** Fica por atribuir, com o motivo
 * escrito, e aparece assim no painel.
 *
 * Isto parece uma renúncia e é o contrário. A alternativa — repartir o que não se sabe por regra
 * de três, ou dar ao agente mais parecido — produz números que ninguém pode contestar porque
 * ninguém sabe de onde vêm. E depois a regra de vida MATA agentes com base neles. Um agente medido
 * a adivinhar é pior do que um agente não medido: o não medido vê-se no painel como não medido; o
 * adivinhado morre com um motivo que parece sólido.
 *
 * ═══ ONDE A CASA LIGA (E NÃO LIGA) UM PAGAMENTO A UM CÓDIGO ════════════════════════════════
 *
 * Isto foi levantado no repo antes de se escrever uma linha, e é o que limita a medição:
 *
 *  · `vendas_vendas` é o LIVRO canónico das vendas (único por `fonte`+`referencia`, com estornos).
 *    **Não tem coluna de cupão.** É a melhor fonte de valor e a pior de atribuição;
 *  · `marketplace_compras` tem `cupao_codigo` por COMPRA — é a única ligação forte que existe hoje;
 *  · `profiles.coupon_code` tem o último código de cada pessoa. É por PESSOA e é SOBRESCRITO: quem
 *    usar dois códigos ao longo do tempo perde o primeiro. Usa-se, e **diz-se que é fraco**;
 *  · `coupon_usages` liga cupão↔pessoa mas não ao pagamento, e o webhook do Stripe nem escreve lá.
 *
 * Daí a forma deste módulo: ele não vai buscar nada. Recebe FACTOS já lidos, com a origem de cada
 * ligação declarada, e decide. Assim a parte que erra em silêncio é pura e provada, e a parte que
 * lê a base é burra.
 *
 * ═══ A MOEDA, QUE É UM PROBLEMA REAL E NÃO SE RESOLVE AQUI ═════════════════════════════════
 *
 * `vida.ts` fala em dólares; o livro de vendas está em EUR. Converter exige uma taxa, e uma taxa
 * inventada é um número inventado — o limite nº 4. Por isso:
 *
 *  · a unidade destes agentes é o EURO, e o «$» nos comentários de `vida.ts` é nominal;
 *  · uma venda em qualquer outra moeda vai para «por atribuir» com esse motivo, em vez de ser
 *    convertida por um valor que ninguém declarou.
 *
 * Se um dia houver vendas noutra moeda com peso, a decisão da taxa é do Ricardo e entra aqui como
 * dado, não como palpite.
 */

/** Como é que o código desta venda foi encontrado. Vai para o painel: nem todas valem o mesmo. */
export type ForcaDaLigacao =
  /** O código está na própria linha da compra. É exacto. */
  | 'na_compra'
  /** O código veio do perfil de quem comprou — por pessoa, e sobrescrito pelo último que usou. */
  | 'no_perfil'

/** Uma venda do livro, reduzida ao que decide a atribuição. */
export interface VendaParaAtribuir {
  /** `fonte:referencia` do livro. Serve para o painel poder apontar à venda concreta. */
  id: string
  /** Bruto em cêntimos, como está em `vendas_vendas.valor_cents`. */
  valorCents: number
  /** `vendas_vendas.moeda`. Qualquer coisa que não seja EUR não é convertida. */
  moeda: string
  /** Cêntimos devolvidos, se houve estorno ou chargeback. */
  estornoCents?: number | null
  /** Quando a venda foi integralmente anulada. */
  estornada?: boolean
  /** O código encontrado, se algum. */
  codigo?: string | null
  /** De onde veio o código. Obrigatório quando há código, para o painel não mentir sobre a força. */
  ligacao?: ForcaDaLigacao | null
  pagoEm?: string | null
}

/** Um agente que pode receber receita. */
export interface AgenteParaReceita {
  id: string
  nome: string
  chaveReceita?: string | null
}

export type MotivoPorAtribuir =
  | 'sem_codigo'
  | 'codigo_desconhecido'
  | 'codigo_de_varios_agentes'
  | 'moeda_diferente'
  | 'valor_ilegivel'
  | 'estornada'

/** O que ficou por atribuir, por motivo. É isto que o painel mostra — não se esconde. */
export interface PorAtribuir {
  motivo: MotivoPorAtribuir
  cents: number
  vendas: number
  /** Em português, para aparecer no ecrã sem ninguém ter de traduzir o código acima. */
  porque: string
}

export interface AtribuicaoAgente {
  agenteId: string
  nome: string
  chaveReceita: string
  cents: number
  vendas: number
  /** Quanto é que veio por ligação forte. Uma receita toda vinda do perfil é uma receita frágil. */
  centsFortes: number
  centsFracos: number
}

export interface Atribuicao {
  porAgente: AtribuicaoAgente[]
  porAtribuir: PorAtribuir[]
  /** Somas, em cêntimos. `atribuido + naoAtribuido` fecha sempre com `liquido`. */
  liquidoCents: number
  atribuidoCents: number
  naoAtribuidoCents: number
  moeda: 'EUR'
}

const PORQUES: Record<MotivoPorAtribuir, string> = {
  sem_codigo: 'Vendas sem nenhum código associado. Não há como saber quem as trouxe.',
  codigo_desconhecido: 'O código da venda não pertence a nenhum agente — pode ser antigo, ou de uma campanha.',
  codigo_de_varios_agentes:
    'O mesmo código está em mais de um agente. Não se reparte: corrige-se a chave_receita duplicada.',
  moeda_diferente: 'Venda noutra moeda. Converter exigiria uma taxa de câmbio que ninguém declarou.',
  valor_ilegivel: 'O valor da venda não se consegue ler como número.',
  estornada: 'Venda devolvida ao cliente. Não é receita de ninguém.',
}

/** Normaliza um código: maiúsculas e sem espaços nas pontas. `AG-site` e `ag-site ` são o mesmo. */
export function normalizarCodigo(c: unknown): string {
  return String(c ?? '').trim().toUpperCase()
}

/**
 * ATRIBUIR — pura, e é aqui que a honestidade da medição se decide.
 *
 * A ordem das recusas importa, porque uma venda só cai num balde:
 *
 *  1. estornada — o dinheiro voltou para trás, não é receita de ninguém;
 *  2. valor ilegível — não se soma o que não se lê;
 *  3. moeda diferente — ver o cabeçalho;
 *  4. sem código — o caso mais comum, e o mais honesto de mostrar;
 *  5. código que ninguém reclama;
 *  6. código que DOIS agentes reclamam. Este é o caso mau que dá mais vontade de resolver com uma
 *     divisão a meias, e é precisamente o que não se faz: a divisão transformava um erro de
 *     configuração (duas chaves iguais) em dois números credíveis, e ninguém voltava a olhar.
 */
export function atribuirReceita(
  vendas: VendaParaAtribuir[],
  agentes: AgenteParaReceita[],
): Atribuicao {
  /** Quantos agentes reclamam cada código. Um código reclamado por dois não se atribui a nenhum. */
  const donosPorCodigo = new Map<string, AgenteParaReceita[]>()
  for (const a of agentes) {
    const chave = normalizarCodigo(a.chaveReceita)
    if (!chave) continue // Um agente sem chave não é medível. Não se lhe dá receita por simpatia.
    const lista = donosPorCodigo.get(chave) ?? []
    lista.push(a)
    donosPorCodigo.set(chave, lista)
  }

  const acumulado = new Map<string, AtribuicaoAgente>()
  const naoAtribuido = new Map<MotivoPorAtribuir, { cents: number; vendas: number }>()

  const recusar = (motivo: MotivoPorAtribuir, cents: number) => {
    const a = naoAtribuido.get(motivo) ?? { cents: 0, vendas: 0 }
    a.cents += cents
    a.vendas += 1
    naoAtribuido.set(motivo, a)
  }

  let liquidoCents = 0

  for (const v of vendas) {
    const bruto = Number(v.valorCents)
    if (!Number.isFinite(bruto)) {
      recusar('valor_ilegivel', 0)
      continue
    }

    const estorno = Number(v.estornoCents ?? 0)
    /**
     * O líquido nunca é negativo. Um estorno maior do que a venda é um erro de dados, e deixá-lo
     * passar dava a um agente receita NEGATIVA — ou seja, matava-o por uma venda devolvida a mais.
     */
    const liquido = Math.max(0, Math.round(bruto - (Number.isFinite(estorno) ? estorno : 0)))

    if (v.estornada || liquido === 0) {
      // Conta como estornada e NÃO entra no líquido: devolver dinheiro não é receita por atribuir,
      // é receita que deixou de existir.
      recusar('estornada', 0)
      continue
    }

    const moeda = String(v.moeda ?? '').trim().toUpperCase()
    if (moeda && moeda !== 'EUR') {
      // Entra no líquido porque o dinheiro existe — mas não se converte nem se atribui.
      liquidoCents += liquido
      recusar('moeda_diferente', liquido)
      continue
    }

    liquidoCents += liquido

    const codigo = normalizarCodigo(v.codigo)
    if (!codigo) {
      recusar('sem_codigo', liquido)
      continue
    }

    const donos = donosPorCodigo.get(codigo)
    if (!donos || donos.length === 0) {
      recusar('codigo_desconhecido', liquido)
      continue
    }
    if (donos.length > 1) {
      recusar('codigo_de_varios_agentes', liquido)
      continue
    }

    const dono = donos[0]
    const atual =
      acumulado.get(dono.id) ??
      { agenteId: dono.id, nome: dono.nome, chaveReceita: codigo, cents: 0, vendas: 0, centsFortes: 0, centsFracos: 0 }
    atual.cents += liquido
    atual.vendas += 1
    if (v.ligacao === 'na_compra') atual.centsFortes += liquido
    else atual.centsFracos += liquido
    acumulado.set(dono.id, atual)
  }

  const porAgente = [...acumulado.values()].sort((a, b) => b.cents - a.cents)
  const porAtribuir = [...naoAtribuido.entries()]
    .map(([motivo, v]) => ({ motivo, cents: v.cents, vendas: v.vendas, porque: PORQUES[motivo] }))
    .sort((a, b) => b.cents - a.cents)

  const atribuidoCents = porAgente.reduce((s, a) => s + a.cents, 0)

  return {
    porAgente,
    porAtribuir,
    liquidoCents,
    atribuidoCents,
    // Por subtracção, de propósito: assim `atribuido + naoAtribuido` fecha SEMPRE com o líquido,
    // mesmo que um motivo novo venha a ser acrescentado e esquecido na soma.
    naoAtribuidoCents: liquidoCents - atribuidoCents,
    moeda: 'EUR',
  }
}

/** Cêntimos para a unidade dos agentes (euros, com dois dígitos). */
export function centsParaUnidade(cents: number): number {
  return Number((Math.round(Number(cents) || 0) / 100).toFixed(2))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A partir daqui há base de dados. Tudo o que decide ficou acima, puro e provado.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

export interface ResultadoReceita {
  ok: boolean
  ensaio: boolean
  desde: string
  atribuicao: Atribuicao
  /** O que foi gravado em `agentes_equipa.receita` e no livro, por agente. */
  gravado: Array<{ nome: string; cents: number; novosCents: number }>
  erros: string[]
}

/**
 * LER AS VENDAS E ATRIBUIR.
 *
 * Duas leituras, porque as duas fontes de código são diferentes e têm forças diferentes:
 *
 *  · `marketplace_compras` traz o código NA COMPRA — ligação exacta;
 *  · `vendas_vendas` não traz código nenhum, por isso o código vem do perfil do comprador. É fraco
 *    e o painel diz que é fraco.
 *
 * `desdeISO` existe para o cron poder pedir só a janela. Sem ele lê tudo, que é o que serve para
 * reconstruir o acumulado.
 */
export async function lerVendasParaAtribuir(
  db: Db,
  desdeISO?: string,
): Promise<{ vendas: VendaParaAtribuir[]; erros: string[] }> {
  const erros: string[] = []
  const vendas: VendaParaAtribuir[] = []

  // ── 1. Marketplace: o código está na compra ────────────────────────────────────────────────
  {
    let q = db
      .from('marketplace_compras')
      .select('id, fonte, referencia, bruto_cents, moeda, estado, cupao_codigo, agente_codigo, pago_em')
      .eq('estado', 'paga')
    if (desdeISO) q = q.gte('pago_em', desdeISO)
    const { data, error } = await q.limit(5000)
    if (error) erros.push(`marketplace_compras: ${error.message ?? 'erro'}`)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      /**
       * `agente_codigo` PRIMEIRO, e o cupão só como recurso.
       *
       * A coluna própria nasceu a 01/10 (migração 173) porque o campo do cupão não podia ser
       * partilhado: o checkout só aceita um cupão, e um código de agente a ocupá-lo tirava o
       * desconto a quem tinha um a sério. O cupão fica como leitura de trás: as compras
       * anteriores à coluna só têm essa, e deitá-las fora era perder medição que já existe.
       */
      const codigo = (r.agente_codigo as string | null) ?? (r.cupao_codigo as string | null) ?? null
      vendas.push({
        id: `marketplace:${String(r.referencia ?? r.id)}`,
        valorCents: Number(r.bruto_cents),
        moeda: String(r.moeda ?? 'EUR'),
        codigo,
        ligacao: codigo ? 'na_compra' : null,
        pagoEm: (r.pago_em as string | null) ?? null,
      })
    }
  }

  // ── 2. O livro de vendas: código só pelo perfil do comprador ───────────────────────────────
  {
    let q = db
      .from('vendas_vendas')
      .select('id, fonte, referencia, comprador_id, pack, valor_cents, moeda, pago_em, estornada_em, estorno_cents')
    if (desdeISO) q = q.gte('pago_em', desdeISO)
    const { data, error } = await q.limit(5000)
    if (error) {
      erros.push(`vendas_vendas: ${error.message ?? 'erro'}`)
      return { vendas, erros }
    }

    const linhas = (data ?? []) as Record<string, unknown>[]
    const compradores = [...new Set(linhas.map((r) => r.comprador_id).filter(Boolean).map(String))]

    /**
     * Os códigos dos compradores, em bloco.
     *
     * Uma leitura por venda seria centenas de idas à base, e um `in` com milhares de ids rebenta no
     * tamanho do pedido — por isso vai em pedaços de 300.
     */
    const codigoDe = new Map<string, string>()
    for (let i = 0; i < compradores.length; i += 300) {
      const pedaco = compradores.slice(i, i + 300)
      const { data: perfis, error: erroPerfis } = await db
        .from('profiles')
        .select('id, coupon_code')
        .in('id', pedaco)
      if (erroPerfis) {
        erros.push(`profiles: ${erroPerfis.message ?? 'erro'}`)
        continue
      }
      for (const p of (perfis ?? []) as Record<string, unknown>[]) {
        const c = normalizarCodigo(p.coupon_code)
        if (c) codigoDe.set(String(p.id), c)
      }
    }

    for (const r of linhas) {
      const comprador = r.comprador_id ? String(r.comprador_id) : null
      const codigo = comprador ? (codigoDe.get(comprador) ?? null) : null
      vendas.push({
        id: `${String(r.fonte ?? 'stripe')}:${String(r.referencia ?? r.id)}`,
        valorCents: Number(r.valor_cents),
        moeda: String(r.moeda ?? 'EUR'),
        estornoCents: r.estorno_cents == null ? 0 : Number(r.estorno_cents),
        estornada: r.estornada_em != null,
        codigo,
        ligacao: codigo ? 'no_perfil' : null,
        pagoEm: (r.pago_em as string | null) ?? null,
      })
    }
  }

  return { vendas, erros }
}

/**
 * ATRIBUIR E GRAVAR.
 *
 * O que se grava:
 *  · `agentes_equipa.receita` — o acumulado, substituído pelo total atribuído (não incrementado:
 *    somar a cada passagem dava receita a dobrar na segunda vez que o cron corresse);
 *  · um evento `receita` por agente com a DIFERENÇA desde a última gravação, porque é da diferença
 *    que a janela das 48 h é somada. Gravar o acumulado como evento enchia a janela com dinheiro
 *    antigo e nenhum agente voltava a parar.
 *
 * `ensaio: true` mostra tudo sem escrever nada.
 */
export async function atribuirEGravar(
  db: Db,
  opcoes: { ensaio?: boolean; desdeISO?: string } = {},
): Promise<ResultadoReceita> {
  const ensaio = opcoes.ensaio === true
  const desde = opcoes.desdeISO ?? '1970-01-01T00:00:00.000Z'

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select('id, nome, chave_receita, receita, estado')
  if (error) {
    return {
      ok: false, ensaio, desde,
      atribuicao: { porAgente: [], porAtribuir: [], liquidoCents: 0, atribuidoCents: 0, naoAtribuidoCents: 0, moeda: 'EUR' },
      gravado: [], erros: [`agentes_equipa: ${error.message ?? 'erro'}`],
    }
  }

  const agentes: AgenteParaReceita[] = ((linhas ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nome: String(r.nome ?? ''),
    chaveReceita: (r.chave_receita as string | null) ?? null,
  }))
  const receitaAtual = new Map(
    ((linhas ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), Number(r.receita ?? 0) || 0]),
  )

  const { vendas, erros } = await lerVendasParaAtribuir(db, opcoes.desdeISO)
  const atribuicao = atribuirReceita(vendas, agentes)

  const gravado: ResultadoReceita['gravado'] = []
  for (const a of atribuicao.porAgente) {
    const total = centsParaUnidade(a.cents)
    const antes = receitaAtual.get(a.agenteId) ?? 0
    const diferenca = Number((total - antes).toFixed(2))
    gravado.push({ nome: a.nome, cents: a.cents, novosCents: Math.round(diferenca * 100) })

    if (ensaio) continue

    const { error: erroUpdate } = await db
      .from('agentes_equipa')
      .update({ receita: total, atualizado_em: new Date().toISOString() })
      .eq('id', a.agenteId)
    if (erroUpdate) {
      erros.push(`${a.nome}: receita não gravada (${erroUpdate.message ?? 'erro'})`)
      continue
    }

    // Só se grava evento quando ENTROU dinheiro novo. Um evento de 0 $ (ou negativo, de um
    // estorno) na janela não é receita e só serviria para enganar a soma das 48 h.
    if (diferenca > 0) {
      const { error: erroEvento } = await db.from('agentes_eventos').insert({
        agente_id: a.agenteId,
        tipo: 'receita',
        valor: diferenca,
        detalhe:
          `${a.vendas} venda(s) pelo código ${a.chaveReceita}. ` +
          `Ligação exacta: ${centsParaUnidade(a.centsFortes).toFixed(2)} €; ` +
          `pelo perfil do comprador (fraca): ${centsParaUnidade(a.centsFracos).toFixed(2)} €.`,
      })
      if (erroEvento) erros.push(`${a.nome}: evento de receita não gravado (${erroEvento.message ?? 'erro'})`)
    }
  }

  return { ok: erros.length === 0, ensaio, desde, atribuicao, gravado, erros }
}
