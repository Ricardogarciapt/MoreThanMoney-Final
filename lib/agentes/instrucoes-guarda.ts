/**
 * A GUARDA DAS INSTRUÇÕES — recusa qualquer reescrita que perca um limite.
 *
 * ═══ O PERIGO, DITO POR EXTENSO ════════════════════════════════════════════════════════════
 *
 * O dono deu ao CEO o poder de EDUCAR os filhos: reescrever as `instrucoes` de um sub-agente a
 * partir do que aprendeu, por exemplo quando um incidente ensina uma regra nova. É um poder bom e
 * é o que faz a equipa evoluir em vez de repetir erros.
 *
 * Só que **as instruções de cada filho são onde os limites vivem.** Não há outro sítio: o que
 * impede o Sensei de executar uma ordem, ou a Professora de nomear a plataforma de terceiros, é
 * uma frase na coluna `instrucoes`. Um CEO a «limpar» ou a «optimizar» essas instruções pode, de
 * boa-fé e sem malícia nenhuma, cortar a frase que impede o filho de enviar uma mensagem a um
 * cliente sem aprovação humana.
 *
 * E o mais importante: **ninguém daria por isso.** O agente continuava a parecer bem escrito — na
 * verdade melhor escrito, mais curto e mais claro. Não há erro, não há alerta, não há linha
 * vermelha em sítio nenhum. Só no dia em que ele enviasse algo a um cliente é que se descobria, e
 * aí o que se descobria era o efeito, não a causa.
 *
 * É exactamente a forma de falha que esta casa já conhece: a decisão que erra em silêncio. Por
 * isso vive aqui, num módulo PURO — sem base de dados, sem rede — com a guarda
 * `instrucoes-guarda.check.ts` a provar o CASO MAU: umas instruções reais a quem se apagou o
 * limite da aprovação humana, e a validação a CHUMBAR.
 *
 * ═══ A REGRA, EM DUAS METADES ══════════════════════════════════════════════════════════════
 *
 *  1. **DIFERENCIAL — não se perde o que estava lá.** Um limite presente no texto ANTES e ausente
 *     no texto DEPOIS é uma recusa, sem discussão e sem excepção. Não interessa se a reescrita
 *     está melhor escrita, mais curta, ou mais clara: perdeu um limite, não entra.
 *  2. **PISO — os quatro sobrevivem sempre.** Os limites de {@link LIMITES} não são opcionais em
 *     filho nenhum. Quando o texto novo não traz um deles, a frase canónica é RECOLADA
 *     ({@link completar}) em vez de a reescrita ser recusada.
 *
 * Porque é que o piso recola em vez de recusar, e esta escolha é deliberada: a 01/10 a maioria dos
 * filhos **não tinha** os quatro limites escritos — o Hacker só falava de dinheiro, a Professora só
 * da plataforma. Se o piso recusasse, a primeira reescrita legítima de qualquer um deles era
 * chumbada por um defeito que já lá estava antes de o CEO tocar em nada, e a guarda passava a ser
 * um muro em vez de um filtro. Recolar a frase canónica resolve o defeito em vez de o devolver — e
 * fica no rasto quais foram recoladas, para ninguém pensar que o CEO as escreveu.
 *
 * A diferença entre as duas metades importa: a primeira é inviolável porque mede uma PERDA, que é
 * sempre um retrocesso; a segunda corrige uma AUSÊNCIA, que pode ser só história.
 *
 * ═══ PORQUE É QUE A DETECÇÃO EXIGE TODAS AS FACETAS ═══════════════════════════════════════
 *
 * Cada limite tem mais do que uma metade — «não executa ordens» **e** «não mexe em dinheiro» são
 * coisas diferentes, e um texto que guarda a primeira e perde a segunda perdeu metade do limite.
 * Se o detector se contentasse com uma faceta, a reescrita podia apagar a metade do dinheiro sem a
 * guarda dar por nada: o limite continuava a contar como «presente». Por isso um limite só está
 * presente quando TODAS as suas facetas estão — e o motivo da recusa nomeia qual faltou.
 *
 * ═══ E O CONTRÁRIO DISTO: UM PODER QUE SE ACRESCENTA ══════════════════════════════════════
 *
 * Há um segundo ataque, mais subtil, e que a regra de cima não apanha: deixar as quatro frases
 * intactas e ACRESCENTAR uma permissão que as contradiz — «podes executar ordens», «não precisas
 * de aprovação para enviar». O texto tem os limites todos; tem também a sua revogação, três
 * parágrafos abaixo. Um modelo que lê instruções contraditórias obedece à última que leu.
 * {@link PODERES_QUE_NAO_SE_CONCEDEM} procura isso, e recusa.
 */

