/**
 * GESTÃO DAS CONTAS PROVIDER (as contas mestre de cada estratégia) — pura, sem IO.
 *
 * O buraco que isto tapa: o motor em tempo real já LIGAVA as contas provider MT5 do VPS (preços e
 * posições a cada tick, porque estão em `MOTOR_REAL_FOTOGRAFIA_CONTAS`), mas não geria nenhuma —
 * Premium, T2T e MTM Auto são geridos pela LINHA que os originou, e uma posição aberta na conta
 * mestre de uma estratégia não tem linha nenhuma. Resultado: a sombra ficava a zero para as
 * estratégias, a posição corria sem break-even nem trailing, e como o espelho (070) só leva às
 * contas MTM Funded o que acontece na mestre, a falta contagiava os seguidores.
 *
 * AS REGRAS SÃO AS DA ESTRATÉGIA, não do motor: vêm de `mtmauto_providers` pela MESMA função que o
 * motor simulado usa (`configDoProvider`, lib/mtmfunded/estrategias-sinais/calculo.ts) — o jsonb
 * `sinais_config` manda e as colunas antigas (`trailing_arranca_pips`, `trailing_distancia_pips`,
 * `trailing_passo_pips`, `saidas_pct`) ficam como recurso. A coluna `be_gatilho` NÃO entra: já tem
 * dois sentidos na casa (pips e «BE no TP nº N») e `configDoProvider` ignora-a de propósito.
 *
 * Perfil «zona» (o que o dono acabou de pôr): premium-ouro BE aos 25 pips com +2 de offset, trailing
 * a arrancar aos 30 a 15 de distância com passo de 3; sensei 35/2/40/20/4. É exactamente isto que
 * este ficheiro decide sobre a posição real.
 *
 * Perfil em FRACÇÃO DO RISCO (16/09): `beFracaoDoRisco`, `beOffsetFracaoDoRisco` e
 * `trailingInicioFracaoDoRisco` medem-se contra o risco da PRÓPRIA posição (|entrada − SL|) e
 * MANDAM sobre os pips quando estão postos — a regra está escrita em `beFracaoDoRisco`
 * (estrategias-sinais/calculo.ts). É o que torna configurável o GoldKiller (risco mediano do sinal
 * a saltar de 84 para 169 pips em três meses) e o Aurum Flow (~42 perpétuos de 0,07 $ a 120 000 $,
 * onde qualquer número absoluto em «pips» é 40 unidades de preço e não quer dizer nada).
 * Sem SL na posição não há risco, e a fracção cai para o que estiver em pips.
 *
 * O QUE ESTE FICHEIRO **NÃO** FAZ, e porquê:
 *  · PARCIAIS (`saidasPct`). Uma parcial precisa de uma escada de alvos e a posição da conta mestre
 *    só traz UM `takeProfit` — inventar níveis fazia a sombra mentir. E fechar meia posição na
 *    mestre propaga-se pela CopyFactory e pelo espelho às MTM Funded: é uma mudança de
 *    comportamento, não uma medição. A configuração é lida (fica no `ConfigProvider`) e não é usada;
 *    quando houver escada gravada por posição, entra aqui.
 *  · Nada envia. Quem decide o envio é `avaliarItem` (sombra regista, live executa) e o live só
 *    conhece o tipo `premium` — o tipo `provider` é sempre sombra.
 *
 * Unidades: pips por `pipSizeForSymbol` (a mesma convenção do motor simulado e de quem escreveu a
 * configuração — ouro 0,1 · JPY 0,01 · forex 0,0001 · índices e cripto em PONTOS), preço arredondado
 * com `precoDaCorretora` (casas do preço ≠ tamanho do pip: no ouro o pip é 0,1 e o preço tem 2 casas).
 */
import { configDoProvider, type ConfigSinais } from '../mtmfunded/estrategias-sinais/calculo'
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'
import { precoDaCorretora } from './mtmauto-regras'

/** A posição como a MetaApi a devolve (o subconjunto que a gestão lê). */
export interface PosicaoProvider {
  id: string
  symbol: string
  type: string
  openPrice: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
  volume?: number
}

