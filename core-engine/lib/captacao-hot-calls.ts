/**
 * AS CHAMADAS QUENTES — quem vale a pena ligar hoje, e a razão para lhe ligar.
 *
 * PORQUE É QUE ISTO EXISTE, E O QUE NÃO É
 * O radar do Instagram tem 570 linhas e ZERO pessoas: são publicações — media_id, hashtag,
 * legenda. A API do Instagram não devolve o autor numa pesquisa por hashtag, e raspar o perfil não
 * é caminho. Chamar-lhes leads fazia a captação parecer ter 600 contactos e ter, de facto, cerca
 * de 180. Este ficheiro não tenta transformar publicações em pessoas: trabalha com as pessoas que
 * existem mesmo.
 *
 * E existem: 92 telefones na rede de IBs (27 em contas que vale a pena trazer), 15 no pipeline,
 * 16 nos perfis. Gente com número e com motivo.
 *
 * A REGRA QUE DEFINE UMA CHAMADA QUENTE
 * Duas coisas, e as duas obrigatórias:
 *   1. um NÚMERO — uma chamada sem número não é uma chamada;
 *   2. um MOTIVO concreto, feito dos factos daquela pessoa.
 *
 * O motivo não é enfeite. «Ligar ao Nuno» adia-se; «o Nuno negoceia 154 lotes na Hantec e a
 * comissão disso está a ser paga a outra casa» não se adia com a mesma facilidade. É a mesma razão
 * por que as tarefas do dia trazem o porquê — ver `backoffice-dia-regras.ts`.
 *
 * PURO de propósito: sem base de dados, sem telefone, sem IA. Recebe factos, devolve uma decisão.
 */

export type FonteDaChamada = 'corretora' | 'pipeline' | 'perfil'

export interface FactosDaPessoa {
  nome: string
  telefone: string | null
  fonte: FonteDaChamada
  /** Lotes negociados noutra corretora. O sinal mais forte que existe: já opera. */
  lotesNoutraCasa?: number | null
  /** Comissão que essa outra casa recebe pelo que a pessoa negoceia. */
  comissaoNoutraCasa?: number | null
  /** Abriu conta na nossa corretora (broker_uid). Já deu o passo mais difícil. */
  temContaNaCorretora?: boolean
  /** Registou-se no site e nunca activou nada. */
  registadoSemActivar?: boolean
  /** Interesse declarado por ela própria, em palavras. */
  interesse?: string | null
  /** Dias desde o último contacto. Sem contacto nenhum, `null`. */
  diasSemContacto?: number | null
}

export interface ChamadaQuente {
  nome: string
  telefone: string
  fonte: FonteDaChamada
  /** 0-100. Serve para ordenar o dia, não para decidir se se liga. */
  pontuacao: number
  /**
   * Os lotes que a pessoa negoceia noutra casa.
   *
   * Está aqui por duas razões. Uma é para quem liga saber com quem vai falar. A outra é o
   * desempate: com a escala achatada de propósito (para um gigante não engolir a lista), duas
   * pessoas com volumes diferentes podem dar a mesma pontuação — e aí ordenar por nome é
   * arbitrário. Quem negoceia mais vem primeiro.
   */
  lotes: number
  /** Porque é que esta chamada é hoje, em palavras que quem liga pode usar. */
  motivo: string
}

// ── Pesos ────────────────────────────────────────────────────────────────────

/**
 * Quanto vale cada sinal.
 *
 * O peso maior é o de JÁ NEGOCIAR noutra casa, e é de propósito: essa pessoa não precisa de ser
 * convencida de que o trading existe, nem de que vale a pena abrir conta. Já fez as duas coisas.
 * O que falta é mudar uma conta de sítio — é a conversa mais curta que há nesta casa.
 *
 * A seguir vem ter conta na nossa corretora e não estar activo: deu o passo mais difícil e parou
 * no mais fácil, e muitas vezes basta perguntar porquê.
 */
