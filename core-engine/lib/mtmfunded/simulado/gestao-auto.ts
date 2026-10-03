/**
 * GESTÃO AUTOMÁTICA NUM TOQUE — Auto BE, Auto Trailing Stop e «Trailing já» nas posições do WebTrader.
 *
 * Puro (sem React, sem Supabase): o ecrã decide com isto que pedido `gestao` enviar e o que mostrar;
 * quem EXECUTA é o motor do VPS com `decidirGestao` (avancadas.ts), nas colunas que já existem em
 * funded_positions (`be_gatilho`, `be_offset`, `trailing_ativacao`, `trailing_distancia`).
 *
 * UNIDADES. O trader pensa em pips/pontos; a base guarda distâncias em PREÇO. A unidade segue a
 * convenção da casa (lib/mtmcopy/trade-outcome.ts): ouro em pips de 0,1, forex em pips do par,
 * índices e cripto em PONTOS (1,0). O `pip_size` do catálogo não serve para índices e cripto — lá
 * vale 0,01 e «30 pips» no US30 seriam 0,30 de preço.
 *
 * OS VALORES POR DEFEITO, por classe:
 *  · ouro (XAU): BE a +30 pips com +2 de folga; trailing arranca a +50 e segue a 30 — os números
 *    do Premium (gatilho 3,00 / offset 0,20 / trailing 5,00) arredondados para o trader manual;
 *  · forex: BE a +15 pips (+1), trailing arranca a +20 e segue a 15;
 *  · índices e restantes metais/energia/acções: proporcionais ao preço (0,15% / 0,015% / 0,25% /
 *    0,15%) — 30 pontos são uma eternidade no US500 e nada no US30;
 *  · cripto: o dobro (0,3% / 0,03% / 0,5% / 0,3%) — o BTC mexe mais do que um índice.
 *   Sem preço, caem em números fixos da classe.
 *
 * REGRAS dos pedidos:
 *  · um pedido `gestao` substitui a gestão inteira da posição, por isso cada botão parte da gestão
 *    ACTUAL e só mexe no seu bloco (os TPs parciais e o outro bloco ficam como estavam);
 *  · a folga do BE tem de ser menor do que o gatilho (validarGestao recusa o contrário);
 *  · «Trailing já» = trailing sem ativação: o motor põe o SL à distância do preço no tick seguinte
 *    (só se isso APERTAR o SL — nunca o alarga).
 */
import { pipSizeForSymbol } from '../../mtmcopy/trade-outcome'
import type { Direcao } from './matematica'
import { type Gestao, passoTrailing } from './avancadas'

export type ClasseGestao = 'ouro' | 'forex' | 'indice' | 'cripto' | 'outro'

/** Os quatro números dos botões, em pips/pontos (a unidade de `unidadeGestao`). */
export interface ValoresGestao {
  beGatilho: number
  beOffset: number
  trailAtivacao: number
  trailDistancia: number
}

export interface UnidadeGestao {
  /** Quanto vale 1 pip/ponto em preço. */
  tamanho: number
  nome: 'pips' | 'pontos'
}

/** O mínimo que o motor precisa de saber do símbolo. `classe` é a do catálogo (funded_symbols). */
export interface SimboloGestao {
  symbol: string
  classe?: string | null
  digits: number
  pip_size?: number | null
}

const CRIPTO = /^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|AVAX|LINK|DOT|MATIC|LTC|TRX|SHIB|KAS|NEAR|ATOM|APT|ARB|OP|SUI|TON|PEPE|INJ|FIL|ICP|HBAR|VET|RNDR|IMX|TIA|SEI|JUP|WIF|BONK|ONDO)/

/** A classe para a gestão. Com a classe do catálogo manda ela; sem ela (contas da corretora), o nome. */
export function classeGestao(s: Pick<SimboloGestao, 'symbol' | 'classe'>): ClasseGestao {
  const nome = String(s.symbol ?? '').toUpperCase()
  if (/XAU|GOLD/.test(nome)) return 'ouro'
  const c = String(s.classe ?? '').toLowerCase()
  if (c === 'forex') return 'forex'
  if (c === 'indice') return 'indice'
  if (c === 'cripto') return 'cripto'
  if (c) return 'outro'
  if (CRIPTO.test(nome)) return 'cripto'
  const letras = nome.replace(/[^A-Z]/g, '')
  if (letras.length === 6 && !/^(XAG|XPT|XPD)/.test(letras)) return 'forex'
  if (/^(XAG|XPT|XPD|USOIL|UKOIL|WTI|BRENT|NGAS)/.test(letras)) return 'outro'
  return 'indice'
}

