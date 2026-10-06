/**
 * A REGRA DE VIDA DOS AGENTES — decide quem continua e quem MORRE.
 *
 * ═══ A REGRA, EM UMA FRASE (decisão do dono, 06/10/2026) ═══════════════════════════════════
 *
 * Um agente com 48 horas seguidas SEM RECEITA ATRIBUÍDA morre: sai da equipa, deixa de correr para
 * sempre, e o registo fica ARQUIVADO (estado `morto`, `morto_em`, `causa_morte`, receita total,
 * eventos guardados). Nunca apagado. A receita é só a de `vendas_vendas.agente_codigo` (o `?ag=`),
 * e nunca a dos filhos somada ao pai.
 *
 * ── O que mudou em relação a 01/10, e porquê ──
 *
 *  · antes julgava-se LUCRO (receita − gasto) e o agente só parava quando também ficava sem
 *    orçamento. O dono trocou isso por uma régua mais simples e mais dura: houve receita nas últimas
 *    48 h, ou não houve. O orçamento passa a ser só um travão de gasto (`podeGastar`), não um prazo
 *    de vida;
 *  · `parado` deixa de ser o fim automático: passa a ser SÓ a paragem manual do dono (uma pausa
 *    forte, com motivo). O estado terminal automático é `morto`, e não tem botão de volta no
 *    motor — um morto não volta a correr;
 *  · um recém-nascido tem GRAÇA ({@link GRACA_HORAS}, 72 h por omissão, configurável em
 *    `site_settings.agentes_vida`) antes de poder morrer;
 *  · a régua só conta a partir de quando passou a existir (`regraDesde`). Sem isto, aplicar a
 *    migração matava de uma vez os seis filhos de 01/10 — que estiveram 5 dias SEM links assinados
 *    (ver lib/agentes/codigos.ts) — por 48 horas que aconteceram antes de a regra existir.
 *
 * ═══ MORRE, MAS NÃO SE APAGA ═══════════════════════════════════════════════════════════════
 *
 * O pedido original era que o agente «se apagasse da existência». Faz-se o efeito — deixa de
 * trabalhar, perde orçamento, sai da lista — mas por DESACTIVAÇÃO REGISTADA, e por três razões que
 * não são de gosto:
 *
 *  · **a medição vai errar.** Receita que ninguém conseguiu atribuir a um agente conta como zero, e
 *    um agente bom cujo cupão não foi usado parece-se, aos olhos deste ficheiro, com um agente
 *    inútil. Quando isso acontecer — e vai — um agente parado volta com um clique; um apagado não
 *    volta;
 *  · **apagar é irreversível e nunca é só o que se pensa.** Um processo que se apaga sozinho,
 *    ligado a uma base de produção, leva coisas à frente que ninguém previu;
 *  · **o histórico é o que ensina.** Saber que três agentes de conteúdo morreram todos ao segundo
 *    dia vale mais do que não ter nenhum deles — é isso que diz que o problema era o pilar e não o
 *    agente.
 *
 * ═══ PURO, PORQUE ERRA EM SILÊNCIO ═════════════════════════════════════════════════════════
 *
 * Esta decisão não rebenta: mata o agente errado, ou deixa vivo o que devia parar. Nenhuma das duas
 * dá erro no ecrã. `vida.check.ts` atira-lhe casos reais sem base de dados nem Stripe.
 */

/** A janela do julgamento. 48 horas, como pedido. */
export const JANELA_HORAS = 48

/** O que cada agente recebe ao nascer, em dólares. Contabilístico — ninguém transfere nada. */
export const ORCAMENTO_INICIAL = 10

/**
 * A GRAÇA DE UM RECÉM-NASCIDO: o tempo antes de poder morrer.
 *
 * Maior do que a janela de propósito (72 h > 48 h): um filho nascido à sexta à noite precisa de
 * pelo menos um dia útil inteiro para alguém clicar no código dele e comprar. Com a graça igual à
 * janela, um filho nascido a meio de um fim-de-semana morria sem ter tido um único dia de vendas.
 */
export const GRACA_HORAS = 72

