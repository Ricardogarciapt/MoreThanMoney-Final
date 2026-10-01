/**
 * O LIVRO: transformar um pagamento confirmado em comissões da equipa, e revertê-las quando o
 * dinheiro volta para trás.
 *
 * A fronteira que este ficheiro defende é uma só: **uma comissão só nasce de um pagamento
 * confirmado**. Quem chama `registarVendaConfirmada` é o webhook do Stripe (ou a Apple, ou um
 * lançamento manual que um humano assume com nota) — nunca um clique no pipeline. O estado 'ganho'
 * de um negócio é uma opinião do closer; um `invoice.payment_succeeded` é dinheiro.
 *
 * A segunda fronteira: **nada aqui paga**. O que se cria fica 'pendente'. Aprovar e pagar são
 * actos humanos no admin, com rasto em `vendas_comissoes_historico`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calcularComissoes,
  PAPEIS_VENDAS,
  type Atribuicao,
  type PapelVendas,
  type ResultadoCalculo,
} from './calculo'
import { resolverNegocioDoComprador } from './atribuicao-leitura'
// A forma de um código de agente decide-se num sítio só, e é um módulo puro com guarda. Repetir o
// `regex` aqui era criar a segunda versão da mesma regra, que é como elas divergem.
import { normalizar as normalizarCodigoDeAgente } from '@/lib/agentes/atribuicao'
import { carregarRegras, carregarRegrasRank, planosDasPessoas } from './regras'

export type FonteVenda = 'stripe' | 'apple' | 'manual'

/**
 * A JANELA DA DESCONFIANÇA: uma devolução dentro deste prazo, contado do PRIMEIRO pagamento do
 * cliente, reverte TODAS as comissões dele — incluindo a do 1.º pagamento.
 *
 * Porquê 30 dias e porquê no código: é uma regra de negócio do dono, não uma percentagem (essas
 * vivem na base). A permanência média medida (10,8 meses) sai de subscrições quase todas manuais,
 * onde a data de expiração reflecte o que foi CONCEDIDO e não o que foi PAGO; com 72 % dos perfis
 * inactivos, a permanência real paga é provavelmente muito menor. Quem pede o dinheiro de volta no
 * primeiro mês nunca chegou a ser cliente, e ninguém deve ficar pago por o ter trazido.
 */
const JANELA_ESTORNO_TOTAL_DIAS = 30

/**
 * A devolução cai na janela da desconfiança? Função à parte para poder ser provada sozinha — é ela
 * que decide se uma devolução arrasta as comissões dos pagamentos anteriores do mesmo cliente.
 *
 * Conta-se do PRIMEIRO pagamento do cliente, não do pagamento devolvido: o que se quer saber é se
 * esta pessoa chegou a ser cliente, e não quanto tempo passou desde a última factura.
 */
export function arrastaEstornoTotal(primeiroPagamentoIso: string, agoraIso: string): boolean {
  const inicio = new Date(primeiroPagamentoIso).getTime()
  const fim = new Date(agoraIso).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return false
  return (fim - inicio) / 86_400_000 <= JANELA_ESTORNO_TOTAL_DIAS
}

