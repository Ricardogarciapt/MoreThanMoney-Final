/**
 * AS CAIXAS DO DOMÍNIO — as decisões, sem rede e sem base de dados.
 *
 * ═══ O QUE PODE CORRER MAL AQUI, E PORQUE É QUE NÃO SE VÊ ══════════════════════════════════
 *
 * Criar endereços de correio parece trivial até ao dia em que um deles come o servidor. Os três
 * erros que este ficheiro existe para travar não dão erro no ecrã de quem os comete:
 *
 *  1. **O CICLO.** Reencaminhar `suporte@morethanmoney.pt` para `geral@morethanmoney.pt`, que por
 *     sua vez reencaminha para outro lado do mesmo domínio. Cada mensagem passa a ser copiada em
 *     volta até o servidor cortar — e servidores que cortam ciclos marcam o domínio. Um fim-de-
 *     semana disto e o `morethanmoney.pt` deixa de entregar em lado nenhum, incluindo a
 *     recuperação de password dos clientes. NUNCA se reencaminha para o próprio domínio.
 *  2. **O ENDEREÇO DE SISTEMA.** `sistema@`, `sem-email@` e companhia não são endereços: são
 *     valores que o código escreve em colunas quando não há email de verdade. Criar caixas com
 *     esses nomes faz o correio de ninguém aterrar algures, e pior — faz alguém acreditar que
 *     alguém os lê.
 *  3. **A LICENÇA QUE NÃO EXISTE.** O Zoho tem um número fixo de caixas pagas. Pedir a criação de
 *     uma acima do limite falha DO LADO DELE, com uma mensagem em inglês no meio de um JSON. O
 *     ecrã tem de saber contar antes de pedir.
 *
 * Puro porque nada disto precisa de rede para ser decidido — e porque um erro aqui não rebenta:
 * cria um endereço a mais, ou um ciclo que só se nota quando a caixa tem dez mil mensagens.
 */

/** O domínio desta casa. Não é configurável porque a decisão do ciclo depende de o saber. */
export const DOMINIO = 'morethanmoney.pt'

/**
 * Os nomes que NUNCA podem virar caixa nem alias.
 *
 * Vêm da varredura de 30/09 ao repositório: são valores que o código escreve em colunas de email
 * quando não há email nenhum. Ver `docs/correio-dominio.md`.
 */
export const NOMES_DE_SISTEMA = ['sistema', 'system', 'sem-email', 'noreply-interno']

/** Os endereços que já existem hoje, criados à mão a 30/09 (a caixa e os aliases dela). */
export const JA_EXISTEM = [
  'geral', 'suporte', 'support', 'funded', 'info', 'admin', 'ceo', 'ricardogarcia', 'noreply',
]

export type TipoDeCaixa = 'caixa' | 'alias'

export interface Caixa {
  endereco: string
  tipo: TipoDeCaixa
  reencaminhar_para?: string | null
  reencaminhar_ativo?: boolean
  user_id?: string | null
  educador_id?: string | null
  estado?: string
}

export interface Veredicto {
  pode: boolean
  /** Sempre escrito, sempre em português, sempre para aparecer no ecrã. */
  porque: string
}

/** minúsculas, sem espaços, sem o domínio repetido. */
export function normalizar(endereco: string): string {
  const v = String(endereco ?? '').trim().toLowerCase().replace(/\s+/g, '')
  return v.endsWith(`@${DOMINIO}`) ? v : v.includes('@') ? v : `${v}@${DOMINIO}`
}

export function parteLocal(endereco: string): string {
  return normalizar(endereco).split('@')[0] ?? ''
}

export function ehDoDominio(endereco: string): boolean {
  return normalizar(endereco).endsWith(`@${DOMINIO}`)
}

/**
 * A parte antes do @.
 *
 * As regras são as que os servidores de correio aceitam na prática, não as da norma — a norma
 * permite aspas e pontos de exclamação, e um endereço desses é um problema para toda a gente que
 * o tiver de escrever à mão ao telefone.
 */
export function localValido(local: string): Veredicto {
  const v = String(local ?? '').trim().toLowerCase()
  if (!v) return { pode: false, porque: 'Falta o nome antes do @.' }
  if (v.length > 64) return { pode: false, porque: 'Nome demasiado comprido (máximo 64 caracteres).' }
  if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(v)) {
    return { pode: false, porque: 'Só letras, números, ponto, hífen e traço baixo — e tem de começar e acabar em letra ou número.' }
  }
  if (v.includes('..')) return { pode: false, porque: 'Dois pontos seguidos não são aceites.' }
  return { pode: true, porque: 'Nome válido.' }
}

/**
 * PODE CRIAR-SE ESTE ENDEREÇO?
 *
 * `licencas` é `{ total, usadas }` do Zoho. Só conta para caixas: um alias não gasta licença, e é
 * por isso que oito dos nove endereços desta casa são aliases.
 */