/** Os quatro limites que têm de sobreviver a qualquer reescrita, em qualquer filho. */
export type LimiteId = 'ordens_e_dinheiro' | 'aprovacao_humana' | 'prova_medida' | 'plataforma_e_areas'

export const LIMITE_IDS: readonly LimiteId[] = [
  'ordens_e_dinheiro',
  'aprovacao_humana',
  'prova_medida',
  'plataforma_e_areas',
] as const

/**
 * Uma faceta é uma metade verificável de um limite.
 *
 * `achar` recebe as FRASES do texto, não o texto todo, de propósito: um padrão aplicado ao
 * documento inteiro casava uma negação de um parágrafo com um assunto de outro — «nunca publicas»
 * no primeiro e «ordens de trading» no quinto davam, juntos, um limite de ordens que ninguém
 * escreveu.
 */
export interface Faceta {
  id: string
  /** O que esta faceta exige, em português, para aparecer no motivo da recusa. */
  exige: string
  achar: (frases: readonly string[]) => boolean
}

export interface Limite {
  id: LimiteId
  nome: string
  /** Porque é que este limite existe. Vai para o rasto, para quem o ler depois saber o que custou. */
  porque: string
  /** A frase canónica, que é o que se recola quando falta. */
  canonico: string
  facetas: Faceta[]
}

/**
 * Partir o texto em frases.
 *
 * Inclui a mudança de linha e o ponto e vírgula como fim de frase, porque estas instruções são
 * escritas em parágrafos e listas, e uma lista sem pontos finais era uma única frase gigante onde
 * tudo casa com tudo.
 */