/** A configuração de UMA estratégia, tal como o motor a usa. */
export interface ConfigProvider {
  slug: string
  perfil: string | null
  beGatilhoPips: number | null
  beOffsetPips: number
  /** Fracção do risco da posição (|entrada − SL|); manda sobre os pips. Ver o cabeçalho. */
  beFracaoDoRisco: number | null
  beOffsetFracaoDoRisco: number | null
  trailingInicioPips: number | null
  trailingInicioFracaoDoRisco: number | null
  trailingDistanciaPips: number | null
  trailingPassoPips: number | null
  trailingFracaoDoRisco: number
  /** Lida da estratégia e NÃO usada (ver cabeçalho). */
  saidasPct: number[]
  /** Nada volta a ser decidido na mesma posição antes disto (travão de carga). */
  intervaloMinimoMs: number
}

/** Passo mínimo do trailing quando a estratégia não o diz (o mesmo do motor MTM Auto). */
export const PASSO_TRAILING_PADRAO_PIPS = 0.5
export const INTERVALO_MINIMO_MS = 1_000

/**
 * A configuração de uma estratégia a partir da linha de `mtmauto_providers`. Passa pela mesma
 * `configDoProvider` do motor simulado — uma regra escrita duas vezes era uma estratégia a
 * comportar-se de uma maneira na conta simulada e de outra na conta real.
 */
export function configProviderDaLinha(
  slug: string,
  linha: Record<string, unknown> | null | undefined,
  intervaloMinimoMs = INTERVALO_MINIMO_MS,
): ConfigProvider {
  const c: ConfigSinais = configDoProvider(linha ?? null)
  const extra = (linha && typeof linha.sinais_config === 'object' && linha.sinais_config
    ? linha.sinais_config
    : {}) as Record<string, unknown>
  return {
    slug,
    perfil: typeof extra.perfil === 'string' && extra.perfil.trim() ? extra.perfil.trim() : null,
    beGatilhoPips: c.beGatilhoPips,
    beOffsetPips: c.beOffsetPips,
    beFracaoDoRisco: c.beFracaoDoRisco,
    beOffsetFracaoDoRisco: c.beOffsetFracaoDoRisco,
    trailingInicioPips: c.trailingInicioPips,
    trailingInicioFracaoDoRisco: c.trailingInicioFracaoDoRisco,
    trailingDistanciaPips: c.trailingDistanciaPips,
    trailingPassoPips: c.trailingPassoPips,
    trailingFracaoDoRisco: c.trailingFracaoDoRisco,
    saidasPct: c.saidasPct,
    intervaloMinimoMs,
  }
}

/**
 * Esta estratégia tem gestão para uma posição SOLTA (sem escada de alvos gravada)?
 *
 * Só há decisão quando a estratégia a pediu explicitamente: um gatilho de break-even ou um arranque
 * de trailing, em pips OU em fracção do risco. Sem isso o motor fica calado — `beNoTp1` precisa de
 * um TP1 que a posição da mestre não tem.
 *
 * `trailingFracaoDoRisco` continua de FORA desta conta, e é uma distinção que interessa: essa tem
 * valor por defeito (0,5) e está posta em toda a gente, por isso nunca é um pedido; só diz a que
 * distância seguir DEPOIS de alguma coisa arrancar. As fracções novas nascem a null — quando têm
 * valor, alguém as escreveu de propósito.
 */
export function temGestaoProvider(cfg: ConfigProvider): boolean {
  return (cfg.beGatilhoPips ?? 0) > 0 || (cfg.trailingInicioPips ?? 0) > 0
    || (cfg.beFracaoDoRisco ?? 0) > 0 || (cfg.trailingInicioFracaoDoRisco ?? 0) > 0
}

// ── que estratégias entram na gestão ─────────────────────────────────────────

export interface ContaDeEstrategiaMin {
  slug: string
  accountId: string
  divergencia?: string | null
}

export interface EstrategiaGerida {
  slug: string
  conta: string
  cfg: ConfigProvider
  /** Linha de `mtmauto_providers` (para quem precise da chave da equipa). */
  provider: Record<string, unknown> | null
}

/**
 * PURA: das contas mestre conhecidas, quais são geridas, quais só se observam e o que fica por
 * dizer. Separada do escopo (que tem IO) para poder ser testada com fixtures.
 */
