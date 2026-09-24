/**
 * AS OPÇÕES DE ADMIN DE UMA ESTRATÉGIA — a regra, uma só vez.
 *
 * `mtmauto_providers` guarda o que a estratégia faz: se está listada, se executa, com que risco
 * por omissão, o mínimo de stop, o trailing, o break-even, o tecto de trades por dia e os
 * símbolos que deixa passar. Isto escrevia-se num único sítio — o admin da MTM Auto — e o admin do
 * site só sabia ler e mandar a pessoa para lá.
 *
 * Agora escreve-se nos dois: `/definicoes/admin` na MTM Auto e `/admin/centro?s=estrategias` no
 * site. Para não haver duas versões da mesma regra, a normalização e a validação vivem AQUI, e os
 * dois ecrãs só desenham os campos que este ficheiro descreve.
 *
 * ── Cópia entre repositórios ────────────────────────────────────────────────────────────────
 * Este ficheiro existe IGUAL nos dois repositórios (não há pacote partilhado). Mudá-lo num obriga
 * a copiar para o outro.
 *
 * O que NÃO está aqui: as colunas da CONTA (login, servidor, conta MTM Funded, TradeLocker, chave
 * da equipa) e a fonte de execução (mestre/espelho). Essas só se escrevem pelas rotas de ligação e
 * pela função da base que troca a fonte numa transacção — passá-las por aqui era dar-lhes uma
 * segunda porta sem as verificações delas.
 */

export type TipoCampo = 'interruptor' | 'numero' | 'lista'

export interface CampoOpcao {
  /** a coluna, tal e qual, em `mtmauto_providers` */
  chave: ChaveOpcao
  rotulo: string
  nota: string
  tipo: TipoCampo
  min?: number
  max?: number
  passo?: number
}

export type ChaveOpcao =
  | 'ativo'
  | 'espelhar'
  | 'sl_minimo_pips'
  | 'trailing_arranca_pips'
  | 'trailing_distancia_pips'
  | 'trailing_passo_pips'
  | 'trailing_tempo_real'
  | 'risco_default_pct'
  | 'be_gatilho'
  | 'max_trades_dia'
  | 'simbolos_permitidos'

export interface OpcoesEstrategia {
  ativo: boolean
  espelhar: boolean
  sl_minimo_pips: number | null
  trailing_arranca_pips: number | null
  trailing_distancia_pips: number | null
  trailing_passo_pips: number | null
  trailing_tempo_real: boolean
  risco_default_pct: number | null
  be_gatilho: number | null
  max_trades_dia: number | null
  simbolos_permitidos: string[] | null
}

/** O break-even é um ALVO (TP1/TP2/TP3), não um número de pips. Fora disto não existe. */
export const BE_GATILHO_MIN = 1
export const BE_GATILHO_MAX = 3

/**
 * Os campos, pela ordem em que se lêem: primeiro o que liga e desliga, depois o que o motor faz.
 *
 * `ativo` e `espelhar` são DOIS interruptores de propósito: uma estratégia pode estar visível no
 * catálogo sem estar a executar. Juntá-los num só foi como, no MTM, o Forex Swings entrou
 * rotulado de Premium e abriu nas contas de toda a gente.
 */