export type VendaConfirmada = {
  fonte: FonteVenda
  /** A chave de idempotência: session id, invoice id, transaction id da Apple, ou uma referência manual. */
  referencia: string
  compradorId?: string | null
  /** O pack PAGO (planId). Sem ele não há regra que se possa aplicar — e diz-se, não se adivinha. */
  pack?: string | null
  valorCents: number
  moeda?: string
  tipo?: 'primeira' | 'renovacao'
  /** Quando o dinheiro entrou. Importa: é esta data que escolhe a regra em vigor. */
  pagoEm?: string
  /** Negócio explícito. Se não vier, procura-se o do comprador. */
  negocioId?: string | null
  /**
   * O email com que se pagou, quando é conhecido.
   *
   * Existe porque o email do checkout e o email da conta do site não são sempre o mesmo, e porque
   * num registo-e-pagamento no mesmo checkout o perfil ainda pode não existir quando isto corre. É
   * por este email que o negócio de um lead trabalhado antes do registo é encontrado.
   */
  emailComprador?: string | null
  nota?: string | null
  /**
   * O CÓDIGO DO AGENTE QUE TROUXE ESTA VENDA — medição, e só medição.
   *
   * ── PORQUE É QUE ISTO VIVE NO LIVRO ─────────────────────────────────────────────────────
   *
   * Porque é aqui que está o dinheiro. A 01/10 a equipa de agentes mediu 35 € reais e atribuiu
   * ZERO: a única ligação forte que existia era `marketplace_compras.agente_codigo`, e essa tabela
   * estava vazia. O livro tinha a receita toda e nenhuma coluna de código — o que sobrava era
   * adivinhar pelo `profiles.coupon_code` do comprador, que é por pessoa e sobrescrito. Resultado:
   * toda a receita caía em «sem_codigo» e a régua das 48 h (`lib/agentes/vida.ts`) preparava-se
   * para parar a equipa por falta de medição. Ver `docs/maquina-de-vendas-autonoma.md` §2.8.
   *
   * ── NÃO TEM NADA A VER COM COMISSÕES ────────────────────────────────────────────────────
   *
   * Não entra no cálculo, não cria papel nenhum e não paga a ninguém: o cálculo continua a sair só
   * do negócio e dos cinco papéis. Isto é contabilidade interna dos AGENTES, que não são pessoas e
   * não recebem dinheiro — recebem o direito de continuar a existir. Confundir as duas coisas era
   * pagar uma comissão a um processo.
   *
   * ── UM CÓDIGO INVÁLIDO NÃO TRAVA A VENDA ────────────────────────────────────────────────
   *
   * Normaliza-se e, se não tiver a forma de um código de agente, grava-se NULO. A venda vale mais
   * do que a medição dela, e ninguém perde o acesso que pagou por causa de um link mal copiado. A
   * venda fica «sem código», que é exactamente o que ela é. (A forma é verificada em dois sítios de
   * propósito: aqui e no CHECK da coluna — ver a migração 170.)
   */
  agenteCodigo?: string | null
  /**
   * O MÁXIMO que a soma das comissões desta venda pode atingir, em cêntimos.
   *
   * ── PORQUE É QUE ISTO EXISTE, E PORQUE É OPCIONAL ───────────────────────────────────────
   *
   * Não há, em lado nenhum desta casa, uma verificação de que a soma das comissões de uma venda
   * cabe no valor dela. O que impede o duplo pagamento hoje é estrutural — a exclusividade entre
   * equipa e binário, e o degrau de rank ser um FACTOR e não uma substituição — e não uma conta.
   * Nada impede o dono de definir 40% para três papéis do mesmo pack.
   *
   * Numa venda de pack isso é um problema teórico: a casa fica com tudo o que não paga em comissão.
   * Numa venda do MARKETPLACE não é: 90% já estão prometidos ao educador por acordo, antes de a
   * comissão ser sequer calculada, e a casa só tem 10% de onde a pagar. Sem tecto, uma regra de 15%
   * fazia a casa dever 105% de uma venda — e isso só se descobre no dia do pagamento.
   *
   * É OPCIONAL de propósito. Sem ele, o comportamento é exactamente o de sempre: nada é limitado, e
   * nenhum dos caminhos que já existem muda. Só quem SABE que há outra parte a ser paga da mesma
   * venda — hoje, apenas o marketplace — é que o passa.
   *
   * Quando o tecto corta, as linhas são reduzidas PROPORCIONALMENTE e não pela ordem em que
   * aparecem: cortar a última a zero pagaria a uns e não a outros por causa de uma ordenação, e
   * isso não se explica a ninguém. O corte fica registado em `avisos`.
   */
  tectoComissaoCents?: number | null
}