export function estrategiasGeridas(
  contas: ContaDeEstrategiaMin[],
  porSlug: Map<string, Record<string, unknown>>,
  o: { naoExecutam: ReadonlySet<string>; observarQuemNaoExecuta?: boolean; intervaloMinimoMs?: number },
): { geridas: EstrategiaGerida[]; observar: string[]; notas: string[] } {
  const geridas: EstrategiaGerida[] = []
  const observar: string[] = []
  const notas: string[] = []
  for (const c of contas) {
    if (!c.accountId) continue
    // Não negoceia, logo não há nada a gerir. Ligar só para ver é uma escolha explícita.
    if (o.naoExecutam.has(c.slug)) {
      if (o.observarQuemNaoExecuta) observar.push(c.accountId)
      continue
    }
    const prov = porSlug.get(c.slug.toLowerCase()) ?? null
    if (prov && (prov.ativo === false || prov.apagado_em)) { notas.push(`provider ${c.slug}: estratégia desligada`); continue }
    const cfg = configProviderDaLinha(c.slug, prov, o.intervaloMinimoMs)
    if (!temGestaoProvider(cfg)) { notas.push(`provider ${c.slug}: sem gestão configurada (sinais_config)`); continue }
    if (c.divergencia) notas.push(`provider ${c.slug}: ${c.divergencia}`)
    geridas.push({ slug: c.slug, conta: c.accountId, cfg, provider: prov })
  }
  return { geridas, observar, notas }
}

/** O estado virtual de UMA posição entre ticks (em sombra nunca sai da memória do motor). */
export interface EstadoProvider {
  beFeito: boolean
  /** Último SL que o motor pretendeu (o ratchet mede-se a este, não ao SL real). */
  slPretendido: number | null
  picoPips: number
  /** Hora da última decisão nesta posição (travão de carga). */
  ultimaEm: number
  /**
   * O risco ORIGINAL da posição em pips (|entrada − SL do primeiro tick em que havia SL}), fixado
   * uma vez. É a régua de TODAS as fracções — e tem de ser fixado, porque o SL da corretora é o que
   * o BE e o trailing vão apertando: medir o risco ao SL de agora fazia «0,30R» encolher a cada
   * aperto, e depois do break-even o risco passava a ser a folga do BE (um trailing a arrancar a 1R
   * armava logo a seguir, e a 0,5R de distância colava-se ao preço).
   */
  riscoPips: number
}

export const ESTADO_PROVIDER_NOVO: EstadoProvider = { beFeito: false, slPretendido: null, picoPips: 0, ultimaEm: 0, riscoPips: 0 }

export type MotivoProvider = 'be' | 'trailing'

export interface DecisaoProvider {
  /** SL a pedir; null = nada a fazer neste tick. */
  sl: number | null
  motivo: MotivoProvider | null
  nota: string | null
  estado: EstadoProvider
  lucroPips: number
}

const compraDoTipo = (tipo: string) => !/SELL/i.test(String(tipo ?? ''))

/** Pips para a NOTA (que é texto para gente ler): a folga em fracção do risco dá dízimas. */
const arredPips = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1))

/**
 * O que a gestão da estratégia faz a UMA posição com este preço.
 *
 * Ordem (a mesma do motor simulado `decidirGestao`): break-even primeiro, trailing depois — o
 * trailing manda quando já passou o BE, e o BE acontece uma vez só. Ambos só APERTAM o stop (numa
 * compra o SL só sobe) e o trailing anda aos saltos de `trailingPassoPips`: um SL a mexer a cada
 * décimo de pip era uma escrita (e um evento na CopyFactory, e uma linha de sombra) por tick.
 */