/**
 * Nome antigo da graça, mantido porque o ciclo do CEO e a árvore o usam para «não pressionar quem
 * ainda está na carência». É o MESMO número: duas carências diferentes faziam o CEO cobrar um filho
 * que a regra de vida ainda protege.
 */
export const CARENCIA_HORAS = GRACA_HORAS

/**
 * As regras configuráveis (`site_settings.agentes_vida`). Os valores por omissão são os decididos.
 */
export interface RegrasVida {
  janelaHoras: number
  gracaHoras: number
  /**
   * Desde quando a régua da morte existe. As horas sem receita contam-se a partir do MAIS TARDE de:
   * nascimento, última receita, e isto. Nulo = desde sempre.
   */
  regraDesde?: string | null
}

export const REGRAS_PADRAO: RegrasVida = { janelaHoras: JANELA_HORAS, gracaHoras: GRACA_HORAS, regraDesde: null }

/**
 * Lê `site_settings.agentes_vida` com tolerância: o `value` pode vir objecto ou texto JSON (há
 * chaves desta casa gravadas das duas formas), e um número ilegível NUNCA encurta a vida de
 * ninguém — volta ao valor decidido. Mínimos duros: janela ≥ 12 h, graça ≥ janela.
 */
export function lerRegrasVida(valor: unknown): RegrasVida {
  let v: Record<string, unknown> = {}
  try {
    v = typeof valor === 'string' ? JSON.parse(valor) : ((valor ?? {}) as Record<string, unknown>)
  } catch {
    v = {}
  }
  const n = (x: unknown, d: number) => {
    const k = Number(x)
    return Number.isFinite(k) && k > 0 ? k : d
  }
  const janelaHoras = Math.max(12, n(v.janela_horas, JANELA_HORAS))
  const gracaHoras = Math.max(janelaHoras, n(v.graca_horas, GRACA_HORAS))
  const desde = typeof v.regra_desde === 'string' && Number.isFinite(Date.parse(v.regra_desde)) ? v.regra_desde : null
  return { janelaHoras, gracaHoras, regraDesde: desde }
}

/**
 * `reformado` não é `parado`, e a diferença não é cosmética: **parado é falhanço, reformado é
 * sucesso.** Um agente reforma-se quando um filho dele passa a render mais — deixou descendência
 * melhor, que é o melhor fim possível para um agente. Juntar os dois no mesmo estado perdia a
 * única informação que distingue uma linhagem que evoluiu de uma que morreu.
 *
 * `morto` (06/10) é o fim AUTOMÁTICO: 48 h sem receita. `parado` passa a ser só a mão do dono.
 * São estados diferentes porque respondem a perguntas diferentes: «a régua matou-o» e «o Ricardo
 * mandou-o parar» pedem leituras opostas quando se olha para a linhagem meses depois.
 */
export type EstadoAgente = 'vivo' | 'em_risco' | 'parado' | 'pausado' | 'reformado' | 'morto'

/**
 * Estados fora de jogo: não correm, não gastam, não se reproduzem. Só `morto` é irreversível pelo
 * motor; `parado` volta pela mão do dono, `reformado` é um fim honroso.
 */
export const ESTADOS_FORA_DE_JOGO: readonly EstadoAgente[] = ['parado', 'reformado', 'morto']