export type RegistoDeVenda = {
  vendaId: string
  /** true quando esta referência já tinha sido registada (reenvio de webhook) e nada foi refeito. */
  repetida: boolean
  negocioId: string | null
  criadas: number
  totalCents: number
  resultado: ResultadoCalculo | null
  /** O que impediu o cálculo, em palavras — para o admin ver em vez de adivinhar. */
  aviso?: string
}

const COLUNA_DO_PAPEL: Record<PapelVendas, string> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

/**
 * O negócio a que esta venda pertence.
 *
 * A procura é de `lib/vendas/atribuicao-leitura.ts`, e é lá que está escrito porquê: procurar só
 * por `comprador_id` — o que isto fazia até 26/09 — não encontrava nada, porque essa coluna estava
 * vazia em todos os negócios da base. Passa a valer também o id do perfil na chave de origem e o
 * email, e a ligação descoberta fica gravada.
 *
 * Sem negócio não há atribuição, e sem atribuição não há comissões de equipa — o que continua a
 * ser o comportamento certo: uma compra que entrou pelo site sem ninguém a trabalhar não deve
 * pagar a ninguém (e nesse caso é o MLM binário que paga, ver `lib/vendas/exclusividade.ts`).
 */
async function encontrarNegocio(
  supabase: SupabaseClient,
  venda: VendaConfirmada,
): Promise<{ negocio: Record<string, unknown> | null; motivo: string; ambiguo: boolean }> {
  const r = await resolverNegocioDoComprador(supabase, {
    compradorId: venda.compradorId ?? null,
    email: venda.emailComprador ?? null,
    negocioIdExplicito: venda.negocioId ?? null,
    colunasExtra: Object.values(COLUNA_DO_PAPEL),
  })
  return { negocio: r.negocio, motivo: r.motivo, ambiguo: r.ambiguo }
}

function atribuicaoDoNegocio(negocio: Record<string, unknown>): Atribuicao {
  const a: Atribuicao = {}
  for (const papel of PAPEIS_VENDAS) {
    const valor = negocio[COLUNA_DO_PAPEL[papel]]
    if (typeof valor === 'string' && valor) a[papel] = valor
  }
  return a
}

/**
 * Que número de pagamento é este, para este cliente.
 *
 * Conta as vendas confirmadas e NÃO estornadas dele até esta data, incluindo a que acabou de
 * entrar. 1 = primeiro pagamento, e é por isso que o residual não paga nesse. Devolve null quando
 * não há comprador identificado: não se sabe contar, e não se bloqueia por não saber.
 */
async function numeroDoPagamento(
  supabase: SupabaseClient,
  compradorId: string | null | undefined,
  pagoEm: string,
): Promise<number | null> {
  if (!compradorId) return null
  const { count, error } = await supabase
    .from('vendas_vendas')
    .select('id', { count: 'exact', head: true })
    .eq('comprador_id', compradorId)
    .is('estornada_em', null)
    .lte('pago_em', pagoEm)
  if (error || count === null) return null
  return count
}

/** O mês (em Lisboa) a que uma data pertence, como fronteiras ISO — para contar vendas do mês. */
function limitesDoMes(emIso: string): { inicio: string; fim: string } {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(emIso))
  const [ano, mes] = dia.split('-').map(Number)
  const inicio = new Date(Date.UTC(ano, mes - 1, 1))
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1))
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

/**
 * Quantas vendas esta pessoa fez NESTE PAPEL, no mês desta venda — é isto que decide o degrau.
 *
 * Inclui a venda actual (já está gravada quando isto corre): a 6.ª venda do mês é paga ao degrau
 * das 6, e não ao anterior. O número fica GRAVADO na comissão, para subir de degrau a meio do mês
 * não reescrever o que já foi calculado.
 */