export const CAMPOS_OPCOES: CampoOpcao[] = [
  {
    chave: 'ativo', tipo: 'interruptor', rotulo: 'Listada no catálogo',
    nota: 'Aparece na lista de estratégias dos clientes. Listar não é executar.',
  },
  {
    chave: 'espelhar', tipo: 'interruptor', rotulo: 'A executar (espelhar)',
    nota: 'O caminho antigo do MTM Auto abre as trades desta estratégia nas contas de quem a segue.',
  },
  {
    chave: 'sl_minimo_pips', tipo: 'numero', min: 0, max: 500, passo: 0.1, rotulo: 'Stop mínimo (pips)',
    nota: 'Alarga stops apertados demais para serem negociáveis. Nunca aperta o que o trader escreveu.',
  },
  {
    chave: 'trailing_arranca_pips', tipo: 'numero', min: 0, max: 2000, passo: 0.1, rotulo: 'Trailing arranca a (pips)',
    nota: 'Vazio usa uma fracção do risco em vez de um número fixo.',
  },
  {
    chave: 'trailing_distancia_pips', tipo: 'numero', min: 0, max: 2000, passo: 0.1, rotulo: 'Distância do trailing (pips)',
    nota: 'Distância fixa atrás do preço. Vazio usa uma fracção do risco.',
  },
  {
    chave: 'trailing_passo_pips', tipo: 'numero', min: 0, max: 2000, passo: 0.1, rotulo: 'Passo do trailing (pips)',
    nota: 'Quanto o stop tem de melhorar antes de o mexermos. Evita martelar a corretora.',
  },
  {
    chave: 'trailing_tempo_real', tipo: 'interruptor', rotulo: 'Trailing segue o preço ao vivo',
    nota: 'Lê o tick do motor em cada passagem em vez do instantâneo da posição — devolve menos nos recuos.',
  },
  {
    chave: 'risco_default_pct', tipo: 'numero', min: 0, max: 100, passo: 0.05, rotulo: 'Risco por omissão (%)',
    nota: 'O que cada copiador herda ao seguir. Ele pode mudar depois; isto é o ponto de partida.',
  },
  {
    chave: 'be_gatilho', tipo: 'numero', min: BE_GATILHO_MIN, max: BE_GATILHO_MAX, passo: 1, rotulo: 'Break-even no alvo (TP)',
    nota: '1, 2 ou 3 — o alvo a partir do qual o stop vai para a entrada.',
  },
  {
    chave: 'max_trades_dia', tipo: 'numero', min: 0, max: 200, passo: 1, rotulo: 'Máximo de trades por dia',
    nota: 'Tecto por estratégia. Vazio é sem tecto.',
  },
  {
    chave: 'simbolos_permitidos', tipo: 'lista', rotulo: 'Símbolos permitidos',
    nota: 'Separados por vírgula. Vazio deixa passar tudo o que a fonte mandar.',
  },
]

export const CHAVES_OPCOES: ChaveOpcao[] = CAMPOS_OPCOES.map((c) => c.chave)

// ── leitura ──────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Uma linha de `mtmauto_providers` → as opções, sem nada por adivinhar. */
export function lerOpcoes(linha: Record<string, unknown> | null | undefined): OpcoesEstrategia {
  const l = linha ?? {}
  return {
    ativo: l.ativo === true,
    espelhar: l.espelhar === true,
    sl_minimo_pips: num(l.sl_minimo_pips),
    trailing_arranca_pips: num(l.trailing_arranca_pips),
    trailing_distancia_pips: num(l.trailing_distancia_pips),
    trailing_passo_pips: num(l.trailing_passo_pips),
    trailing_tempo_real: l.trailing_tempo_real === true,
    risco_default_pct: num(l.risco_default_pct),
    be_gatilho: num(l.be_gatilho),
    max_trades_dia: num(l.max_trades_dia),
    simbolos_permitidos: lerSimbolos(l.simbolos_permitidos),
  }
}

/** Símbolos em maiúsculas, sem espaços nem vazios. Aceita a lista ou o texto com vírgulas. */
export function lerSimbolos(v: unknown): string[] | null {
  const cru = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null
  if (!cru) return null
  const l = cru.map((x) => String(x).toUpperCase().trim()).filter(Boolean)
  return l.length ? l : null
}

// ── escrita ──────────────────────────────────────────────────────────────────────────────────

export interface ErroOpcao { campo: ChaveOpcao; erro: string }

/**
 * As opções pedidas pelo browser → o que se grava, ou os erros.
 *
 * Nunca lança: quem chama devolve os erros ao admin. Um campo que não venha no pedido MANTÉM o
 * que já estava (`antes`) — gravar `null` no que não foi tocado apagava afinações sem ninguém
 * pedir, que é como um mínimo de stop desaparece e a estratégia deixa de abrir.
 */