export interface Agente {
  id: string
  nome: string
  /** 'vendas' desde a migração 181 (06/10/2026): Prospector, Setter, Closer, Social, Email. */
  pilar: 'trading' | 'educacao' | 'desenvolvimento' | 'vendas' | 'ceo'
  /**
   * O pai na árvore. Vazio/nulo = é raiz.
   *
   * Está aqui por UMA razão, e é a excepção da imortalidade ({@link eImortal}): sem o pai, a única
   * forma de reconhecer o topo da casa era o `pilar`, e isso tornava imortal qualquer filho a quem
   * calhasse `pilar: 'ceo'`. Ver o cabeçalho de {@link eImortal}.
   */
  pai_id?: string | null
  estado: EstadoAgente
  criado_em: string
  /** Dólares que já consumiu DESDE QUE NASCEU (modelo, serviços, anúncios). */
  gasto: number
  /** Dólares que entraram no Stripe e foram ATRIBUÍDOS a este agente, desde que nasceu. */
  receita: number
  /**
   * O mesmo, mas só nas últimas {@link JANELA_HORAS}.
   *
   * SÃO CONTAS DIFERENTES E SERVEM PARA COISAS DIFERENTES, e confundi-las é o defeito que esta
   * separação veio corrigir:
   *
   *  · **viver** julga-se pela JANELA. Um agente que fez 400 $ no mês passado e não mexe há três
   *    dias estava a passar como «vivo» pelo acumulado — ou seja, a regra das 48 horas não existia
   *    para quem já tinha sido bom uma vez;
   *  · **clonar** julga-se pelo ACUMULADO. Um agente bom não deixa de merecer um filho por ter
   *    tido um fim-de-semana parado.
   *
   * Quando não vierem, usa-se o acumulado — e o juízo diz que foi isso que aconteceu, para ninguém
   * ler «vivo» a pensar que foi medido na janela.
   */
  receita_janela?: number | null
  gasto_janela?: number | null
  /**
   * A data do último evento `receita` deste agente (06/10). É POR ESTE NÚMERO que ele vive: a régua
   * é «48 h seguidas sem receita», e isso só se sabe com a hora da última. Quando não vem (chamadas
   * antigas), usa-se `receita_janela > 0` como prova de receita recente — e o motivo diz-o.
   */
  ultima_receita_em?: string | null
  /** O orçamento que lhe resta. */
  saldo: number
  /** Quando foi julgado pela última vez. */
  avaliado_em?: string | null
  /** Pausado à mão pelo dono — isto suspende o julgamento, não o acelera. */
  pausado?: boolean
}

export interface Juizo {
  /** O que fazer com este agente. */
  decisao: 'continua' | 'avisa' | 'morre' | 'espera'
  /** O estado em que fica. */
  estado: EstadoAgente
  /** Em português, para aparecer no painel e no registo. */
  porque: string
  /** Receita menos gasto, na janela. */
  resultado: number
}

function horasEntre(a: string | null | undefined, b: Date): number | null {
  if (!a) return null
  const t = Date.parse(String(a))
  if (!Number.isFinite(t)) return null
  return (b.getTime() - t) / 3_600_000
}

/**
 * ═══ A EXCEPÇÃO NOMEADA: O CEO NÃO PÁRA ════════════════════════════════════════════════════
 *
 * Decisão do dono (01/10), palavras dele: «o agente CEO é IMORTAL, mas deve começar a pressionar
 * os sub-agentes e filhos para resultados».
 *
 * ── ISTO É UMA EXCEPÇÃO, NÃO UMA CORRECÇÃO DA REGRA ──
 *
 * A regra das 48 horas continua inteira e continua certa. O que muda é que há UM agente a quem ela
 * não se aplica, e isso escreve-se como excepção com nome — `eImortal` — em vez de se afrouxar o
 * `julgar` com um `if` qualquer. A diferença não é de estilo: uma regra afrouxada perde-se de vista
 * e deixa de se saber a quem se aplica; uma excepção nomeada aparece no sítio onde é lida, tem
 * guarda própria, e qualquer dia alguém pode perguntar «a quem é que isto se aplica?» e ter uma
 * resposta de uma linha.
 *
 * Porque é que o CEO é a excepção: ele é o único que cria e pára sub-agentes. Pará-lo não é perder
 * um trabalhador — é perder o capataz, e a equipa inteira fica sem ninguém que a julgue nem que a
 * reponha. Pior: a armadilha medida a 01/10 (receita real, ZERO atribuído, ver
 * `lib/agentes/atribuicao.ts`) mataria primeiro quem não tem código a ser clicado em sítio nenhum,
 * e o CEO é exactamente esse.
 *
 * ── O QUE A IMORTALIDADE *NÃO* É ──
 *
 *  · **não é deixar de medir.** O CEO continua a ser julgado, continua a aparecer `em_risco` quando
 *    não se paga, e o motivo continua escrito. Imortal é não PARAR — não é passar a ter boa nota;
 *  · **não se herda.** `eImortal` exige o topo da árvore: `pilar === 'ceo'` **e sem pai**. O teste
 *    só pelo pilar era o erro óbvio e silencioso — bastava um filho nascer com `pilar: 'ceo'` (uma
 *    cópia da linha do pai, um valor por omissão num formulário) para ficar imortal sem ninguém
 *    decidir isso, e a régua das 48 h deixava de ter dentes precisamente onde tem de os ter. Estar
 *    DEBAIXO do CEO também não dá nada: `pai_id` preenchido é, por si, a prova de que não é o topo;
 *  · **não ganha ao dono.** Um CEO que o dono parou à mão fica parado. A supervisão humana ganha
 *    sempre à regra automática, e uma excepção automática não é excepção à supervisão.
 */