export const PESO_NEGOCEIA_FORA = 45
export const PESO_CONTA_NA_CORRETORA = 25
export const PESO_REGISTADO_SEM_ACTIVAR = 12
export const PESO_INTERESSE_DECLARADO = 10
/** O esquecimento também é um sinal: quem ficou sem resposta há muito está a arrefecer. */
export const PESO_ESQUECIDO = 8
export const DIAS_PARA_ESQUECIDO = 14

/** Acima de quantos lotes é que «negoceia» passa a ser «negoceia a sério». */
export const LOTES_RELEVANTES = 10

export function pontuacaoDaChamada(f: FactosDaPessoa): number {
  let p = 0

  const lotes = Number(f.lotesNoutraCasa ?? 0)
  if (lotes > 0) {
    // Uma escala que não deixa um gigante engolir a lista: 10 lotes já contam quase tudo, e 500
    // não valem cinquenta vezes mais. Quem negoceia é quem interessa — quanto, desempata.
    p += PESO_NEGOCEIA_FORA * Math.min(1, Math.log10(1 + lotes) / Math.log10(1 + LOTES_RELEVANTES * 5))
  }
  if (Number(f.comissaoNoutraCasa ?? 0) > 0) p += 5
  if (f.temContaNaCorretora) p += PESO_CONTA_NA_CORRETORA
  if (f.registadoSemActivar) p += PESO_REGISTADO_SEM_ACTIVAR
  if ((f.interesse ?? '').trim()) p += PESO_INTERESSE_DECLARADO
  if ((f.diasSemContacto ?? 0) >= DIAS_PARA_ESQUECIDO) p += PESO_ESQUECIDO

  return Math.round(Math.min(100, p))
}

/**
 * O MOTIVO, construído só com o que se sabe desta pessoa.
 *
 * Nada aqui é inventado e nada aqui se diz ao cliente tal e qual. Isto é para quem LIGA — é o que
 * ele lê antes de marcar o número, para saber com quem vai falar. Dizer a alguém «sei que pagas
 * 348 USD de comissão à Hantec» assusta mais do que aproxima; saber isso antes de ligar é o que
 * faz a conversa valer a pena.
 */
export function motivoDaChamada(f: FactosDaPessoa): string {
  const partes: string[] = []

  const lotes = Number(f.lotesNoutraCasa ?? 0)
  const comissao = Number(f.comissaoNoutraCasa ?? 0)
  if (lotes > 0) {
    partes.push(
      `Negoceia ${lotes.toFixed(2)} lotes noutra corretora` +
        (comissao > 0 ? `, e essa casa recebe ${comissao.toFixed(2)} USD de comissão por isso` : ''),
    )
  }
  if (f.temContaNaCorretora) partes.push('Já tem conta aberta na nossa corretora')
  if (f.registadoSemActivar) partes.push('Registou-se no site e nunca chegou a activar nada')
  if ((f.interesse ?? '').trim()) partes.push(`Disse que procurava: ${String(f.interesse).trim()}`)
  if ((f.diasSemContacto ?? 0) >= DIAS_PARA_ESQUECIDO) {
    partes.push(`Sem contacto há ${f.diasSemContacto} dias`)
  }

  // Nunca se devolve vazio: uma chamada sem razão é uma chamada que se adia.
  if (!partes.length) return 'Tem número e está no pipeline — vale um primeiro contacto por voz.'
  return partes.join('. ') + '.'
}

/**
 * Esta pessoa entra na lista de chamadas?
 *
 * O telefone é obrigatório e não é negociável — sem número não há chamada, e uma linha sem número
 * numa lista de chamadas só ensina quem a usa a desconfiar dela. Um número tem de ter dígitos que
 * cheguem: «-», «N/A» e restos de exportação não são telefones.
 */
export const DIGITOS_MINIMOS = 9

export function telefoneUtil(bruto: string | null | undefined): string | null {
  const s = (bruto ?? '').trim()
  if (!s) return null
  const digitos = s.replace(/\D/g, '')
  if (digitos.length < DIGITOS_MINIMOS) return null
  return s
}