export function unidadeGestao(s: SimboloGestao): UnidadeGestao {
  const classe = classeGestao(s)
  if (classe === 'indice' || classe === 'cripto') return { tamanho: 1, nome: 'pontos' }
  if (classe === 'ouro') return { tamanho: 0.1, nome: 'pips' }
  if (classe === 'forex') {
    const p = Number(s.pip_size)
    return { tamanho: p > 0 ? p : pipSizeForSymbol(s.symbol), nome: 'pips' }
  }
  // Prata, energia, acções: o pip do catálogo (0,01) ou a convenção da casa.
  const p = Number(s.pip_size)
  const convencao = pipSizeForSymbol(s.symbol)
  return { tamanho: convencao !== 1 ? convencao : p > 0 ? p : 0.01, nome: 'pips' }
}

/** Números «de gente»: 152 → 150; 66,3 → 66; 8,72 → 8,7; 0,87 → 0,9; 0,00117 → 0,0012. */
export function arredondarBonito(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return 0
  if (n >= 100) return Math.round(n / 5) * 5
  if (n >= 10) return Math.round(n)
  if (n >= 1) return Math.round(n * 10) / 10
  const casas = Math.max(0, 1 - Math.floor(Math.log10(n)))
  const f = Math.pow(10, casas)
  return Math.round(n * f) / f
}

const FIXOS: Record<ClasseGestao, ValoresGestao> = {
  ouro: { beGatilho: 30, beOffset: 2, trailAtivacao: 50, trailDistancia: 30 },
  forex: { beGatilho: 15, beOffset: 1, trailAtivacao: 20, trailDistancia: 15 },
  indice: { beGatilho: 30, beOffset: 3, trailAtivacao: 50, trailDistancia: 30 },
  cripto: { beGatilho: 150, beOffset: 15, trailAtivacao: 250, trailDistancia: 150 },
  outro: { beGatilho: 15, beOffset: 1, trailAtivacao: 20, trailDistancia: 15 },
}

/** Fracções do preço para as classes proporcionais: [BE, folga, ativação, distância]. */
const PROPORCAO: Partial<Record<ClasseGestao, [number, number, number, number]>> = {
  indice: [0.0015, 0.00015, 0.0025, 0.0015],
  outro: [0.0015, 0.00015, 0.0025, 0.0015],
  cripto: [0.003, 0.0003, 0.005, 0.003],
}

/** Os valores por defeito do símbolo, em pips/pontos. `preco` = o preço de agora (opcional). */
export function valoresPorDefeito(s: SimboloGestao, preco?: number | null): ValoresGestao {
  const classe = classeGestao(s)
  const prop = PROPORCAO[classe]
  if (!prop || preco == null || !(preco > 0)) return { ...FIXOS[classe] }
  const u = unidadeGestao(s)
  const [be, off, at, di] = prop.map((f) => arredondarBonito((preco * f) / u.tamanho))
  return { beGatilho: be, beOffset: off < be ? off : 0, trailAtivacao: at, trailDistancia: di }
}

/** Valores escritos à mão → válidos (números positivos, folga < gatilho). null se não servirem. */
export function validarValores(v: Partial<Record<keyof ValoresGestao, unknown>>): ValoresGestao | null {
  const n = (x: unknown) => { const k = typeof x === 'string' ? Number(x.replace(',', '.')) : Number(x); return Number.isFinite(k) ? k : NaN }
  const out = { beGatilho: n(v.beGatilho), beOffset: n(v.beOffset), trailAtivacao: n(v.trailAtivacao), trailDistancia: n(v.trailDistancia) }
  if (!(out.beGatilho > 0) || !(out.trailDistancia > 0)) return null
  if (!(out.beOffset >= 0) || out.beOffset >= out.beGatilho) return null
  if (!(out.trailAtivacao >= 0)) return null
  return out
}

const arredPreco = (x: number, digits: number) => { const f = Math.pow(10, digits); return Math.round(x * f) / f }

/** pips/pontos → preço, arredondado às casas do símbolo. */
export function emPreco(s: SimboloGestao, unidades: number): number {
  return arredPreco(unidades * unidadeGestao(s).tamanho, s.digits)
}

/** preço → pips/pontos (1 casa, ou mais nos cripto baratos). */
export function emUnidades(s: SimboloGestao, preco: number | null | undefined): number | null {
  if (preco == null || !Number.isFinite(preco)) return null
  const u = preco / unidadeGestao(s).tamanho
  return Math.abs(u) >= 1 ? Math.round(u * 10) / 10 : Number(u.toPrecision(3))
}

/** Onde fica o SL depois do break-even: entrada + folga, a favor. */
export function nivelBreakEven(direcao: Direcao, entrada: number, offsetPreco: number, digits: number): number {
  return arredPreco(entrada + (direcao === 'buy' ? 1 : -1) * Math.max(0, offsetPreco), digits)
}

/** Onde o trailing põe o SL com este preço de fecho (bid na compra, ask na venda). */
export function nivelTrailing(direcao: Direcao, precoFecho: number, distanciaPreco: number, digits: number): number {
  return arredPreco(precoFecho - (direcao === 'buy' ? 1 : -1) * distanciaPreco, digits)
}