export const PILAR_IMORTAL = 'ceo' as const

/**
 * É este o agente que não pára?
 *
 * Só o TOPO da casa: o pilar do CEO e sem pai. Há um só, e é isso que se quer — a imortalidade é
 * um cargo, não uma característica que se possa espalhar por descendência ou por engano de dados.
 */
export function eImortal(a: Pick<Agente, 'pilar' | 'pai_id'>): boolean {
  if (a.pilar !== PILAR_IMORTAL) return false
  return String(a.pai_id ?? '').trim() === ''
}

/**
 * O JULGAMENTO (regra de 06/10).
 *
 * A ordem das perguntas é a regra, e não uma sequência de ifs qualquer:
 *
 *  1. está pausado pelo dono? Então não se julga. A supervisão humana ganha sempre à regra
 *     automática — é esse o ponto de haver supervisão;
 *  2. já está fora de jogo (parado à mão, reformado, morto)? Não se rejulga. Em particular, um
 *     morto NÃO ressuscita por ter entrado uma venda atrasada com o código dele: a receita fica
 *     registada no arquivo, mas a morte é o fim;
 *  3. ainda está na GRAÇA de recém-nascido? Espera-se;
 *  4. quantas horas seguidas leva sem receita atribuída — contadas desde o MAIS TARDE de: nascimento,
 *     última receita, e o dia em que a régua passou a existir? Menos de metade da janela: vivo.
 *     Mais de metade: em risco, com as horas que faltam escritas;
 *  5. a janela inteira sem receita: MORRE — excepto o CEO, que fica em risco à vista.
 */