export function chamadaDe(f: FactosDaPessoa): ChamadaQuente | null {
  const telefone = telefoneUtil(f.telefone)
  if (!telefone) return null
  return {
    nome: f.nome,
    telefone,
    fonte: f.fonte,
    pontuacao: pontuacaoDaChamada(f),
    lotes: Number(f.lotesNoutraCasa ?? 0) || 0,
    motivo: motivoDaChamada(f),
  }
}

/**
 * QUANTAS CHAMADAS POR DIA.
 *
 * Seis. Uma chamada boa demora, prepara-se e às vezes repete-se — não é um toque de teclado como
 * uma mensagem. Vinte chamadas numa lista dão zero chamadas feitas, e a lista deixa de se abrir.
 * É a mesma disciplina dos tectos das tarefas (ver `TECTO_DIARIO`).
 */
export const CHAMADAS_POR_DIA = 6

/**
 * O MESMO NÚMERO, ESCRITO DE DUAS MANEIRAS.
 *
 * As exportações de corretora trazem o indicativo (`+351968350028`) e os perfis do site guardam-no
 * sem ele (`968350028`). Comparar os dígitos todos fazia da mesma pessoa duas chamadas — e receber
 * duas chamadas da mesma empresa no mesmo dia é pior do que não receber nenhuma.
 *
 * A regra é a relação verdadeira entre os dois: um número é o mesmo que o outro quando os dígitos
 * de um TERMINAM nos dígitos do outro. Isso apanha o indicativo sem inventar regras por país — e,
 * ao exigir que o mais curto tenha `DIGITOS_MINIMOS`, não junta pessoas diferentes por coincidirem
 * nos últimos quatro algarismos.
 */
export function mesmoNumero(a: string, b: string): boolean {
  const x = a.replace(/\D/g, '')
  const y = b.replace(/\D/g, '')
  if (x.length < DIGITOS_MINIMOS || y.length < DIGITOS_MINIMOS) return false
  return x === y || x.endsWith(y) || y.endsWith(x)
}

/** Ordena e corta. Mesma pessoa em duas fontes conta uma vez — pelo número, que é o que se marca. */
export function chamadasDoDia(
  pessoas: readonly FactosDaPessoa[],
  quantas: number = CHAMADAS_POR_DIA,
): ChamadaQuente[] {
  const juntas: ChamadaQuente[] = []
  for (const p of pessoas) {
    const c = chamadaDe(p)
    if (!c) continue
    // Procura-se uma já junta com o MESMO número, escrito como for — ver `mesmoNumero`.
    const i = juntas.findIndex((j) => mesmoNumero(j.telefone, c.telefone))
    if (i < 0) {
      juntas.push(c)
      continue
    }
    const jaLa = juntas[i]
    // Fica a mais forte: a mesma pessoa pode chegar pela corretora e pelo pipeline, e o motivo da
    // corretora é quase sempre o que dá a conversa.
    if (c.pontuacao > jaLa.pontuacao || (c.pontuacao === jaLa.pontuacao && c.lotes > jaLa.lotes)) {
      juntas[i] = c
    }
  }
  return juntas
    .sort((a, b) => b.pontuacao - a.pontuacao || b.lotes - a.lotes || a.nome.localeCompare(b.nome, 'pt'))
    .slice(0, Math.max(0, quantas))
}

/**
 * A chave da tarefa de chamada. Uma por pessoa e por dia — o resto é insistência, não trabalho.
 *
 * Normaliza pelos ÚLTIMOS dígitos, pela mesma razão de `mesmoNumero`: as exportações de corretora
 * trazem o indicativo e os perfis do site não, e sem isto a mesma pessoa gerava duas tarefas de
 * chamada no mesmo dia. Duas chamadas da mesma empresa no mesmo dia é pior do que nenhuma.
 *
 * Dois números de países diferentes com os mesmos nove algarismos finais colidiriam — nesse caso
 * perde-se UMA tarefa, e isso é melhor do que ligar duas vezes à mesma pessoa.
 */
export function chaveTarefaChamada(telefone: string, dia: string): string {
  const digitos = telefone.replace(/\D/g, '')
  return `chamada:${dia}:${digitos.slice(-DIGITOS_MINIMOS)}`
}