export function podeCriar(p: {
  local: string
  tipo: TipoDeCaixa
  existentes: string[]
  licencas?: { total: number; usadas: number }
}): Veredicto {
  const v = localValido(p.local)
  if (!v.pode) return v
  const local = p.local.trim().toLowerCase()

  if (NOMES_DE_SISTEMA.includes(local)) {
    return {
      pode: false,
      porque: `«${local}@» é um valor que o código escreve quando não há email nenhum — criar a caixa faria alguém acreditar que há quem a leia.`,
    }
  }

  const jaLa = p.existentes.map((e) => parteLocal(e))
  if (jaLa.includes(local)) {
    return { pode: false, porque: `«${local}@${DOMINIO}» já existe. Um endereço não pode ser caixa e alias ao mesmo tempo.` }
  }

  if (p.tipo === 'caixa' && p.licencas) {
    const livres = Math.max(0, p.licencas.total - p.licencas.usadas)
    if (livres <= 0) {
      return {
        pode: false,
        porque: `Não há licenças livres (${p.licencas.usadas}/${p.licencas.total}). Uma caixa nova exige comprar mais uma — ou cria um alias, que não gasta licença.`,
      }
    }
  }

  return {
    pode: true,
    porque: p.tipo === 'alias'
      ? 'Alias: entra na caixa principal e não gasta licença.'
      : 'Caixa própria: login e inbox separados, gasta uma licença.',
  }
}

/**
 * PODE REENCAMINHAR-SE PARA AQUI?
 *
 * A regra que importa: **nunca para o próprio domínio.** É a única forma de criar um ciclo, e o
 * ciclo não se vê no dia em que se cria — vê-se no dia em que o domínio deixa de entregar.
 */
export function podeReencaminhar(p: { de: string; para: string }): Veredicto {
  const de = normalizar(p.de)
  const para = String(p.para ?? '').trim().toLowerCase()

  if (!para) return { pode: false, porque: 'Falta o endereço de destino.' }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(para)) {
    return { pode: false, porque: 'O destino não parece um endereço de email.' }
  }
  if (para === de) {
    return { pode: false, porque: 'O destino é o próprio endereço — isso é uma mensagem a reencaminhar-se a si própria.' }
  }
  if (ehDoDominio(para)) {
    return {
      pode: false,
      porque: `Não se reencaminha para «${DOMINIO}». Dois endereços da casa a reencaminhar um para o outro copiam cada mensagem em volta até o servidor cortar — e um servidor que corta ciclos marca o domínio inteiro.`,
    }
  }
  return { pode: true, porque: `O correio de ${de} passa a ser entregue também em ${para}.` }
}

/**
 * O endereço que se sugere para uma pessoa.
 *
 * Tira acentos, junta o primeiro nome, e se já existir acrescenta o apelido — em vez de números,
 * que é o que toda a gente faz e ninguém consegue ditar ao telefone.
 */
export function sugerirEndereco(nome: string, existentes: string[] = []): string {
  const limpo = String(nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (limpo.length === 0) return ''
  const jaLa = new Set(existentes.map((e) => parteLocal(e)))

  const primeiro = limpo[0]
  if (!jaLa.has(primeiro)) return primeiro
  if (limpo.length > 1) {
    const comApelido = `${primeiro}.${limpo[limpo.length - 1]}`
    if (!jaLa.has(comApelido)) return comApelido
    const junto = `${primeiro}${limpo[limpo.length - 1]}`
    if (!jaLa.has(junto)) return junto
  }
  return ''
}

/**
 * Quem desta casa ainda não tem endereço do domínio.
 *
 * O ecrã mostra isto como sugestões, nunca cria sozinho: criar uma caixa a alguém sem lhe dizer é
 * criar um sítio onde o correio dessa pessoa vai morrer.
 */
export function quemFaltaCaixa<T extends { id: string; nome: string; email?: string | null }>(
  pessoas: T[],
  caixas: Caixa[],
): Array<T & { sugestao: string; jaTemDoDominio: boolean }> {
  const existentes = caixas.map((c) => c.endereco)
  const ligadas = new Set(
    caixas.flatMap((c) => [c.user_id, c.educador_id].filter(Boolean) as string[]),
  )
  return pessoas
    .filter((p) => !ligadas.has(p.id))
    .map((p) => ({
      ...p,
      // Alguém cujo email JÁ é do domínio (como `mindset@`) é um caso diferente: o endereço existe
      // na base desta casa mas pode nunca ter existido no servidor de correio. Marca-se.
      jaTemDoDominio: Boolean(p.email && ehDoDominio(p.email)),
      sugestao: p.email && ehDoDominio(p.email) ? parteLocal(p.email) : sugerirEndereco(p.nome, existentes),
    }))
}