async function vendasDoMesNoPapel(
  supabase: SupabaseClient,
  papel: PapelVendas,
  pessoaId: string,
  emIso: string,
): Promise<number> {
  const { inicio, fim } = limitesDoMes(emIso)
  const { data: negocios } = await supabase
    .from('vendas_negocios')
    .select('id')
    .eq(COLUNA_DO_PAPEL[papel], pessoaId)
  const ids = (negocios ?? []).map((n) => String(n.id))
  if (ids.length === 0) return 0

  const { count } = await supabase
    .from('vendas_vendas')
    .select('id', { count: 'exact', head: true })
    .in('negocio_id', ids)
    .is('estornada_em', null)
    .gte('pago_em', inicio)
    .lt('pago_em', fim)
  return count ?? 0
}

/**
 * Registar uma venda confirmada e criar as comissões que ela gera.
 *
 * IDEMPOTENTE pela (fonte, referencia): o Stripe reenvia eventos, e reenviar não pode pagar duas
 * vezes. Quando a referência já existe, devolve-se `repetida: true` e não se toca em nada — nem
 * para «corrigir» valores, porque um segundo evento com outro valor é um caso para um humano ver,
 * não para o código escolher sozinho.
 *
 * Nunca lança por falta de regras ou de atribuição: uma venda registada sem comissões é melhor do
 * que um webhook a falhar. O que falta sai em `resultado.semRegra` / `aviso` e vive no admin.
 */
