import type { SupabaseClient } from '@supabase/supabase-js'
import { lerRef } from '../../copia-contas/regras'
import { diaDaCorretora } from '../../mtmfunded/simulado/ordens'
import {
  lerLimitesPorTipo, travaDaConta, type LimitesDoTipo, type TipoDeConta,
} from '../../travas-por-tipo-de-conta'
import type { RotaMestres } from './estado'

/**
 * A TRAVA DO TIPO DA CONTA DE DESTINO, no motor da cópia.
 *
 * `lib/copia-contas/mestre-travas.ts` trava a MESTRE (o emissor). Esta trava a conta que RECEBE, e o
 * limite depende do tipo de dinheiro que lá está: financiada (prop firm) 3 % ao dia e 6 % acumulados;
 * real 30 % ao dia e nada mais. Os limiares são os de `lib/travas-por-tipo-de-conta.ts`, os mesmos que
 * o WebTrader aplica — uma conta não pode ter dois limites por ser tocada por dois motores.
 *
 * Lida num sítio só: `./ganchos.ts`, dentro de `bloqueioAbertura`. Não é lida em `registar` nem em
 * nenhum caminho de saída, e há uma guarda a lê-lo no código
 * (`lib/__tests__/travas-por-tipo-de-conta.check.ts`): parciais, break-even, trailing e fechos têm de
 * chegar sempre a uma conta travada, senão a trava deixa o cliente com posições abertas sem gestão.
 *
 * ═══ DE ONDE VEM O TIPO DE CADA DESTINO ═════════════════════════════════════════════════════
 *
 *  · `funded:` / `wt:` → `mtm_trading_accounts.tipo` (financiada | real | desafio | torneio).
 *  · `site:`  → `mtmcopy_connections`: com `prop_firm_type` é uma conta de prop firm (financiada);
 *    sem ele é dinheiro do cliente numa corretora (real). A linha de partida é `baseline_balance`.
 *  · `auto:`  → `mtmauto_accounts.prop_firm`, pela mesma lógica. Sem linha de partida guardada, só a
 *    trava do DIA se mede — e diz-se, em vez de se inventar uma base.
 *
 * Um destino que não se consegue identificar NÃO trava: uma trava que dispara por falta de dados
 * pára a cadeia e parece prudência (o mesmo princípio de `mestre-travas.ts`).
 *
 * ═══ A ÂNCORA DO DIA ════════════════════════════════════════════════════════════════════════
 *
 * As contas simuladas têm `sim_ancora_dia` mantida pelo motor. As contas de corretora não têm nada
 * parecido, por isso a âncora fica em `mestres_contas.ancora_dia` (+ `ancora_dia_em`, migração 156),
 * escrita por este ficheiro na primeira abertura de cada dia de corretora (`diaDaCorretora`, o dia que
 * vira às 22:00 UTC — o mesmo que o motor simulado usa, para não haver dois «dias» na casa).
 *
 * Sem a 156 aplicada a coluna não existe: aí a trava do DIA não se mede (fica sem base) e a
 * ACUMULADA continua a funcionar contra a linha de partida. Está dito assim em
 * `lib/copia-contas/mestre-controlos.ts`, para o painel não prometer o que ainda não faz.
 *
 * A FXIFY conta o dia das 17:00 EST às 17:00 EST e tem a sua própria guarda
 * (`lib/mtmcopy/prop-firm-guard.ts`, com as regras reais dela: 8 %/8 %). Esta é uma trava NOSSA, mais
 * apertada e ancorada no nosso dia: chega primeiro, e é isso que se quer.
 */

interface BaseDoDestino {
  tipo: TipoDeConta
  /** linha de partida para a perda ACUMULADA. null = não se mede a acumulada. */
  saldoInicial: number | null
  /** âncora do dia já guardada na própria conta (contas simuladas) */
  ancoraPropria: number | null
  motor: string | null
}

const CACHE_MS = 30_000
const cache = new Map<string, { em: number; base: BaseDoDestino | null }>()

const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

async function baseDoDestino(db: SupabaseClient, destinoRef: string): Promise<BaseDoDestino | null> {
  const c = cache.get(destinoRef)
  if (c && Date.now() - c.em < CACHE_MS) return c.base
  const r = lerRef(destinoRef)
  let base: BaseDoDestino | null = null
  try {
    if (r?.origem === 'funded' || r?.origem === 'wt') {
      // `conta_real_casa` (109) é auditoria da casa, «negociação real, sem regras» por decisão
      // explícita: sai do âmbito, como sai no WebTrader (lib/mtmfunded/simulado/travas-tipo.ts).
      //
      // E `sem_regras` também sai, pela mesma razão e por decisão do dono a 29/09: uma conta que
      // existe para ESPELHAR uma estratégia não está a ser avaliada, está a ser medida — e pará-la
      // aos 3% truncava a série a meio. Tem de ser o MESMO critério do WebTrader, senão uma conta
      // abre por um caminho e é recusada pelo outro.
      const { data } = await db.from('mtm_trading_accounts')
        .select('tipo, motor, saldo_inicial, sim_ancora_dia, conta_real_casa, conta_casa, sem_regras').eq('id', r.id).maybeSingle()
      if (data) {
        const casa = data.conta_real_casa === true || data.sem_regras === true
        base = {
          tipo: casa ? 'desconhecido' : ((data.tipo ?? '') as TipoDeConta),
          saldoInicial: n(data.saldo_inicial), ancoraPropria: n(data.sim_ancora_dia), motor: data.motor ?? null,
        }
      }
    } else if (r?.origem === 'site') {
      const { data } = await db.from('mtmcopy_connections')
        .select('prop_firm_type, baseline_balance').eq('id', r.id).maybeSingle()
      if (data) base = { tipo: data.prop_firm_type ? 'financiada' : 'real', saldoInicial: n(data.baseline_balance), ancoraPropria: null, motor: 'mt5' }
    } else if (r?.origem === 'auto') {
      const { data } = await db.from('mtmauto_accounts').select('prop_firm').eq('id', r.id).maybeSingle()
      if (data) base = { tipo: data.prop_firm ? 'financiada' : 'real', saldoInicial: null, ancoraPropria: null, motor: 'mt5' }
    }
  } catch {
    base = null
  }
  cache.set(destinoRef, { em: Date.now(), base })
  return base
}