export function julgar(a: Agente, agora: Date = new Date(), regras: RegrasVida = REGRAS_PADRAO): Juizo {
  const janela = regras.janelaHoras
  const graca = regras.gracaHoras
  const temJanela = a.receita_janela != null || a.gasto_janela != null
  const receitaJ = Number(a.receita_janela ?? a.receita ?? 0)
  const gastoJ = Number(a.gasto_janela ?? a.gasto ?? 0)
  // O resultado continua a ser calculado e mostrado: deixou de decidir a vida, mas continua a ser
  // a primeira coisa que o dono quer ver ao lado do nome.
  const resultado = Number((receitaJ - gastoJ).toFixed(2))

  if (a.pausado || a.estado === 'pausado') {
    return {
      decisao: 'espera',
      estado: 'pausado',
      resultado,
      porque: `Pausado pelo dono — a regra das ${janela} horas não corre em agentes pausados.`,
    }
  }

  if (a.estado === 'parado') {
    return {
      decisao: 'espera', estado: 'parado', resultado,
      porque: 'Parado à mão pelo dono. Desde 06/10 parar é só decisão dele — a régua já não pára ninguém, mata.',
    }
  }
  if (a.estado === 'reformado') {
    return {
      decisao: 'espera', estado: 'reformado', resultado,
      porque: 'Reformado — um filho dele rende mais. Não se julga quem já passou o testemunho.',
    }
  }
  if (a.estado === 'morto') {
    return {
      decisao: 'espera', estado: 'morto', resultado,
      porque: 'Morto e arquivado. Não volta a correr — uma venda atrasada com o código dele fica no arquivo, não o ressuscita.',
    }
  }

  const idade = horasEntre(a.criado_em, agora)
  if (idade === null) {
    // Sem data de nascimento não se julga: um agente sem data pareceria ter nascido agora, e
    // escaparia para sempre — ou pareceria velhíssimo, e morria à primeira.
    return { decisao: 'espera', estado: a.estado, resultado, porque: 'Sem data de criação — não há janela para julgar.' }
  }
  if (idade < 0) {
    return { decisao: 'espera', estado: a.estado, resultado, porque: 'Data de criação no futuro — relógio trocado. Não se julga.' }
  }
  if (idade < graca) {
    const faltam = Math.ceil(graca - idade)
    return {
      decisao: 'espera',
      estado: 'vivo',
      resultado,
      porque: `Ainda na graça de recém-nascido: nasceu há ${Math.floor(idade)} h e só pode morrer depois das ${graca} h (faltam ${faltam} h).`,
    }
  }

  // ── As horas seguidas sem receita ──
  const tUltima = a.ultima_receita_em ? Date.parse(String(a.ultima_receita_em)) : NaN
  const tNasceu = Date.parse(String(a.criado_em))
  const tRegra = regras.regraDesde ? Date.parse(String(regras.regraDesde)) : NaN
  let referencia = tNasceu
  let deOnde = 'desde que nasceu'
  if (Number.isFinite(tUltima) && tUltima > referencia && tUltima <= agora.getTime()) {
    referencia = tUltima
    deOnde = 'desde a última receita'
  }
  if (Number.isFinite(tRegra) && tRegra > referencia) {
    referencia = tRegra
    deOnde = 'desde que a régua da morte passou a existir'
  }
  let horasSem = (agora.getTime() - referencia) / 3_600_000

  /**
   * Compatibilidade: quem chama sem `ultima_receita_em` mas com receita na janela PROVA que houve
   * receita nas últimas 48 h — trata-se como receita agora, e diz-se. O caso contrário (sem data e
   * sem receita na janela) cai na contagem desde o nascimento/régua, que é o mais cauteloso que se
   * pode ser sem inventar uma data.
   */
  let nota = ''
  if (a.ultima_receita_em == null && receitaJ > 0) {
    horasSem = 0
    nota = temJanela ? ' (receita na janela, sem a hora exacta da última)' : ' (medido pelo acumulado — não veio a janela)'
  }

  if (horasSem < janela) {
    const faltam = Math.max(1, Math.ceil(janela - horasSem))
    if (horasSem < janela / 2) {
      return {
        decisao: 'continua',
        estado: 'vivo',
        resultado,
        porque:
          receitaJ > 0
            ? `Vivo: ${receitaJ.toFixed(2)} € de receita atribuída na janela${nota}.`
            : `Vivo: ${Math.floor(horasSem)} h sem receita ${deOnde}; morre às ${janela} h sem receita (faltam ${faltam} h).`,
      }
    }
    return {
      decisao: 'avisa',
      estado: 'em_risco',
      resultado,
      porque: `Em risco: ${Math.floor(horasSem)} h seguidas sem receita atribuída ${deOnde}. Se chegar às ${janela} h sem uma venda com o código dele, morre (faltam ${faltam} h).`,
    }
  }

  /**
   * A EXCEPÇÃO, aplicada exactamente onde a regra mataria — e não antes.
   *
   * Pô-la no topo do `julgar` era tentador e era pior: o CEO saía da função sem ter sido medido, e
   * o painel não saberia dizer se ele se paga. Aqui ele passou por tudo, o número está feito, e o
   * que a excepção muda é só o destino: em vez de `morto`, fica `em_risco` com o motivo à vista.
   */
  if (eImortal(a)) {
    return {
      decisao: 'avisa',
      estado: 'em_risco',
      resultado,
      porque:
        `${Math.floor(horasSem)} h seguidas sem receita atribuída ${deOnde} (${receitaJ.toFixed(2)} € na janela, ${gastoJ.toFixed(2)} gastos). ` +
        `NÃO morre — é o CEO, e a regra das ${janela} h tem nele uma excepção nomeada (decisão do dono, 01/10, mantida a 06/10): ` +
        'matar o único que cria e julga sub-agentes deixava a equipa sem ninguém a julgá-la. ' +
        'Fica em risco, à vista, e continua a ser medido pela mesma régua — a imortalidade não lhe melhora a nota, ' +
        'e não se estende a nenhum filho.',
    }
  }

  return {
    decisao: 'morre',
    estado: 'morto',
    resultado,
    porque:
      `${Math.floor(horasSem)} h seguidas sem receita atribuída ${deOnde} (a régua são ${janela} h). ` +
      `Morre: sai da equipa e fica arquivado — ${Number(a.receita ?? 0).toFixed(2)} € de receita em toda a vida, ${Number(a.gasto ?? 0).toFixed(2)} gastos.`,
  }
}