export async function registarVendaConfirmada(
  supabase: SupabaseClient,
  venda: VendaConfirmada,
): Promise<RegistoDeVenda> {
  const referencia = String(venda.referencia || '').trim()
  if (!referencia) throw new Error('Uma venda sem referência não pode ser registada: não haveria como evitar duplicá-la.')

  const pagoEm = venda.pagoEm ?? new Date().toISOString()
  const moeda = (venda.moeda || 'EUR').toUpperCase()
  const tipo = venda.tipo ?? 'primeira'
  const valorCents = Math.max(0, Math.round(venda.valorCents))

  const { data: jaExiste } = await supabase
    .from('vendas_vendas')
    .select('id, negocio_id')
    .eq('fonte', venda.fonte)
    .eq('referencia', referencia)
    .maybeSingle()

  if (jaExiste) {
    return {
      vendaId: String(jaExiste.id),
      repetida: true,
      negocioId: (jaExiste.negocio_id as string) ?? null,
      criadas: 0,
      totalCents: 0,
      resultado: null,
    }
  }

  const { negocio, motivo: motivoDaProcura, ambiguo } = await encontrarNegocio(supabase, venda)

  const { data: criada, error: erroVenda } = await supabase
    .from('vendas_vendas')
    .insert({
      fonte: venda.fonte,
      referencia,
      comprador_id: venda.compradorId ?? null,
      negocio_id: negocio ? String(negocio.id) : null,
      pack: venda.pack ?? null,
      valor_cents: valorCents,
      moeda,
      tipo,
      pago_em: pagoEm,
      nota: venda.nota ?? null,
      // `normalizarCodigoDeAgente` devolve `null` para tudo o que não tenha a forma de um código de
      // agente — incluindo um cupão de desconto que tenha vindo pelo caminho errado. Ver o campo
      // `agenteCodigo` em `VendaConfirmada`.
      agente_codigo: normalizarCodigoDeAgente(venda.agenteCodigo),
    })
    .select('id')
    .single()

  if (erroVenda) {
    // Corrida entre dois eventos do mesmo pagamento: o índice único fez o seu trabalho. Não é
    // erro — é a garantia a funcionar.
    const { data: outra } = await supabase
      .from('vendas_vendas')
      .select('id, negocio_id')
      .eq('fonte', venda.fonte)
      .eq('referencia', referencia)
      .maybeSingle()
    if (outra) {
      return {
        vendaId: String(outra.id),
        repetida: true,
        negocioId: (outra.negocio_id as string) ?? null,
        criadas: 0,
        totalCents: 0,
        resultado: null,
      }
    }
    throw new Error(`Não foi possível registar a venda: ${erroVenda.message}`)
  }

  const vendaId = String(criada.id)

  if (!negocio) {
    // A venda fica registada de qualquer maneira: é ela que faz esta falta aparecer no admin em
    // vez de desaparecer num log. O `ambiguo` distingue os dois casos que pedem acções diferentes —
    // «ninguém a trabalhou» (o binário paga, está tudo bem) de «há mais do que um candidato» (é
    // preciso uma pessoa decidir, e há dinheiro à espera).
    return {
      vendaId,
      repetida: false,
      negocioId: null,
      criadas: 0,
      totalCents: 0,
      resultado: null,
      aviso: ambiguo
        ? `Venda por atribuir — ${motivoDaProcura}`
        : `Venda sem negócio associado: não há atribuição, logo não há comissões de equipa (o MLM binário segue o seu caminho). ${motivoDaProcura}`,
    }
  }

  const atribuicao = atribuicaoDoNegocio(negocio)
  const pessoas = Object.values(atribuicao).filter((p): p is string => !!p)

  const [regras, regrasRank, planoPorPessoa, numeroPagamento] = await Promise.all([
    carregarRegras(supabase),
    carregarRegrasRank(supabase),
    planosDasPessoas(supabase, pessoas),
    numeroDoPagamento(supabase, venda.compradorId, pagoEm),
  ])

  // O degrau só conta no 1.º pagamento — nem se vai contar vendas do mês numa renovação.
  const vendasNoMes: Record<string, number> = {}
  if (tipo === 'primeira') {
    for (const papel of PAPEIS_VENDAS) {
      const pessoa = atribuicao[papel]
      if (pessoa) vendasNoMes[`${papel}:${pessoa}`] = await vendasDoMesNoPapel(supabase, papel, pessoa, pagoEm)
    }
  }

  const resultado = calcularComissoes(
    { pack: venda.pack ?? null, valor_cents: valorCents, tipo, moeda },
    atribuicao,
    regras,
    pagoEm,
    { numeroDoPagamento: numeroPagamento ?? undefined, planoPorPessoa, regrasRank, vendasNoMes },
  )

  // ── O tecto ─────────────────────────────────────────────────────────────────────────────
  //
  // Aplicado ANTES de escrever, e não depois: uma linha já gravada com valor a mais é dinheiro
  // prometido, e desfazer promessas é pior do que nunca as ter feito.
  const tecto = Number(venda.tectoComissaoCents)
  if (Number.isFinite(tecto) && tecto >= 0) {
    const pedido = resultado.linhas.reduce((t, l) => t + Math.max(0, l.valor_cents || 0), 0)
    if (pedido > tecto) {
      // Proporcional: cada um perde a mesma fracção. `Math.floor` garante que a soma NUNCA passa o
      // tecto por arredondamento — o cêntimo que sobra fica para a casa, que é quem está a pagar.
      const fracao = pedido > 0 ? tecto / pedido : 0
      for (const l of resultado.linhas) {
        l.valor_cents = Math.floor(Math.max(0, l.valor_cents || 0) * fracao)
      }
      resultado.avisos.push(
        `Comissões reduzidas de ${pedido} para ${tecto} cêntimos: o que sobrava desta venda depois ` +
        `da parte do educador não chegava para as pagar por inteiro.`,
      )
    }
  }

  let criadas = 0
  let totalCents = 0
  for (const linha of resultado.linhas) {
    const { data: comissao, error } = await supabase
      .from('vendas_comissoes')
      .insert({
        venda_id: vendaId,
        negocio_id: String(negocio.id),
        beneficiario_id: linha.beneficiario_id,
        papel: linha.papel,
        regra_id: linha.regra_id,
        pct: linha.pct,
        pct_base: linha.pct_base,
        rank_regra_id: linha.rank_regra_id,
        rank_min_vendas: linha.rank_min_vendas,
        vendas_no_mes: linha.vendas_no_mes,
        numero_pagamento: linha.numero_pagamento,
        base_cents: linha.base_cents,
        valor_cents: linha.valor_cents,
        moeda: linha.moeda,
        estado: 'pendente',
      })
      .select('id')
      .single()

    if (error) {
      // Não se aborta o resto: uma linha que colide (reenvio) não pode impedir as outras de
      // existir. O que ficou de fora vê-se no livro, ao lado da venda.
      console.error('[VENDAS] comissão não gravada', { vendaId, papel: linha.papel, erro: error.message })
      continue
    }

    await supabase.from('vendas_comissoes_historico').insert({
      comissao_id: comissao.id,
      de: null,
      para: 'pendente',
      nota:
        `Calculada sobre ${linha.base_cents} cêntimos a ${linha.pct} % ` +
        `(regra ${linha.regra_id}, plano ${linha.plano}` +
        (linha.rank_min_vendas !== null ? `, degrau ${linha.rank_min_vendas}+ com ${linha.vendas_no_mes} vendas no mês` : '') +
        (linha.numero_pagamento !== null ? `, pagamento nº ${linha.numero_pagamento}` : '') +
        ').',
    })

    criadas += 1
    totalCents += linha.valor_cents
  }

  return { vendaId, repetida: false, negocioId: String(negocio.id), criadas, totalCents, resultado }
}

