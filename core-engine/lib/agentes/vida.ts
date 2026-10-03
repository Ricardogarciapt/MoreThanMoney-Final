/**
 * A REGRA DE VIDA DOS AGENTES — decide quem continua e quem pára.
 *
 * ═══ A REGRA, EM UMA FRASE ═════════════════════════════════════════════════════════════════
 *
 * Um agente mantém-se vivo enquanto se pagar a si próprio. Se em 48 horas não trouxer receita que
 * cubra o que gastou, pára.
 *
 * ═══ PÁRA, NÃO SE APAGA ════════════════════════════════════════════════════════════════════
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
 * O tempo que um agente tem antes de ser julgado pela primeira vez.
 *
 * Sem isto, um agente nascido às 23h de sexta é avaliado no domingo, sem nunca ter tido um dia útil
 * para vender. A primeira avaliação só conta depois de ele ter tido a janela inteira.
 */
export const CARENCIA_HORAS = JANELA_HORAS

/**
 * `reformado` não é `parado`, e a diferença não é cosmética: **parado é falhanço, reformado é
 * sucesso.** Um agente reforma-se quando um filho dele passa a render mais — deixou descendência
 * melhor, que é o melhor fim possível para um agente. Juntar os dois no mesmo estado perdia a
 * única informação que distingue uma linhagem que evoluiu de uma que morreu.
 */
export type EstadoAgente = 'vivo' | 'em_risco' | 'parado' | 'pausado' | 'reformado'

export interface Agente {
  id: string
  nome: string
  pilar: 'trading' | 'educacao' | 'desenvolvimento' | 'ceo'
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
  /** O orçamento que lhe resta. */
  saldo: number
  /** Quando foi julgado pela última vez. */
  avaliado_em?: string | null
  /** Pausado à mão pelo dono — isto suspende o julgamento, não o acelera. */
  pausado?: boolean
}

export interface Juizo {
  /** O que fazer com este agente. */
  decisao: 'continua' | 'avisa' | 'para' | 'espera'
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
 * O JULGAMENTO.
 *
 * A ordem das perguntas é a regra, e não uma sequência de ifs qualquer:
 *
 *  1. está pausado pelo dono? Então não se julga. A supervisão humana ganha sempre à regra
 *     automática — é esse o ponto de haver supervisão;
 *  2. ainda está na carência? Espera-se;
 *  3. deu lucro? Continua;
 *  4. não deu, mas ainda tem saldo? Avisa-se, e fica em risco. Um agente sem receita mas com
 *     orçamento ainda pode virar o jogo, e matá-lo ao primeiro dia mau é matar o que ainda não
 *     teve tempo de vender;
 *  5. sem lucro e sem saldo: pára.
 */
export function julgar(a: Agente, agora: Date = new Date()): Juizo {
  const temJanela = a.receita_janela != null || a.gasto_janela != null
  const receitaJ = Number(a.receita_janela ?? a.receita ?? 0)
  const gastoJ = Number(a.gasto_janela ?? a.gasto ?? 0)
  const resultado = Number((receitaJ - gastoJ).toFixed(2))
  const comoFoiMedido = temJanela ? '' : ' (medido pelo acumulado — não veio a janela)'

  if (a.pausado || a.estado === 'pausado') {
    return {
      decisao: 'espera',
      estado: 'pausado',
      resultado,
      porque: 'Pausado pelo dono — a regra das 48 horas não corre em agentes pausados.',
    }
  }

  if (a.estado === 'parado') {
    return { decisao: 'espera', estado: 'parado', resultado, porque: 'Já está parado.' }
  }
  if (a.estado === 'reformado') {
    return {
      decisao: 'espera', estado: 'reformado', resultado,
      porque: 'Reformado — um filho dele rende mais. Não se julga quem já passou o testemunho.',
    }
  }

  const idade = horasEntre(a.criado_em, agora)
  if (idade === null) {
    // Sem data de nascimento não se julga: um agente sem data pareceria ter nascido agora, e
    // escaparia para sempre — ou pareceria velhíssimo, e morria à primeira.
    return { decisao: 'espera', estado: a.estado, resultado, porque: 'Sem data de criação — não há janela para julgar.' }
  }
  if (idade < CARENCIA_HORAS) {
    const faltam = Math.ceil(CARENCIA_HORAS - idade)
    return {
      decisao: 'espera',
      estado: 'vivo',
      resultado,
      porque: `Ainda na carência: nasceu há ${Math.floor(idade)} h e a primeira avaliação é às ${CARENCIA_HORAS} h (faltam ${faltam} h).`,
    }
  }

  if (resultado > 0) {
    return {
      decisao: 'continua',
      estado: 'vivo',
      resultado,
      porque: `Pagou-se: ${receitaJ.toFixed(2)} $ de receita contra ${gastoJ.toFixed(2)} $ de gasto${comoFoiMedido}.`,
    }
  }

  const saldo = Number(a.saldo ?? 0)
  if (saldo > 0) {
    return {
      decisao: 'avisa',
      estado: 'em_risco',
      resultado,
      porque: `Sem lucro em ${JANELA_HORAS} h (${resultado.toFixed(2)} $)${comoFoiMedido}, mas ainda tem ${saldo.toFixed(2)} $ de orçamento. Em risco.`,
    }
  }

  /**
   * A EXCEPÇÃO, aplicada exactamente onde a regra mataria — e não antes.
   *
   * Pô-la no topo do `julgar` era tentador e era pior: o CEO saía da função sem ter sido medido, e
   * o painel não saberia dizer se ele se paga. Aqui ele passou por tudo, o número está feito, e o
   * que a excepção muda é só o destino: em vez de `parado`, fica `em_risco` com o motivo à vista.
   */
  if (eImortal(a)) {
    return {
      decisao: 'avisa',
      estado: 'em_risco',
      resultado,
      porque:
        `Sem lucro e sem orçamento: ${receitaJ.toFixed(2)} $ de receita, ${gastoJ.toFixed(2)} $ gastos${comoFoiMedido}. ` +
        'NÃO pára — é o CEO, e a regra das 48 h tem nele uma excepção nomeada (decisão do dono, 01/10): ' +
        'parar o único que cria e pára sub-agentes deixava a equipa sem ninguém a julgá-la. ' +
        'Fica em risco, à vista, e continua a ser medido pela mesma régua — a imortalidade não lhe melhora a nota, ' +
        'e não se estende a nenhum filho.',
    }
  }

  return {
    decisao: 'para',
    estado: 'parado',
    resultado,
    porque: `Sem lucro e sem orçamento: ${receitaJ.toFixed(2)} $ de receita, ${gastoJ.toFixed(2)} $ gastos${comoFoiMedido}. Pára.`,
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
  if (a.estado === 'parado' || a.estado === 'reformado') {
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
  if (pai.estado === 'parado' || pai.estado === 'reformado') {
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
