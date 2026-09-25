/**
 * MATERIAIS DE DIVULGAÇÃO GERADOS COM IA — com a marca da casa, e com uma rede por baixo.
 *
 * O QUE ISTO É
 * A pessoa da equipa escolhe o tipo de peça (publicação, abordagem, legenda, argumentário), diz
 * sobre o quê, e sai com texto pronto a rever e a usar. É apoio à escrita — não é um agente: não
 * contacta ninguém, não decide nada, não escreve na base.
 *
 * O QUE ISTO NÃO PODE FAZER, E PORQUÊ ESTÁ ESCRITO EM CÓDIGO E NÃO NO PROMPT
 * Hoje encontrámos promessas antigas de «50% recorrente» e «20 000 €/mês» em texto público que
 * nunca fecharam contas nenhumas. Um prompt a dizer «não prometas ganhos» é uma instrução: o modelo
 * cumpre-a quase sempre, e «quase sempre» multiplicado por uma equipa inteira a publicar dá, mais
 * cedo ou mais tarde, uma promessa falsa com a nossa marca em cima.
 *
 * Por isso há DUAS camadas e a segunda é a que manda:
 *
 *  1. O prompt, montado das fontes reais — a escada de `lib/escada-precos.ts`, a regra do bónus, e
 *     a prova MEDIDA de `lib/pips-proof.ts` (e só quando ela é publicável).
 *  2. `revistarMaterial`, que é uma função pura e lê o resultado: TODO o número de dinheiro ou de
 *     percentagem que apareça no texto tem de ser um dos que foram DADOS ao modelo. Um número que
 *     ele tenha inventado não passa — e o texto não chega a ser mostrado.
 *
 * A regra é deliberadamente grosseira: prefere recusar texto bom a deixar passar um número errado.
 * Um material recusado custa um clique; um número inventado numa publicação custa a confiança de
 * quem o leu, e é preciso ir buscá-lo a todo o lado meses depois.
 *
 * NADA DE COMISSÕES AQUI. As percentagens que a equipa recebe vivem em `vendas_regras_comissao` e
 * mudam com decisões do dono. Nenhum destes materiais fala do que se ganha a divulgar: são peças
 * para VENDER a clientes, não para recrutar. Foi uma decisão, não um esquecimento — ver o relatório.
 */
import { escadaNumaLinha, bonusNumaLinha, NOME_DEGRAU_TOPO } from '@/lib/escada-precos'

// ═══════════════════════ Os tipos de peça ═══════════════════════
//
// Fechado de propósito. Um campo livre «o que queres» transformava isto num gerador de texto com a
// marca da MTM colada — e a marca é o que aqui se está a proteger.

export const TIPOS_MATERIAL = [
  {
    chave: 'publicacao',
    nome: 'Publicação',
    descricao: 'Um texto para publicar (Instagram, Facebook, LinkedIn). Gancho, corpo e chamada à ação.',
    instrucao:
      'Escreve UMA publicação para redes sociais: um gancho de uma linha, três a cinco linhas de corpo, e uma chamada à ação clara. Sem hashtags a mais (no máximo cinco, no fim).',
    limite: 700,
  },
  {
    chave: 'abordagem',
    nome: 'Mensagem de abordagem',
    descricao: 'O primeiro contacto por DM ou WhatsApp. Curto, com uma pergunta só.',
    instrucao:
      'Escreve UMA mensagem de primeiro contacto, por mensagem directa. Duas a quatro frases, tom próximo, UMA pergunta só e nenhum link. Não apresentes preços num primeiro contacto: o objectivo é a pessoa responder.',
    limite: 400,
  },
  {
    chave: 'legenda',
    nome: 'Legenda curta',
    descricao: 'A legenda de um vídeo ou de uma imagem que a pessoa já tem.',
    instrucao:
      'Escreve UMA legenda curta (duas a três linhas) para acompanhar um vídeo ou imagem, e termina com uma chamada à ação de uma linha.',
    limite: 350,
  },
  {
    chave: 'argumentario',
    nome: 'Argumentário',
    descricao: 'Como responder a uma objeção concreta, com o raciocínio por trás.',
    instrucao:
      'Escreve um argumentário para responder à objecção indicada: primeiro o que se responde (duas ou três frases, como se falasse), depois uma linha a explicar porque é que essa resposta funciona. Não inventes urgência nem prazos.',
    limite: 600,
  },
] as const