// ───────────────────────────── devoluções e chargebacks ─────────────────────────────

export type ResultadoEstorno = {
  vendasMarcadas: number
  comissoesCanceladas: number
  /** Já tinham sido PAGAS: ficam pagas e marcadas, e o valor passa a descontar no próximo pagamento. */
  comissoesPagasMarcadas: number
  mlmCanceladas: number
  mlmPagasMarcadas: number
  /** Vendas ANTERIORES do mesmo cliente revertidas por a devolução cair na janela dos 30 dias. */
  arrastadas: number
}

type VendaEstornavel = { id: string; estornada_em: string | null; comprador_id: string | null; pago_em: string }

async function marcarVendaEComissoes(
  supabase: SupabaseClient,
  venda: VendaEstornavel,
  motivo: string,
  cents: number | null,
  agora: string,
  resultado: ResultadoEstorno,
): Promise<void> {
  if (!venda.estornada_em) {
    await supabase
      .from('vendas_vendas')
      .update({ estornada_em: agora, estorno_motivo: motivo, estorno_cents: cents })
      .eq('id', venda.id)
    resultado.vendasMarcadas += 1
  }

  const { data: comissoes } = await supabase
    .from('vendas_comissoes')
    .select('id, estado, paga_em, estornada_em')
    .eq('venda_id', venda.id)

  for (const c of comissoes ?? []) {
    if (c.estornada_em) continue
    const jaPaga = !!c.paga_em || c.estado === 'paga'
    await supabase
      .from('vendas_comissoes')
      .update({
        estado: jaPaga ? 'paga' : 'estornada',
        estornada_em: agora,
        estorno_motivo: motivo,
      })
      .eq('id', c.id)

    await supabase.from('vendas_comissoes_historico').insert({
      comissao_id: c.id,
      de: c.estado,
      para: jaPaga ? 'paga (estornada — a descontar)' : 'estornada',
      nota: motivo,
    })

    if (jaPaga) resultado.comissoesPagasMarcadas += 1
    else resultado.comissoesCanceladas += 1
  }
}

/**
 * Reverter tudo o que uma venda gerou, porque o dinheiro voltou para o cliente.
 *
 * A distinção que importa e que não se pode esconder:
 *  · comissão ainda NÃO paga → passa a 'estornada'. Nunca chega a sair dinheiro.
 *  · comissão JÁ paga → fica paga E marcada com `estornada_em`. Não se finge que o pagamento não
 *    aconteceu: cria-se uma dívida visível, que o extracto mostra com sinal negativo e que desconta
 *    no próximo pagamento. Apagar o rasto seria a única coisa pior do que pagar sobre uma devolução.
 *
 * E ARRASTA: se a devolução cair nos primeiros {@link JANELA_ESTORNO_TOTAL_DIAS} dias do cliente,
 * revertem-se TAMBÉM as comissões dos pagamentos anteriores dele — incluindo a do 1.º. Quem devolve
 * no primeiro mês nunca chegou a ser cliente.
 *
 * Faz o mesmo ao MLM, pelas referências da mesma venda: até aqui uma devolução deixava a comissão
 * do patrocinador intacta, e o sistema só sabia somar.
 */
