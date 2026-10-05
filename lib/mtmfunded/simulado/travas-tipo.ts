import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  lerLimitesPorTipo, tipoDeConta, travaDaConta, type LimitesDoTipo, type TipoDeConta, type VeredictoTipo,
} from '@/lib/travas-por-tipo-de-conta'
import { ehContaRealDaCasa } from '@/lib/mtmfunded/conta-real-casa'

/**
 * A PORTA DAS ENTRADAS NOVAS pela trava do TIPO de conta (financiada 3 %/6 %, real 30 %).
 *
 * Escrito à imagem de `./pausa.ts`, e pela mesma razão: é chamada por `abrirPosicao` e
 * `criarPendente` — as duas únicas formas de nascer uma posição ou uma ordem no site (WebTrader,
 * webhook, T2T, cópia, OCO, inverter). Nenhum caminho de FECHO, parcial, BE, trailing ou
 * cancelamento a chama, e há uma guarda que o confirma a ler o código
 * (`lib/__tests__/travas-por-tipo-de-conta.check.ts`): uma conta travada tem de conseguir sair do
 * que já tem aberto, senão a trava faz mais dano do que o prejuízo que travava.
 *
 * A coluna nova (`travas_base_global`, migração 156) vem como OPCIONAL na leitura da conta
 * (`lerConta`, via `selecionarComOpcionais`) e nunca no `CAMPOS_CONTA` obrigatório: enquanto a 156
 * não estiver aplicada a coluna não existe, e pô-la no select comum partia TODAS as ordens. Quem
 * chega com uma linha sem a chave (outro caminho de leitura) faz-nos ler à parte, pela chave
 * primária. Sem a coluna, a base da perda global é o `saldo_inicial` — a trava funciona, só não há
 * reposições registadas.
 */

export class TravaDoTipoAtingida extends Error {
  status = 409
}

const CHAVE_CONFIG = 'travas_por_tipo_de_conta'

/** Cache curta: esta configuração muda a cada meses e é lida a cada ordem. */
let cache: { em: number; limites: Record<TipoDeConta, LimitesDoTipo>; excluirAnalise: boolean } | null = null
const CACHE_MS = 30_000

async function configuracao(): Promise<{ limites: Record<TipoDeConta, LimitesDoTipo>; excluirAnalise: boolean }> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache
  let valor: unknown = null
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle()
    valor = data?.value ?? null
  } catch {
    // Sem a chave (156 por aplicar) ou com a base em baixo, `lerLimitesPorTipo` devolve os valores
    // que o dono ditou. Aqui o lado seguro é CONTINUAR a travar, não desligar.
  }
  let o: unknown = valor
  if (typeof valor === 'string') { try { o = JSON.parse(valor) } catch { o = null } }
  const raiz = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  cache = { em: Date.now(), limites: lerLimitesPorTipo(valor), excluirAnalise: raiz.excluirAnalise === true }
  return cache
}

export async function limitesPorTipo(): Promise<Record<TipoDeConta, LimitesDoTipo>> {
  return (await configuracao()).limites
}

export interface LinhaContaTravas {
  id: string
  tipo?: unknown
  motor?: unknown
  saldo_inicial?: unknown
  sim_saldo?: unknown
  sim_equity?: unknown
  sim_margem?: unknown
  sim_ancora_dia?: unknown
  metricas?: Record<string, unknown> | null
  conta_real_casa?: unknown
  conta_casa?: unknown
  /** Marca as contas que existem para espelhar uma estratégia — ver `foraDoAmbito`. */
  sem_regras?: unknown
  /**
   * `travas_base_global` (156) quando veio na MESMA leitura da conta (`lerConta` pede-a como
   * opcional). Chave presente = usa-se sem voltar à base; ausente = lê-se à parte como antes.
   */
  travas_base_global?: unknown
}