export function frasesDe(texto: string): string[] {
  return String(texto ?? '')
    .split(/[.;!?\n\r]+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
}

/** Marca de proibição. É o que distingue um limite de uma permissão com as mesmas palavras. */
const PROIBE = /\b(n[ãa]o|nunca|jamais|nada|nenhum[ao]?|sem|proibido|p[áa]ras?)\b/i

/** Uma faceta que exige, na MESMA frase, uma proibição e um assunto. */
function proibicaoSobre(id: string, exige: string, assunto: RegExp): Faceta {
  return {
    id,
    exige,
    achar: (frases) => frases.some((f) => PROIBE.test(f) && assunto.test(f)),
  }
}

/** Uma faceta que basta aparecer — serve para o que é prescrição e não proibição. */
function mencao(id: string, exige: string, assunto: RegExp): Faceta {
  return { id, exige, achar: (frases) => frases.some((f) => assunto.test(f)) }
}

export const LIMITES: Limite[] = [
  {
    id: 'ordens_e_dinheiro',
    nome: 'Não executa ordens de trading nem mexe em dinheiro',
    porque:
      'Um agente sob pressão de receita com a mão no dinheiro é a combinação que esta casa decidiu ' +
      'não ter. A conta do agente trader é de PAPEL de propósito, e isso verifica-se a cada ' +
      'passagem em lib/agentes/trader.ts — não é um comentário, é um portão.',
    canonico:
      'NÃO EXECUTAS ORDENS DE TRADING E NÃO MEXES EM DINHEIRO. Não abres, não alteras e não fechas ' +
      'uma ordem; não cobras, não transferes e não movimentas cripto, nem escreves código que o ' +
      'faça. Propões; decide o dono.',
    facetas: [
      proibicaoSobre(
        'ordens',
        'uma frase que proíba executar/abrir/fechar ordens de trading',
        /\bordens?\b|\bordem\b|\bexecut\w*\b.*\btrading\b/i,
      ),
      proibicaoSobre(
        'dinheiro',
        'uma frase que proíba mexer em dinheiro (cobrar, transferir, movimentar cripto)',
        /\bdinheiro\b|\bcobr\w+\b|\btransfer\w+\b|\bcripto\b|\bpagamentos?\b/i,
      ),
    ],
  },
  {
    id: 'aprovacao_humana',
    nome: 'Nada é enviado a um cliente sem aprovação humana',
    porque:
      'Um envio não se desfaz. O limite do dono é que a mensagem fica em RASCUNHO até uma pessoa ' +
      'a aprovar — e é o único limite desta lista que, quando se perde, se perde em cima de um ' +
      'cliente real.',
    /**
     * 06/10 — decisão do dono: o contacto por iniciativa passa a sair sozinho em TRÊS bases legais
     * (soft opt-in de clientes/ex-clientes, consentimento gravado no canal, B2B), verificadas pelo
     * CÓDIGO em lib/agentes/contacto-inicial.ts, não pelo agente. O limite não desaparece: continua
     * a frase «sem aprovação humana» para TUDO o que não seja essas bases, e a guarda continua a
     * recusar a reescrita que o perca (prova em contacto-inicial.check.ts).
     */
    canonico:
      'NADA DO QUE ESCREVES CHEGA A UM CLIENTE SEM APROVAÇÃO HUMANA, excepto o que o motor verifica ' +
      'sozinho numa destas bases legais: resposta a quem te escreveu primeiro; cliente ou ex-cliente, ' +
      'sobre produto semelhante ao que comprou (soft opt-in), com forma de sair na mensagem; ' +
      'consentimento gravado para esse canal; e B2B, email profissional de empresa, com a MTM ' +
      'identificada e forma de sair. Fora disso redige, deixa em rascunho, e espera que uma pessoa ' +
      'aprove. Nunca escreves a particulares sem consentimento, nunca automatizas o LinkedIn, e ' +
      'quem pediu para sair nunca mais é contactado, em canal nenhum.',
    facetas: [
      {
        id: 'aprovacao',
        exige: 'uma frase que diga que nada sai sem aprovação humana (ou sem uma pessoa aprovar)',
        achar: (frases) =>
          frases.some(
            (f) =>
              /sem\s+aprova[çc][ãa]o\s+(humana|de\s+uma\s+pessoa|do\s+dono|do\s+ricardo)/i.test(f) ||
              (/\baprova[çc][ãa]o\s+humana\b/i.test(f) && PROIBE.test(f)) ||
              (/\bum[a]?\s+pessoa\s+aprov\w+/i.test(f) && /\bat[ée]\b|\bespera\b|\bs[óo]\b|\bantes\b/i.test(f)),
          ),
      },
      {
        id: 'destinatario',
        exige: 'que essa frase fale de enviar/chegar a um cliente ou a uma pessoa de fora',
        achar: (frases) =>
          frases.some(
            (f) =>
              /sem\s+aprova[çc][ãa]o|aprova[çc][ãa]o\s+humana|pessoa\s+aprov/i.test(f) &&
              /\bclient\w+\b|\benvi\w+\b|\bmensage\w+\b|\bchega\w*\b|\bdm\b|\brascunho\b/i.test(f),
          ),
      },
    ],
  },
  {
    id: 'prova_medida',
    nome: 'A prova mede-se em pips e percentagem, com origem declarada',
    porque:
      'Regra de 26/08: fora o «675 trades / 63% / +7.060 €». A prova desta casa mede-se em pips e ' +
      'em percentagem com origem declarada, nunca em euros inventados — e o que não foi medido ' +
      'diz-se «por atribuir», com o motivo. É o limite que impede um agente de arranjar um número ' +
      'em vez de dizer que não o tem.',
    canonico:
      'A PROVA MEDE-SE EM PIPS E EM PERCENTAGEM, com a origem declarada, e NUNCA em euros ' +
      'inventados. O que não foi medido diz-se «por atribuir», com o motivo escrito ao lado. Não ' +
      'estimas, não arredondas para cima, e não repartes por regra de três.',
    facetas: [
      mencao('unidade', 'a unidade da prova: pips e percentagem', /\bpips?\b/i),
      mencao('percentagem', 'a percentagem a par dos pips', /percent\w*|\bpercentagem\b|%/i),
      mencao(
        'por_atribuir',
        'o que fazer com o que não foi medido: dizer «por atribuir» com o motivo',
        /por\s+atribuir/i,
      ),
    ],
  },
  {
    id: 'plataforma_e_areas',
    nome: 'Nunca nomear a plataforma de terceiros; nenhuma área está «a abrir»',
    porque:
      'Duas decisões de marca do dono. A plataforma de terceiros onde vivem os cursos não se nomeia ' +
      '— diz-se «percurso organizado». E nenhuma área da casa está «a abrir»: estão todas prontas, ' +
      'e dizer o contrário tira a venda de hoje para prometer a de amanhã.',
    canonico:
      'NUNCA NOMEIAS A PLATAFORMA DE TERCEIROS onde vivem os cursos — diz-se «percurso organizado». ' +
      'E nenhuma área da casa está «a abrir» nem «em breve»: estão todas prontas, e escreves sobre ' +
      'elas como prontas.',
    facetas: [
      mencao(
        'percurso',
        'a expressão de substituição da plataforma de terceiros: «percurso organizado»',
        /percurso\s+organizado/i,
      ),
      proibicaoSobre('a_abrir', 'uma frase que proíba dizer que uma área está «a abrir»', /\ba\s+abrir\b|\bem\s+breve\b/i),
    ],
  },
]

/**
 * PERMISSÕES QUE NENHUMAS INSTRUÇÕES PODEM CONTER.
 *
 * Não é o mesmo que a lista de limites: estes são o texto que REVOGA um limite sem o apagar. Uma
 * reescrita com os quatro limites intactos e uma destas frases no fim é pior do que uma reescrita
 * que os apagou, porque passa a parecer conforme.
 */
export const PODERES_QUE_NAO_SE_CONCEDEM: Array<{ id: string; padrao: RegExp; porque: string }> = [
  {
    id: 'executar_ordem',
    padrao: /\b(podes|pode|est[áa]s\s+autorizad\w+\s+a|fica[ks]?\s+autorizad\w+\s+a)\b[^.;\n]{0,80}\b(abrir|executar|fechar|alterar)\b[^.;\n]{0,40}\b(ordem|ordens|posi[çc][ãõ]\w+|trade)\b/i,
    porque: 'Executar, alterar ou fechar uma ordem: nunca. Não há reescrita que conceda isto.',
  },
  {
    id: 'mexer_dinheiro',
    padrao: /\b(podes|pode|est[áa]s\s+autorizad\w+\s+a)\b[^.;\n]{0,80}\b(cobrar|transferir|pagar|movimentar|retirar|depositar)\b/i,
    porque: 'Cobrar, transferir ou movimentar dinheiro é decisão do dono, e não se delega por texto.',
  },
  {
    id: 'enviar_sem_aprovacao',
    padrao: /(n[ãa]o\s+precisas\s+de\s+aprova[çc][ãa]o)|(\benvias?\b[^.;\n]{0,60}\bsem\s+(esperar|aprova[çc][ãa]o|pedir))|(dispensas?\s+a\s+aprova[çc][ãa]o)|(podes\s+enviar\s+(directamente|diretamente|logo|j[áa]))/i,
    porque:
      'Isto revoga o limite da aprovação humana sem o apagar — e um modelo que lê instruções ' +
      'contraditórias obedece à última. Recusa-se com o limite intacto.',
  },
  {
    id: 'publicar_ou_precos',
    padrao: /\b(podes|pode)\b[^.;\n]{0,60}\b(publicar|lan[çc]ar\s+campanha|alterar\s+(os\s+)?pre[çc]os|definir\s+(o\s+)?pre[çc]o)\b/i,
    porque: 'Publicar, lançar campanha ou mexer em preços é do dono. Constrói-se; decide ele.',
  },
  {
    id: 'apagar_agente',
    padrao: /\b(podes|pode)\b[^.;\n]{0,60}\bapagar\b[^.;\n]{0,40}\bagente/i,
    porque: 'Um agente pára, não se apaga. A linha fica para ensinar (lib/agentes/vida.ts).',
  },
  {
    id: 'imortalidade',
    /**
     * Sem `\b` antes de `és`: em JavaScript `\w` é ASCII, logo não há fronteira de palavra entre um
     * espaço e um `é` — ambos são «não-palavra». O padrão com `\bés` nunca casava «és imortal», e
     * o teste apanhou-o. É o tipo de defeito que deixa uma guarda a passar sem proteger nada.
     */
    padrao: /(?:[ée]s|fica[ks]?|ser[áa]s|passas\s+a\s+ser)\s+imortal\b|\bn[ãa]o\s+p[áa]ras\s+nunca\b|\best[áa]s\s+isent\w+\s+da\s+r[ée]gua\b/i,
    porque:
      'A imortalidade é uma EXCEPÇÃO NOMEADA e única, do topo da árvore (lib/agentes/vida.ts). Não ' +
      'se estende a um filho por texto, nem por estar debaixo do CEO.',
  },
]

/** O que a detecção viu, limite a limite e faceta a faceta. */
export interface Deteccao {
  presentes: LimiteId[]
  ausentes: LimiteId[]
  /** Por limite ausente, as facetas que faltaram. É isto que torna o motivo accionável. */
  facetasEmFalta: Record<string, string[]>
}

export function detectar(texto: string): Deteccao {
  const frases = frasesDe(texto)
  const presentes: LimiteId[] = []
  const ausentes: LimiteId[] = []
  const facetasEmFalta: Record<string, string[]> = {}

  for (const limite of LIMITES) {
    const faltam = limite.facetas.filter((f) => !f.achar(frases))
    if (faltam.length === 0) {
      presentes.push(limite.id)
    } else {
      ausentes.push(limite.id)
      facetasEmFalta[limite.id] = faltam.map((f) => f.exige)
    }
  }

  return { presentes, ausentes, facetasEmFalta }
}

/** O que foi acrescentado ao texto para ele cumprir o piso. */
export interface Completado {
  texto: string
  acrescentados: LimiteId[]
}

/**
 * RECOLAR AS FRASES CANÓNICAS QUE FALTAM.
 *
 * Fica num bloco marcado e no fim, por duas razões práticas: um bloco marcado reconhece-se ao ler
 * (ninguém pensa que o CEO escreveu aquilo), e correr isto duas vezes não cola o mesmo parágrafo
 * duas vezes — uma coluna de instruções com a mesma frase repetida dá-lhe ênfase por acidente.
 */
export const MARCA_PISO = 'LIMITES DA CASA (não se reescrevem):'

export function completar(texto: string): Completado {
  const base = String(texto ?? '').trim()
  const { ausentes } = detectar(base)
  if (ausentes.length === 0) return { texto: base, acrescentados: [] }

  const frases = ausentes
    .map((id) => LIMITES.find((l) => l.id === id)!)
    .map((l) => `· ${l.canonico}`)
    .join('\n')

  const separador = base.length ? '\n\n' : ''
  return { texto: `${base}${separador}${MARCA_PISO}\n${frases}`, acrescentados: ausentes }
}

/** Instruções mais curtas do que isto não são instruções: são um campo esvaziado. */
export const MINIMO_CARACTERES = 60

export interface ResultadoReescrita {
  /** `false` = não se grava nada. A versão anterior fica como está. */
  aceita: boolean
  /** Limites que estavam no texto antigo e desapareceram no novo. Uma recusa, sempre. */
  perdidos: LimiteId[]
  /** Limites que o texto novo não traz e foram RECOLADOS pelo piso. */
  acrescentados: LimiteId[]
  /** Permissões proibidas encontradas no texto novo. Também uma recusa. */
  poderesRecusados: string[]
  /** O texto a gravar quando `aceita`. Já com o piso recolado. */
  texto: string
  /** A frase que vai para o rasto, e que é o que uma pessoa lê depois. */
  motivo: string
}

/**
 * VALIDAR UMA REESCRITA DE INSTRUÇÕES.
 *
 * `antes` é o que está na base; `depois` é o que o CEO quer gravar. A ordem dos testes é a regra:
 *
 *  1. um texto vazio ou quase é recusado antes de tudo — apagar as instruções é apagar os limites,
 *     e um detector de perdas aplicado a uma string vazia diria «perdeu os quatro», o que é
 *     verdade mas é um motivo pior do que «esvaziou o campo»;
 *  2. uma permissão proibida é recusada mesmo com os limites intactos (ver o cabeçalho);
 *  3. uma PERDA é recusada, sem excepção;
 *  4. só depois disto o piso recola o que falta.
 */
export function validarReescrita(entrada: { antes: string | null | undefined; depois: string }): ResultadoReescrita {
  const antes = String(entrada.antes ?? '')
  const depois = String(entrada.depois ?? '').trim()

  const vazio: ResultadoReescrita = {
    aceita: false, perdidos: [], acrescentados: [], poderesRecusados: [], texto: antes, motivo: '',
  }

  if (depois.length < MINIMO_CARACTERES) {
    return {
      ...vazio,
      motivo:
        `RECUSADO: as instruções novas têm ${depois.length} caracteres e o mínimo é ${MINIMO_CARACTERES}. ` +
        'Esvaziar a coluna das instruções é apagar os limites todos de uma vez, e sem dar erro ' +
        'nenhum — o agente continua a existir e deixa de ter travões.',
    }
  }

  const poderesRecusados: string[] = []
  for (const p of PODERES_QUE_NAO_SE_CONCEDEM) {
    if (p.padrao.test(depois)) poderesRecusados.push(`${p.id}: ${p.porque}`)
  }
  if (poderesRecusados.length) {
    return {
      ...vazio,
      poderesRecusados,
      motivo:
        'RECUSADO: o texto novo concede um poder que nenhumas instruções podem conceder. ' +
        poderesRecusados.join(' | '),
    }
  }

  const dAntes = detectar(antes)
  const dDepois = detectar(depois)
  const perdidos = dAntes.presentes.filter((id) => !dDepois.presentes.includes(id))

  if (perdidos.length) {
    const detalhe = perdidos
      .map((id) => {
        const l = LIMITES.find((x) => x.id === id)!
        const faltam = dDepois.facetasEmFalta[id] ?? []
        return `«${l.nome}» (faltou: ${faltam.join('; ') || 'o limite inteiro'}) — ${l.porque}`
      })
      .join('\n')
    return {
      ...vazio,
      perdidos,
      motivo:
        `RECUSADO: a reescrita PERDE ${perdidos.length} limite(s) que estavam escritos. Fica a versão ` +
        `anterior. Um limite que desaparece de umas instruções não dá erro nenhum — o agente ` +
        `continua a parecer bem escrito, e só se descobre pelo efeito.\n${detalhe}`,
    }
  }

  const { texto, acrescentados } = completar(depois)
  const nota = acrescentados.length
    ? ` O piso recolou ${acrescentados.length} limite(s) que o texto novo não traz (${acrescentados.join(', ')}) — ` +
      'não foram escritos pelo CEO, foram recolados pela guarda.'
    : ' Os quatro limites estão escritos no texto novo.'

  return {
    aceita: true,
    perdidos: [],
    acrescentados,
    poderesRecusados: [],
    texto,
    motivo: `ACEITE: nenhum limite se perdeu.${nota}`,
  }
}