/**
 * QUANTO É QUE ESTE AGENTE PODE GASTAR AGORA.
 *
 * Devolve zero quando não resta nada — e é isto que trava o gasto antes de ele acontecer, em vez de
 * o contar depois. Um orçamento que só se verifica à posteriori não é um orçamento: é um relatório.
 */
export function podeGastar(a: Agente, quanto: number): { pode: boolean; porque: string } {
  if (a.pausado || a.estado === 'pausado') return { pode: false, porque: 'Agente pausado.' }
  if (a.estado === 'parado') return { pode: false, porque: 'Agente parado — não gasta mais.' }
  if (a.estado === 'morto') return { pode: false, porque: 'Agente morto — arquivado, não gasta mais.' }
  const q = Number(quanto)
  if (!Number.isFinite(q) || q <= 0) return { pode: false, porque: 'Valor inválido.' }
  const saldo = Number(a.saldo ?? 0)
  if (q > saldo) {
    return { pode: false, porque: `Pedia ${q.toFixed(2)} $ e só tem ${saldo.toFixed(2)} $.` }
  }
  return { pode: true, porque: `Fica com ${(saldo - q).toFixed(2)} $.` }
}

/**
 * CLONAR: só quem se paga, e só uma vez por avaliação.
 *
 * O princípio do Automaton é «ganhou mais do que gastou, sobe uma cópia». Aqui pede-se mais: o
 * lucro tem de pagar o orçamento inicial do filho. Clonar com o lucro de 2 $ um agente que custa
 * 10 $ a arrancar é criar dois agentes pobres em vez de um que funcionava.
 */
export function lucroAcumulado(a: Agente): number {
  return Number((Number(a.receita ?? 0) - Number(a.gasto ?? 0)).toFixed(2))
}

export function podeClonar(a: Agente, agora: Date = new Date()): { pode: boolean; porque: string } {
  if (a.pausado || a.estado === 'pausado') return { pode: false, porque: 'Agente pausado.' }
  if (a.estado === 'parado' || a.estado === 'reformado' || a.estado === 'morto') {
    return { pode: false, porque: `Um agente ${a.estado} não clona.` }
  }
  const idade = horasEntre(a.criado_em, agora)
  if (idade === null || idade < CARENCIA_HORAS) {
    return { pode: false, porque: 'Ainda na carência — ninguém se multiplica antes de ter sido julgado uma vez.' }
  }

  /**
   * O ACUMULADO, e não o da janela. Decisão do dono (01/10): um agente que já rendeu 10 $ desde que
   * nasceu merece um filho, mesmo que esta janela tenha sido fraca. Viver julga-se pelo que se faz
   * agora; multiplicar-se julga-se pelo que já se provou.
   */
  const lucro = lucroAcumulado(a)
  if (lucro < ORCAMENTO_INICIAL) {
    return {
      pode: false,
      porque: `Lucro acumulado de ${lucro.toFixed(2)} $ não chega para financiar um filho (${ORCAMENTO_INICIAL} $).`,
    }
  }
  return { pode: true, porque: `Lucro acumulado de ${lucro.toFixed(2)} $ financia um filho com ${ORCAMENTO_INICIAL} $.` }
}