let limitesCache: { em: number; limites: Record<TipoDeConta, LimitesDoTipo> } | null = null

async function limites(db: SupabaseClient): Promise<Record<TipoDeConta, LimitesDoTipo>> {
  if (limitesCache && Date.now() - limitesCache.em < CACHE_MS) return limitesCache.limites
  let valor: unknown = null
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', 'travas_por_tipo_de_conta').maybeSingle()
    valor = data?.value ?? null
  } catch {
    // Sem a chave, `lerLimitesPorTipo` devolve os valores que o dono ditou: aqui o lado seguro é
    // continuar a travar, não desligar.
  }
  const l = lerLimitesPorTipo(valor)
  limitesCache = { em: Date.now(), limites: l }
  return l
}

/**
 * A âncora do dia de uma conta de corretora, em `mestres_contas`. Na primeira abertura de cada dia
 * escreve-se a equity de agora; nas seguintes lê-se a que ficou.
 *
 * Coluna em falta (156 por aplicar) = devolve null e a trava do dia não se mede. Nunca lança: uma
 * coluna que não existe não pode parar a cópia.
 */
async function ancoraDoDia(db: SupabaseClient, contaChave: string, contaRef: string, equity: number | null): Promise<number | null> {
  const dia = diaDaCorretora()
  try {
    const { data, error } = await db.from('mestres_contas')
      .select('ancora_dia, ancora_dia_em').eq('conta_chave', contaChave).maybeSingle()
    if (error) return null
    const guardada = n((data as { ancora_dia?: unknown } | null)?.ancora_dia)
    const diaGuardado = (data as { ancora_dia_em?: unknown } | null)?.ancora_dia_em
    if (guardada != null && String(diaGuardado ?? '') === dia) return guardada
    if (equity == null || !(equity > 0)) return null
    await db.from('mestres_contas').upsert(
      { conta_chave: contaChave, conta_ref: contaRef, ancora_dia: equity, ancora_dia_em: dia },
      { onConflict: 'conta_chave' },
    )
    return equity
  } catch {
    return null
  }
}

/**
 * O motivo de não ABRIR nesta conta, ou null. É esta que `bloqueioAbertura` chama.
 *
 * `equity` é a da corretora no momento (o motor já a tem no contexto). Sem ela não se mede nada — e
 * não se trava: a guarda de exposição (`motivoExposicao`) continua a valer, e é ela que conta o risco
 * desconhecido pelo pior caso.
 */
export async function travaDaContaDestino(
  db: SupabaseClient,
  rota: RotaMestres,
  x: { equity: number | null; margemLivre?: number | null },
): Promise<string | null> {
  const base = await baseDoDestino(db, rota.destino_ref)
  if (!base) return null
  const porTipo = await limites(db)
  const l = porTipo[base.tipo] ?? null
  // Tipo sem travas (desafio, torneio, provider, desconhecido): nada a medir, e nada a inventar.
  if (!l || (l.perdaDiariaPct == null && l.perdaGlobalPct == null && l.margemLivreMinPct == null)) return null

  const ancora = base.ancoraPropria ?? (await ancoraDoDia(db, rota.destino_chave, rota.destino_ref, x.equity))

  /**
   * SEM ÂNCORA DO DIA, A TRAVA DIÁRIA DESLIGA-SE — não «cai para o saldo inicial».
   *
   * `travaDoTipo` usa o saldo inicial como base do dia quando não há âncora, e isso está certo numa
   * conta simulada (onde a âncora nasce igual ao saldo inicial no primeiro dia). Aqui estaria errado:
   * numa conta de corretora com meses de histórico, medir «a perda de hoje» contra a linha de partida
   * era medir a perda ACUMULADA e chamar-lhe do dia — e 3 % acumulados travavam a conta todos os dias
   * de manhã sem ela ter perdido nada hoje.
   */
  const aplicaveis = ancora == null
    ? { ...porTipo, [base.tipo]: { ...porTipo[base.tipo], perdaDiariaPct: null } }
    : porTipo

  return travaDaConta(base.tipo, aplicaveis, {
    saldo: null,
    equity: x.equity,
    saldoInicial: base.saldoInicial,
    ancoraDia: ancora,
    margemLivre: x.margemLivre ?? null,
    motor: base.motor,
  }).motivo
}