export function decidirProvider(
  pos: PosicaoProvider,
  cfg: ConfigProvider,
  estado: EstadoProvider,
  agora: number,
  precoVivo?: number | null,
): DecisaoProvider {
  const nada = (e: EstadoProvider = estado): DecisaoProvider => ({ sl: null, motivo: null, nota: null, estado: e, lucroPips: 0 })
  if (!temGestaoProvider(cfg)) return nada()

  const preco = precoVivo != null && precoVivo > 0 ? precoVivo : pos.currentPrice
  if (preco == null || !(preco > 0) || !(pos.openPrice > 0)) return nada()

  const pip = pipSizeForSymbol(pos.symbol)
  const compra = compraDoTipo(pos.type)
  const sentido = compra ? 1 : -1
  const lucroPips = ((preco - pos.openPrice) * sentido) / pip
  const e: EstadoProvider = { ...estado, picoPips: Math.max(estado.picoPips, Math.round(lucroPips * 10) / 10) }

  // Travão de carga: uma posição não volta a decidir antes do intervalo, mesmo que o preço corra.
  if (estado.ultimaEm > 0 && agora - estado.ultimaEm < cfg.intervaloMinimoMs) return nada(e)

  // O ratchet mede-se ao MAIOR entre o SL real e o que o motor já pretendeu: em sombra o SL real
  // nunca muda (é o monitor que manda), e sem isto o motor repetia a mesma decisão para sempre.
  const slReal = pos.stopLoss != null && pos.stopLoss > 0 ? pos.stopLoss : null

  // O risco DESTA posição em pips, fixado à primeira vez que há SL (ver `EstadoProvider.riscoPips`).
  if (!(e.riscoPips > 0) && slReal != null) e.riscoPips = Math.abs(pos.openPrice - slReal) / pip
  const riscoPips = e.riscoPips
  const comRisco = riscoPips > 0
  // PRECEDÊNCIA (a mesma de `gestaoDoSinal`): fracção do risco manda, os pips são o recurso.
  const beGatilhoPips = cfg.beFracaoDoRisco != null && comRisco ? riscoPips * cfg.beFracaoDoRisco : cfg.beGatilhoPips
  const beOffsetPips = cfg.beOffsetFracaoDoRisco != null && comRisco && cfg.beFracaoDoRisco != null
    ? riscoPips * cfg.beOffsetFracaoDoRisco
    : cfg.beOffsetPips
  const trailingInicioPips = cfg.trailingInicioFracaoDoRisco != null && comRisco
    ? riscoPips * cfg.trailingInicioFracaoDoRisco
    : cfg.trailingInicioPips

  const base = [slReal, e.slPretendido].filter((x): x is number => x != null)
  const slBase = base.length ? (compra ? Math.max(...base) : Math.min(...base)) : null
  const aperta = (candidato: number, passo: number) =>
    slBase == null ? true : (candidato - slBase) * sentido >= passo - 1e-12

  let sl: number | null = null
  let motivo: MotivoProvider | null = null
  let nota: string | null = null

  // ── break-even (uma vez) ───────────────────────────────────────────────────
  if (!e.beFeito && (beGatilhoPips ?? 0) > 0 && lucroPips >= beGatilhoPips! - 1e-9) {
    const nivel = precoDaCorretora(pos.openPrice + sentido * beOffsetPips * pip, pos.symbol)!
    e.beFeito = true
    // Só se ainda estiver do lado certo do preço — senão fechava a posição no mesmo instante.
    if (aperta(nivel, 0) && (preco - nivel) * sentido > 0) {
      sl = nivel
      motivo = 'be'
      nota = `${pos.symbol}: BE (+${arredPips(beOffsetPips)}p) aos ${lucroPips.toFixed(0)}p · ${cfg.slug}`
    }
  }

  // ── trailing ───────────────────────────────────────────────────────────────
  const inicio = trailingInicioPips
  if (inicio != null && inicio > 0 && lucroPips >= inicio - 1e-9) {
    const distanciaPips = cfg.trailingDistanciaPips != null && cfg.trailingDistanciaPips > 0
      ? cfg.trailingDistanciaPips
      : riscoPips > 0 ? riscoPips * cfg.trailingFracaoDoRisco : 0
    if (distanciaPips > 0) {
      const candidato = precoDaCorretora(preco - sentido * distanciaPips * pip, pos.symbol)!
      const passo = (cfg.trailingPassoPips && cfg.trailingPassoPips > 0 ? cfg.trailingPassoPips : PASSO_TRAILING_PADRAO_PIPS) * pip
      // O trailing só ganha ao BE deste mesmo tick se for mais apertado.
      const referencia = sl != null ? sl : slBase
      const melhora = referencia == null ? true : (candidato - referencia) * sentido >= (sl != null ? 1e-12 : passo - 1e-12)
      if (melhora) {
        sl = candidato
        motivo = 'trailing'
        nota = `${pos.symbol}: trailing → stop ${candidato} (${lucroPips.toFixed(0)}p de lucro) · ${cfg.slug}`
      }
    }
  }

  if (sl == null) return { sl: null, motivo: null, nota: null, estado: e, lucroPips }
  return { sl, motivo, nota, estado: { ...e, slPretendido: sl, ultimaEm: agora }, lucroPips }
}