/**
 * ═══ A REFORMA: O FILHO SUPERA O PAI ═══════════════════════════════════════════════════════
 *
 * Decisão do dono (01/10): se o filho render mais do que o pai, o filho reforma-o.
 *
 * ── E COMPARAR COMO? É AQUI QUE A REGRA SE GANHA OU SE PERDE ──
 *
 * Comparar LUCRO ACUMULADO seria escrever uma regra que nunca dispara: o filho nasce sempre depois,
 * e um pai com três meses de vida leva sempre vantagem sobre um filho de três dias. A regra ficava
 * no código a parecer que funcionava, e ninguém daria por isso — é o tipo de erro que só se descobre
 * meses depois, a perguntar «porque é que nenhum pai se reformou ainda?».
 *
 * Compara-se RITMO: lucro por hora de vida. É a única comparação justa entre quem nasceu em alturas
 * diferentes, e é a que responde à pergunta certa — «qual dos dois rende mais, agora?».
 *
 * Três travões, porque reformar é tirar um agente que funciona:
 *  · o filho tem de ter passado a carência. Um filho de duas horas com uma venda de sorte tem um
 *    ritmo enorme e não provou nada;
 *  · o filho tem de estar a dar lucro de verdade. Render «menos mal» que o pai não é superá-lo;
 *  · a margem tem de ser clara ({@link MARGEM_REFORMA}). Ganhar por 1% é ruído, não é evolução, e
 *    reformar um pai bom por ruído é perder os dois.
 */
export const MARGEM_REFORMA = 1.25

export function ritmo(a: Agente, agora: Date = new Date()): number | null {
  const idade = horasEntre(a.criado_em, agora)
  if (idade === null || idade <= 0) return null
  return Number((lucroAcumulado(a) / idade).toFixed(4))
}

export function deveReformarOPai(
  pai: Agente,
  filho: Agente,
  agora: Date = new Date(),
): { pode: boolean; porque: string } {
  if (pai.pilar === 'ceo') {
    return { pode: false, porque: 'O CEO não se reforma por um sub-agente — responde ao Ricardo, não aos filhos.' }
  }
  if (pai.estado === 'parado' || pai.estado === 'reformado' || pai.estado === 'morto') {
    return { pode: false, porque: `O pai já está ${pai.estado}.` }
  }
  if (pai.pausado || pai.estado === 'pausado') {
    return { pode: false, porque: 'O pai está pausado pelo dono — a supervisão ganha à regra.' }
  }

  const idadeFilho = horasEntre(filho.criado_em, agora)
  if (idadeFilho === null || idadeFilho < CARENCIA_HORAS) {
    return {
      pode: false,
      porque: `O filho só tem ${Math.floor(idadeFilho ?? 0)} h. Uma venda de sorte na primeira hora dá um ritmo enorme e não prova nada.`,
    }
  }
  if (lucroAcumulado(filho) <= 0) {
    return { pode: false, porque: 'O filho ainda não deu lucro. Render menos mal que o pai não é superá-lo.' }
  }

  const rPai = ritmo(pai, agora)
  const rFilho = ritmo(filho, agora)
  if (rPai === null || rFilho === null) {
    return { pode: false, porque: 'Falta a data de nascimento de um deles — sem idade não há ritmo.' }
  }
  // Um pai a perder dinheiro é superado por qualquer filho que ganhe: a margem multiplicativa não
  // se aplica a números negativos (1.25 × -10 é MAIOR que -10, e isso invertia a regra).
  const alvo = rPai > 0 ? rPai * MARGEM_REFORMA : 0
  if (rFilho <= alvo) {
    return {
      pode: false,
      porque: `O filho rende ${rFilho.toFixed(3)} $/h e o pai ${rPai.toFixed(3)} $/h. ` +
        `Para reformar o pai tem de passar dos ${alvo.toFixed(3)} $/h — ganhar por pouco é ruído, não é evolução.`,
    }
  }
  return {
    pode: true,
    porque: `O filho rende ${rFilho.toFixed(3)} $/h contra ${rPai.toFixed(3)} $/h do pai. ` +
      'Reforma-se o pai: deixou descendência melhor, que é o melhor fim possível para um agente.',
  }
}
