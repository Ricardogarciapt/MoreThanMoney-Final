/**
 * AS REGRAS DE UMA ORDEM — puras, UMA vez, para o cliente e para o servidor.
 *
 * Até 05/10 a mesma pergunta («o volume está no passo?», «o SL está do lado certo?», «esta
 * pendente já dispararia?») estava escrita em cinco sítios: no rascunho do ticket (cliente), em
 * `matematica.ts`/`ordens.ts` (motor simulado), em `corretoras/tipos.ts` (contas reais) e em
 * `ticket.ts` (ticket real). Cinco cópias da mesma regra acabam sempre por discordar — e aí o
 * ticket deixa passar o que o servidor recusa (ou pior, ao contrário).
 *
 * Aqui fica a regra; os outros chamam-na. O SERVIDOR continua a validar — é ele que manda e nunca
 * confia no cliente; o cliente só pré-valida com a MESMA função, para o erro aparecer antes de
 * enviar e ser o mesmo erro que o servidor daria.
 *
 * Sem imports: corre no browser, no Node e nas guardas sem base nem rede.
 * Testado em lib/webtrader/__tests__/regras-ordem.check.ts.
 */

export type LadoOrdem = 'buy' | 'sell'
export type TipoPendente = 'limit' | 'stop'

export interface RegraDeVolume {
  min: number
  max: number
  passo: number
}

export type MotivoVolume = 'invalido' | 'abaixo_do_minimo' | 'acima_do_maximo' | 'fora_do_passo'

export type VolumeNormalizado =
  | { ok: true; volume: number }
  | { ok: false; motivo: MotivoVolume; erro: string }

/** Casas decimais que o passo exige (0.01 → 2, 0.1 → 1, 1 → 0), com tecto em 8. */
export function casasDoPasso(passo: number): number {
  if (!(passo > 0)) return 2
  return Math.max(0, Math.min(8, Math.ceil(-Math.log10(passo) - 1e-9)))
}

/** Número de passos entre o volume e o passo (para saber se «está no passo»). */
function passosDe(volume: number, passo: number): number {
  return volume / passo
}

/**
 * O volume ARREDONDADO ao passo, dentro de [min, max].
 *
 * `estrito: true` (o ticket real, onde o trader escreve o lote à mão) recusa um volume fora do
 * passo em vez de o arredondar — escrever 0,015 e ver sair 0,02 é uma surpresa com dinheiro real.
 * Sem `estrito` (o motor simulado e o rascunho, onde o lote vem de contas) arredonda-se ao passo
 * mais próximo e só se recusa o que fica fora dos limites.
 */
export function normalizarVolumeRegra(volume: number, r: RegraDeVolume, opcoes: { estrito?: boolean } = {}): VolumeNormalizado {
  const passo = r.passo > 0 ? r.passo : 0.01
  if (!Number.isFinite(volume) || !(volume > 0)) return { ok: false, motivo: 'invalido', erro: 'volume inválido' }
  const passos = passosDe(volume, passo)
  if (opcoes.estrito && Math.abs(passos - Math.round(passos)) > 1e-6) {
    return { ok: false, motivo: 'fora_do_passo', erro: `o volume tem de ir em passos de ${passo} lotes` }
  }
  const v = Number((Math.round(passos) * passo).toFixed(casasDoPasso(passo)))
  if (v < r.min - 1e-9) return { ok: false, motivo: 'abaixo_do_minimo', erro: `o volume mínimo é ${r.min} lotes` }
  if (r.max > 0 && v > r.max + 1e-9) return { ok: false, motivo: 'acima_do_maximo', erro: `o volume máximo é ${r.max} lotes` }
  return { ok: true, volume: v }
}

/** A frase única de «volume fora dos limites» que o ticket e o motor mostram. */
export function mensagemVolumeForaDosLimites(r: RegraDeVolume): string {
  return `volume fora dos limites (${r.min}–${r.max}, passo ${r.passo})`
}

/**
 * O SL/TP do lado certo da referência (preço de execução, nível da pendente ou preço de fecho
 * numa modificação). Numa compra o stop fica abaixo e o alvo acima; numa venda ao contrário.
 */
export function erroDosNiveis(direcao: LadoOrdem, referencia: number, sl: number | null, tp: number | null): string | null {
  if (sl != null) {
    if (direcao === 'buy' && sl >= referencia) return 'numa compra o stop fica abaixo do preço'
    if (direcao === 'sell' && sl <= referencia) return 'numa venda o stop fica acima do preço'
  }
  if (tp != null) {
    if (direcao === 'buy' && tp <= referencia) return 'numa compra o alvo fica acima do preço'
    if (direcao === 'sell' && tp >= referencia) return 'numa venda o alvo fica abaixo do preço'
  }
  return null
}