export type ChaveMaterial = (typeof TIPOS_MATERIAL)[number]['chave']

export function tipoDeMaterial(chave: string) {
  return TIPOS_MATERIAL.find((t) => t.chave === chave) ?? null
}

// ═══════════════════════ A REDE: números que não vieram da fonte ═══════════════════════

/**
 * Todos os valores de dinheiro e de percentagem que aparecem num texto, normalizados.
 *
 * Só apanha números COM unidade (€, $, %). «duas semanas» ou «1.º mês» não são valores e não têm
 * de vir de lado nenhum; «35€» e «50%» são afirmações sobre o negócio e têm.
 */
export function numerosDeDinheiro(texto: string): string[] {
  const achados: string[] = []
  const re = /(\d[\d\s.,]*)\s*(€|\$|%|\beuros?\b|\beur\b|\busd\b|\bd[óo]lares?\b)/gi
  for (const m of texto.matchAll(re)) {
    achados.push(normalizarValor(m[1], m[2]))
  }
  return achados
}

/** «34,99 €», «34.99€», «34,99 euros» → a mesma coisa. Senão a comparação falhava por formatação. */
function normalizarValor(numero: string, unidade: string): string {
  const n = numero.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace('.', ',').replace(/,0+$/, '')
  const u = unidade.toLowerCase()
  const unidadeNormal = u === '%' ? '%' : u === '$' || u === 'usd' || u.startsWith('dól') || u.startsWith('dol') ? '$' : '€'
  return `${n}${unidadeNormal}`
}

/**
 * Frases que não se dizem, por mais bem escritas que estejam.
 *
 * São promessas, não números: um texto pode prometer ganhos sem escrever um único algarismo
 * («ganhas dinheiro todos os meses»), e é isso que a lista apanha.
 */
const PROIBIDO: Array<{ re: RegExp; problema: string }> = [
  { re: /garantid[oa]s?\b/i, problema: 'promete algo garantido — não se garante resultado nenhum' },
  { re: /\bsem risco\b|\brisco zero\b/i, problema: 'diz que não há risco' },
  { re: /lucro\s+(certo|garantido|assegurado)/i, problema: 'promete lucro' },
  { re: /rendimento\s+(passivo|garantido|mensal\s+garantido)/i, problema: 'promete rendimento' },
  { re: /dinheiro\s+(f[áa]cil|r[áa]pido|certo)/i, problema: 'promete dinheiro fácil' },
  { re: /(ganha|ganhar|ganhas|faturas?|fatura)\s+[^.!?\n]{0,20}\d[\d\s.,]*\s*(€|\$|euros?)/i, problema: 'promete um valor a ganhar' },
  { re: /\bcomiss(ão|ões|ao|oes)\b[^.!?\n]{0,25}\d/i, problema: 'fala de percentagens de comissão (essas vivem no sistema, não num material)' },
  { re: /\bIQONIC\b/i, problema: 'menciona o IQONIC, que foi descontinuado' },
  { re: /\bMTM\s*Copy\b/i, problema: 'menciona o MTM Copy, que foi descontinuado como produto novo' },
  { re: /aconselh\w*\s+(financeir|de investimento)/i, problema: 'apresenta-se como aconselhamento financeiro' },
]

export interface Revisao {
  aprovado: boolean
  problemas: string[]
}