/**
 * Contas que estas travas NÃO governam.
 *
 * SÓ a CONTA REAL DA CASA (109), por decisão explícita e já escrita: «auditoria · negociação real ·
 * sem regras». São duas contas, e são as da casa.
 *
 * E as contas que EXISTEM PARA ESPELHAR UMA ESTRATÉGIA também não. Palavras do dono a 29/09:
 * «se é conta que foi criada com o objectivo de receber estratégia e espelhar essa conta, não tem
 * regra prop.» A razão é boa: essa conta não está a ser avaliada, está a ser MEDIDA. Pará-la aos
 * 3 % interrompia a medição a meio e a série ficava truncada sem ninguém saber porquê.
 *
 * ── O CAMPO QUE AS DISTINGUE, E O QUE NÃO SERVE ──────────────────────────────────────────
 *
 * É `sem_regras`, e não `metricas.analise`. A diferença não é estética: hoje **nove contas de
 * CLIENTES REAIS** têm `analise: true` (a do Pedro Gonçalves, a do Rúben Sousa, a do Fábio
 * Henriques…) porque também são acompanhadas. Excluir por `analise` tirava as regras prop
 * exactamente a quem elas existem para proteger.
 *
 * `sem_regras = true` está nas 15 contas-espelho e da casa, e a `false` nas nove de clientes. É a
 * marca que já dizia o que o dono agora confirmou.
 */
export async function foraDoAmbito(conta: LinhaContaTravas): Promise<boolean> {
  if (ehContaRealDaCasa(conta as unknown as Record<string, unknown>)) return true
  if (conta.sem_regras === true) return true
  // `excluirAnalise` fica como interruptor de recurso, desligado por omissão. NÃO o ligues sem ler
  // o parágrafo acima: `analise` também está nas contas de clientes.
  const m = (conta.metricas ?? {}) as Record<string, unknown>
  const analise = m.analise === true || m.analise === 'true'
  return analise && (await configuracao()).excluirAnalise
}

const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * O veredicto da conta. `equity` opcional: quem já a mediu com preços ao vivo (o WebTrader, a rota
 * das ordens) passa a sua — ter dois números de equity para a mesma conta era como nasciam os ecrãs
 * verdes com motores a recusar.
 */
export async function veredictoDoTipo(
  conta: LinhaContaTravas,
  opts: { equity?: number | null; margemLivre?: number | null } = {},
): Promise<VeredictoTipo & { foraDoAmbito: boolean }> {
  const limites = await limitesPorTipo()
  // A base global vem na linha quando quem chamou a leu com `lerConta` (uma leitura por ordem);
  // só se volta à base quando a chave não veio (base sem a 156, ou linha lida por outro caminho).
  const baseGlobal = 'travas_base_global' in conta ? n(conta.travas_base_global) : await lerBaseGlobal(conta.id)
  const fora = await foraDoAmbito(conta)
  const v = travaDaConta(fora ? 'desconhecido' : conta.tipo, limites, {
    saldo: n(conta.sim_saldo),
    equity: n(opts.equity) ?? n(conta.sim_equity) ?? n(conta.sim_saldo),
    saldoInicial: n(conta.saldo_inicial),
    ancoraDia: n(conta.sim_ancora_dia),
    baseGlobal,
    margemLivre: opts.margemLivre ?? null,
    motor: conta.motor == null ? null : String(conta.motor),
  })
  // O ecrã tem de saber o tipo VERDADEIRO da conta mesmo quando ela está fora do âmbito, senão
  // uma conta de análise financiada aparecia como «conta» e ninguém entendia porque não trava.
  return { ...v, tipo: fora ? tipoDeConta(conta.tipo) : v.tipo, foraDoAmbito: fora }
}

/** `travas_base_global` (156). Sem a coluna: null → a global mede-se ao `saldo_inicial`. */
export async function lerBaseGlobal(accountId: string): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('travas_base_global')
    .eq('id', accountId)
    .maybeSingle()
  if (error) return null
  return n((data as { travas_base_global?: unknown } | null)?.travas_base_global)
}

/**
 * Recusa a ENTRADA quando a trava do tipo está atingida. Nunca chamada num caminho de saída.
 *
 * Ao contrário de `pausa.ts`, um erro de leitura aqui NÃO fecha a porta: os números vêm todos da
 * própria linha da conta (que quem chama já tem), e o único pedido extra é a coluna nova — se ela
 * falhar, mede-se ao saldo inicial em vez de se parar a conta.
 */
export async function exigirTravaDoTipo(
  conta: LinhaContaTravas,
  opts: { equity?: number | null; margemLivre?: number | null } = {},
): Promise<void> {
  const v = await veredictoDoTipo(conta, opts)
  if (v.podeAbrir) return
  throw new TravaDoTipoAtingida(v.motivo ?? 'limite de perda da conta atingido')
}
