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

export type EstadoAgente = 'vivo' | 'em_risco' | 'parado' | 'pausado'

export interface Agente {
  id: string
  nome: string
  pilar: 'trading' | 'educacao' | 'desenvolvimento' | 'ceo'
  estado: EstadoAgente
  criado_em: string
  /** Dólares que já consumiu (modelo, serviços, anúncios). */
  gasto: number
  /** Dólares que entraram no Stripe e foram ATRIBUÍDOS a este agente. */
  receita: number
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
  const resultado = Number((Number(a.receita ?? 0) - Number(a.gasto ?? 0)).toFixed(2))

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
      porque: `Pagou-se: ${a.receita.toFixed(2)} $ de receita contra ${a.gasto.toFixed(2)} $ de gasto.`,
    }
  }

  const saldo = Number(a.saldo ?? 0)
  if (saldo > 0) {
    return {
      decisao: 'avisa',
      estado: 'em_risco',
      resultado,
      porque: `Sem lucro em ${JANELA_HORAS} h (${resultado.toFixed(2)} $), mas ainda tem ${saldo.toFixed(2)} $ de orçamento. Em risco.`,
    }
  }

  return {
    decisao: 'para',
    estado: 'parado',
    resultado,
    porque: `Sem lucro e sem orçamento: ${a.receita.toFixed(2)} $ de receita, ${a.gasto.toFixed(2)} $ gastos. Pára.`,
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
export function podeClonar(a: Agente, agora: Date = new Date()): { pode: boolean; porque: string } {
  const j = julgar(a, agora)
  if (j.decisao !== 'continua') {
    return { pode: false, porque: `Só clona quem se paga. ${j.porque}` }
  }
  if (j.resultado < ORCAMENTO_INICIAL) {
    return {
      pode: false,
      porque: `Lucro de ${j.resultado.toFixed(2)} $ não chega para financiar um filho (${ORCAMENTO_INICIAL} $).`,
    }
  }
  return { pode: true, porque: `Lucro de ${j.resultado.toFixed(2)} $ financia um filho com ${ORCAMENTO_INICIAL} $.` }
}