/**
 * A revisão do material, antes de alguém o ver.
 *
 * `permitidos` são os valores que foram DADOS ao modelo (a escada, o bónus, a prova medida). Tudo o
 * resto é invenção — mesmo que por acaso esteja certo, porque um número certo por acaso hoje é um
 * número errado na próxima vez que os preços mudarem.
 */
export function revistarMaterial(texto: string, permitidos: readonly string[]): Revisao {
  const problemas: string[] = []

  for (const { re, problema } of PROIBIDO) {
    if (re.test(texto)) problemas.push(problema)
  }

  const ok = new Set(permitidos.flatMap((p) => numerosDeDinheiro(p)))
  const inventados = [...new Set(numerosDeDinheiro(texto))].filter((v) => !ok.has(v))
  for (const v of inventados) {
    problemas.push(`o valor «${v}» não veio do sistema — nenhum material pode ter números que não estejam na fonte`)
  }

  return { aprovado: problemas.length === 0, problemas: [...new Set(problemas)] }
}

// ═══════════════════════ O enquadramento da marca ═══════════════════════

/**
 * O prompt de sistema, montado das fontes vivas.
 *
 * NENHUM número escrito aqui. A escada e o bónus entram por função, e a prova entra só se for
 * publicável — `lib/pips-proof.ts` já decide isso, e quando decide que não há prova a resposta
 * certa não é ir buscar uma antiga, é falar de método.
 */
export function enquadramentoDaMarca(opcoes: { linhaDeProva?: string | null; ressalva?: string | null }): string {
  const prova = opcoes.linhaDeProva?.trim()
  return [
    'Escreves materiais de divulgação para a MoreThanMoney (MTM), ecossistema português de educação financeira, ferramentas de trading e comunidade. Aprende-se, aplica-se e acompanha-se tudo pela app.',
    '',
    'TOM: português de Portugal, directo, confiante, sem jargão — como alguém que já lá chegou a falar com quem vai a caminho. Frases curtas. Nada de linguagem de vendedor nem de superlativos.',
    '',
    'REGRAS QUE NÃO SE NEGOCEIAM:',
    '· NUNCA prometas ganhos, lucro, rendimento ou resultados. É educação financeira, não é aconselhamento de investimento.',
    '· NUNCA escrevas um número que não te tenha sido dado aqui. Nem preços, nem percentagens, nem resultados. Se precisares de um número que não tens, escreve a frase sem ele.',
    '· Resultados falam-se em pips e percentagem, nunca em euros ganhos.',
    '· Não inventes urgência, prazos, campanhas nem vagas limitadas.',
    '· Não fales de comissões nem do que se ganha a divulgar: estes materiais são para clientes.',
    '',
    'A ESCADA (a ordem de venda da casa — não lideres com o que é grátis):',
    `· ${escadaNumaLinha()}`,
    `· ${bonusNumaLinha()}`,
    `· O ${NOME_DEGRAU_TOPO} é o topo: é para quem sobe, nunca a abertura.`,
    '',
    prova
      ? `PROVA (medida, é a única que podes usar, e só como te é dada): ${prova}${opcoes.ressalva ? ` ${opcoes.ressalva}` : ''}`
      : 'PROVA: hoje não há prova publicável. Não vais buscar números antigos nem inventas nenhum — falas de método, de comunidade e de processo.',
    '',
    'Devolves APENAS o texto da peça, pronto a usar. Sem preâmbulos, sem aspas à volta, sem explicações.',
  ].join('\n')
}

/**
 * Os valores que o material PODE conter: exactamente os que foram dados ao modelo.
 *
 * Deriva-se das mesmas frases que entram no prompt, e não de uma lista escrita à parte — uma lista
 * à parte divergia do prompt no dia em que um preço mudasse, e a revisão passava a recusar o número
 * certo.
 */
export function valoresPermitidos(linhaDeProva?: string | null): string[] {
  return [escadaNumaLinha(), bonusNumaLinha(), linhaDeProva ?? '']
}