export async function estornarVenda(
  supabase: SupabaseClient,
  params: { fonte: FonteVenda; referencias: string[]; motivo: string; cents?: number | null },
): Promise<ResultadoEstorno> {
  const referencias = params.referencias.map((r) => String(r || '').trim()).filter(Boolean)
  const resultado: ResultadoEstorno = {
    vendasMarcadas: 0,
    comissoesCanceladas: 0,
    comissoesPagasMarcadas: 0,
    mlmCanceladas: 0,
    mlmPagasMarcadas: 0,
    arrastadas: 0,
  }
  if (referencias.length === 0) return resultado

  const agora = new Date().toISOString()

  const { data: vendas } = await supabase
    .from('vendas_vendas')
    .select('id, estornada_em, comprador_id, pago_em')
    .eq('fonte', params.fonte)
    .in('referencia', referencias)

  const jaTratadas = new Set<string>()

  for (const bruta of vendas ?? []) {
    const venda = bruta as unknown as VendaEstornavel
    await marcarVendaEComissoes(supabase, venda, params.motivo, params.cents ?? null, agora, resultado)
    jaTratadas.add(venda.id)

    if (!venda.comprador_id) continue

    // A JANELA: conta-se do PRIMEIRO pagamento do cliente, não desta venda. Uma devolução ao dia
    // 20 apanha o 1.º pagamento e o 2.º; ao dia 200 apanha só o que foi devolvido.
    const { data: primeira } = await supabase
      .from('vendas_vendas')
      .select('pago_em')
      .eq('comprador_id', venda.comprador_id)
      .order('pago_em', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!primeira?.pago_em) continue
    if (!arrastaEstornoTotal(String(primeira.pago_em), agora)) continue

    const { data: outras } = await supabase
      .from('vendas_vendas')
      .select('id, estornada_em, comprador_id, pago_em')
      .eq('comprador_id', venda.comprador_id)
      .is('estornada_em', null)

    for (const outraBruta of outras ?? []) {
      const outra = outraBruta as unknown as VendaEstornavel
      if (jaTratadas.has(outra.id)) continue
      await marcarVendaEComissoes(
        supabase,
        outra,
        `${params.motivo} — arrastada: devolução dentro dos primeiros ${JANELA_ESTORNO_TOTAL_DIAS} dias do cliente.`,
        null,
        agora,
        resultado,
      )
      jaTratadas.add(outra.id)
      resultado.arrastadas += 1
    }
  }

  // ── O MLM, pelas mesmas referências ──
  for (const coluna of ['stripe_session_id', 'stripe_invoice_id'] as const) {
    const { data: mlm } = await supabase
      .from('mlm_commissions')
      .select('id, status, paid_at, estornada_em')
      .in(coluna, referencias)

    for (const c of mlm ?? []) {
      if (c.estornada_em) continue
      const jaPaga = !!c.paid_at || c.status === 'paid'
      await supabase
        .from('mlm_commissions')
        .update({
          // 'cancelled' já existe no CHECK da tabela desde a 026 — não se inventa estado novo
          // numa tabela viva só para isto.
          status: jaPaga ? 'paid' : 'cancelled',
          estornada_em: agora,
          estorno_motivo: params.motivo,
        })
        .eq('id', c.id)
      if (jaPaga) resultado.mlmPagasMarcadas += 1
      else resultado.mlmCanceladas += 1
    }
  }

  return resultado
}