/** O preço (de fecho) a que o gatilho dispara: entrada + gatilho, a favor. */
export function precoDoGatilho(direcao: Direcao, entrada: number, gatilhoPreco: number, digits: number): number {
  return arredPreco(entrada + (direcao === 'buy' ? 1 : -1) * gatilhoPreco, digits)
}

export interface EstadoGestaoAuto {
  be: 'off' | 'armado' | 'feito'
  /** 'auto' = arranca na ativação; 'ja' = sem ativação (a seguir desde já). */
  trailingModo: 'off' | 'auto' | 'ja'
  /** 'a_espera' = auto, com o preço ainda antes da ativação. */
  trailing: 'off' | 'a_espera' | 'ativo'
}

export function estadoGestaoAuto(g: Gestao, direcao: Direcao, entrada: number, precoFecho: number | null): EstadoGestaoAuto {
  const be: EstadoGestaoAuto['be'] = g.be_feito ? 'feito' : g.be_gatilho || g.be_no_tp1 ? 'armado' : 'off'
  if (!g.trailing_distancia) return { be, trailingModo: 'off', trailing: 'off' }
  if (!g.trailing_ativacao) return { be, trailingModo: 'ja', trailing: 'ativo' }
  const favor = precoFecho == null ? null : (precoFecho - entrada) * (direcao === 'buy' ? 1 : -1)
  return { be, trailingModo: 'auto', trailing: favor != null && favor >= g.trailing_ativacao - 1e-12 ? 'ativo' : 'a_espera' }
}

/** O pedido `gestao` (distâncias em preço) que mantém tudo o que a posição já tem. */
export type PedidoGestao = {
  trailing_distancia: number | null
  trailing_ativacao: number | null
  be_gatilho: number | null
  be_offset: number
  be_no_tp1: boolean
  tps: Array<{ preco: number; pct: number; atingido: boolean }>
}

export function pedidoDaGestao(g: Gestao): PedidoGestao {
  return {
    trailing_distancia: g.trailing_distancia, trailing_ativacao: g.trailing_ativacao,
    be_gatilho: g.be_gatilho, be_offset: g.be_offset || 0, be_no_tp1: g.be_no_tp1,
    tps: (g.tps ?? []).map((t) => ({ preco: t.preco, pct: t.pct, atingido: t.atingido })),
  }
}

/** Liga/desliga o Auto BE. Ligar usa os valores dados; desligar limpa gatilho, «no TP1» e folga. */
export function pedidoAutoBe(g: Gestao, ligar: boolean, s: SimboloGestao, v: ValoresGestao): PedidoGestao {
  const p = pedidoDaGestao(g)
  if (!ligar) return { ...p, be_gatilho: null, be_no_tp1: false, be_offset: 0 }
  const gatilho = emPreco(s, v.beGatilho)
  const folga = emPreco(s, v.beOffset)
  return { ...p, be_gatilho: gatilho > 0 ? gatilho : null, be_offset: folga < gatilho ? folga : 0 }
}

/** Liga/desliga o Auto Trailing Stop (arranca na ativação e segue à distância). */
export function pedidoAutoTrailing(g: Gestao, ligar: boolean, s: SimboloGestao, v: ValoresGestao): PedidoGestao {
  const p = pedidoDaGestao(g)
  if (!ligar) return { ...p, trailing_distancia: null, trailing_ativacao: null }
  const at = emPreco(s, v.trailAtivacao)
  return { ...p, trailing_distancia: distanciaTrailing(s, v), trailing_ativacao: at > 0 ? at : null }
}

/** «Ativar Trailing Stop»: trailing sem ativação — segue desde já, à distância dada. */
export function pedidoTrailingJa(g: Gestao, s: SimboloGestao, v: ValoresGestao): PedidoGestao {
  return { ...pedidoDaGestao(g), trailing_distancia: distanciaTrailing(s, v), trailing_ativacao: null }
}

/** A distância do trailing em preço — nunca abaixo de 1 pip do catálogo (o mínimo do motor). */
export function distanciaTrailing(s: SimboloGestao, v: ValoresGestao): number {
  return Math.max(emPreco(s, v.trailDistancia), Number(s.pip_size) > 0 ? Number(s.pip_size) : 0)
}

/**
 * O que o «Trailing já» faz ao SL no próximo preço: o nível, e se mexe (só aperta, aos saltos de
 * `passoTrailing`, como o motor). `passoMinimo` = pip do catálogo (é o que o motor usa).
 */
export function previsaoTrailingJa(
  direcao: Direcao, precoFecho: number, sl: number | null, distanciaPreco: number, digits: number, passoMinimo: number,
): { nivel: number; mexe: boolean } {
  const nivel = nivelTrailing(direcao, precoFecho, distanciaPreco, digits)
  if (sl == null) return { nivel, mexe: true }
  const passo = passoTrailing({ pip_size: passoMinimo } as never, distanciaPreco)
  return { nivel, mexe: (nivel - sl) * (direcao === 'buy' ? 1 : -1) >= passo - 1e-12 }
}