export function normalizarOpcoes(
  pedido: Record<string, unknown>,
  antes?: Record<string, unknown> | null,
): { ok: true; opcoes: OpcoesEstrategia } | { ok: false; erros: ErroOpcao[] } {
  const base = lerOpcoes(antes)
  const erros: ErroOpcao[] = []
  const temCampo = (k: ChaveOpcao) => Object.prototype.hasOwnProperty.call(pedido, k)

  const bool = (k: ChaveOpcao, omissao: boolean): boolean => (temCampo(k) ? pedido[k] === true : omissao)

  const numeroDe = (k: ChaveOpcao, omissao: number | null): number | null => {
    if (!temCampo(k)) return omissao
    const v = pedido[k]
    if (v == null || v === '') return null
    const n = Number(v)
    const campo = CAMPOS_OPCOES.find((c) => c.chave === k)!
    if (!Number.isFinite(n)) { erros.push({ campo: k, erro: `${campo.rotulo}: tem de ser um número.` }); return omissao }
    if (campo.min != null && n < campo.min) { erros.push({ campo: k, erro: `${campo.rotulo}: mínimo ${campo.min}.` }); return omissao }
    if (campo.max != null && n > campo.max) { erros.push({ campo: k, erro: `${campo.rotulo}: máximo ${campo.max}.` }); return omissao }
    return n
  }

  const opcoes: OpcoesEstrategia = {
    ativo: bool('ativo', base.ativo),
    espelhar: bool('espelhar', base.espelhar),
    sl_minimo_pips: numeroDe('sl_minimo_pips', base.sl_minimo_pips),
    trailing_arranca_pips: numeroDe('trailing_arranca_pips', base.trailing_arranca_pips),
    trailing_distancia_pips: numeroDe('trailing_distancia_pips', base.trailing_distancia_pips),
    trailing_passo_pips: numeroDe('trailing_passo_pips', base.trailing_passo_pips),
    trailing_tempo_real: bool('trailing_tempo_real', base.trailing_tempo_real),
    risco_default_pct: numeroDe('risco_default_pct', base.risco_default_pct),
    be_gatilho: numeroDe('be_gatilho', base.be_gatilho),
    max_trades_dia: numeroDe('max_trades_dia', base.max_trades_dia),
    simbolos_permitidos: temCampo('simbolos_permitidos') ? lerSimbolos(pedido.simbolos_permitidos) : base.simbolos_permitidos,
  }
  // O gatilho de break-even é um alvo inteiro: 1,5 não existe em lado nenhum do motor.
  if (opcoes.be_gatilho != null) opcoes.be_gatilho = Math.round(opcoes.be_gatilho)

  return erros.length ? { ok: false, erros } : { ok: true, opcoes }
}

/**
 * O que muda entre o que está gravado e o que se pediu — para a auditoria e para a mensagem ao
 * admin. Sem isto, «gravado» não diz o que é que foi gravado.
 */
export function diferencasOpcoes(antes: OpcoesEstrategia, depois: OpcoesEstrategia): Array<{ campo: ChaveOpcao; antes: unknown; depois: unknown }> {
  const iguais = (a: unknown, b: unknown) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : a === b)
  return CHAVES_OPCOES
    .filter((k) => !iguais(antes[k], depois[k]))
    .map((k) => ({ campo: k, antes: antes[k], depois: depois[k] }))
}

/** «A executar (espelhar): não → sim» — a mudança dita por extenso. */
export function textoDiferenca(d: { campo: ChaveOpcao; antes: unknown; depois: unknown }): string {
  const rotulo = CAMPOS_OPCOES.find((c) => c.chave === d.campo)?.rotulo ?? d.campo
  const v = (x: unknown) => (x === true ? 'sim' : x === false ? 'não' : x == null ? '—' : Array.isArray(x) ? x.join(', ') : String(x))
  return `${rotulo}: ${v(d.antes)} → ${v(d.depois)}`
}