/** Ordem pendente: limit compra abaixo / vende acima; stop compra acima / vende abaixo. Já dispara? */
export function pendenteJaDispara(direcao: LadoOrdem, tipo: TipoPendente, nivel: number, preco: { bid: number; ask: number }): boolean {
  const x = direcao === 'buy' ? preco.ask : preco.bid
  if (tipo === 'limit') return direcao === 'buy' ? x <= nivel : x >= nivel
  return direcao === 'buy' ? x >= nivel : x <= nivel
}

/**
 * Uma pendente que já dispararia agora não é pendente — é uma ordem a mercado mal escolhida
 * (buy limit ACIMA do preço, por exemplo). Dizer isso ensina mais do que executá-la.
 */
export function erroDaPendente(direcao: LadoOrdem, tipo: TipoPendente, nivel: number, preco: { bid: number; ask: number } | null): string | null {
  if (!(nivel > 0)) return 'preço da ordem inválido'
  if (!preco || !pendenteJaDispara(direcao, tipo, nivel, preco)) return null
  const lado = tipo === 'limit' ? (direcao === 'buy' ? 'abaixo' : 'acima') : (direcao === 'buy' ? 'acima' : 'abaixo')
  return `uma ${direcao} ${tipo} tem de ficar ${lado} do preço atual`
}

export interface PedidoParaValidar {
  direcao: LadoOrdem
  tipo: 'mercado' | TipoPendente
  volume: number
  regraVolume: RegraDeVolume
  /** Preço da pendente (limit/stop). Ignorado a mercado. */
  preco: number | null
  sl: number | null
  tp: number | null
  /**
   * O preço vivo, quando se sabe. A mercado é a referência dos níveis (ask na compra, bid na
   * venda); numa pendente só serve para recusar a que já dispararia. `null` = valida-se o que dá.
   */
  mercado: { bid: number; ask: number } | null
  /** O ticket real recusa um lote fora do passo em vez de o arredondar. */
  estrito?: boolean
}

export type OrdemValidada =
  | { ok: true; volume: number; referencia: number | null }
  | { ok: false; erro: string; campo: 'volume' | 'preco' | 'sl' | 'tp' }

/**
 * A validação INTEIRA de uma ordem nova — a mesma função no ticket e nas rotas. Margem, regras
 * do programa e travas ficam fora: são do servidor e precisam de ler a conta.
 */
export function validarOrdem(p: PedidoParaValidar): OrdemValidada {
  const v = normalizarVolumeRegra(p.volume, p.regraVolume, { estrito: p.estrito })
  if (!v.ok) return { ok: false, erro: v.motivo === 'invalido' ? v.erro : mensagemVolumeForaDosLimites(p.regraVolume), campo: 'volume' }
  let referencia: number | null
  if (p.tipo === 'mercado') {
    referencia = p.mercado ? (p.direcao === 'buy' ? p.mercado.ask : p.mercado.bid) : null
  } else {
    const nivel = p.preco ?? Number.NaN
    const e = erroDaPendente(p.direcao, p.tipo, nivel, p.mercado)
    if (e) return { ok: false, erro: e, campo: 'preco' }
    referencia = nivel
  }
  if (referencia != null) {
    const eSl = erroDosNiveis(p.direcao, referencia, p.sl, null)
    if (eSl) return { ok: false, erro: eSl, campo: 'sl' }
    const eTp = erroDosNiveis(p.direcao, referencia, null, p.tp)
    if (eTp) return { ok: false, erro: eTp, campo: 'tp' }
  }
  return { ok: true, volume: v.volume, referencia }
}

// ── negociação num clique: uma só confirmação ────────────────────────────────────────────────

export interface DecisaoUmClique {
  /** Abrir a janela «Confirmar?» antes de correr. */
  pedirConfirmacao: boolean
  /** Mostrar «feito @ preço» / o erro, e contar em «a enviar». */
  avisar: boolean
  /** Entrar na protecção contra toques repetidos (800 ms / em curso). */
  protegerRepeticao: boolean
}

/**
 * O QUE UM `executar` FAZ, conforme o contexto.
 *
 * O caso que isto resolve (05/10): o rascunho do ticket chama `executar(…, { confirmar: false })`
 * (a interface já confirmou) e, lá dentro, o trader das contas REAIS volta a chamar
 * `executar(…, { confirmar: true })` com OUTRA descrição. Com o «num clique» desligado apareciam
 * duas janelas de confirmação e dois avisos «feito»; a protecção de 800 ms não apanhava porque
 * as descrições diferem. Um `executar` ANINHADO (a correr dentro de outro) é a mesma acção: corre
 * sem confirmar, sem avisar e sem contar — quem avisa e confirma é o de fora.
 */
export function decidirUmClique(e: { ligado: boolean; confirmar: boolean; aninhado: boolean }): DecisaoUmClique {
  if (e.aninhado) return { pedirConfirmacao: false, avisar: false, protegerRepeticao: false }
  return { pedirConfirmacao: !e.ligado && e.confirmar, avisar: true, protegerRepeticao: true }
}
