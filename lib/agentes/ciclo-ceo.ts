/**
 * O CICLO DO CEO — ler o estado da equipa, ver quem não se paga, e PEDIR algo concreto com prazo.
 *
 * ═══ O PEDIDO DO DONO (01/10), E O QUE ELE OBRIGA ══════════════════════════════════════════
 *
 * Palavras dele: «deve agora auto-correr as suas tarefas e as dos sub-agentes, para fazerem
 * dinheiro e os sub-agentes sobreviverem. O agente CEO é IMORTAL, mas deve começar a pressionar os
 * sub-agentes e filhos para resultados».
 *
 * «Pressionar» sem registo é uma palavra. O que faz dela uma coisa verificável é haver, na base, o
 * PEDIDO (o que foi pedido, a quem, porquê e até quando) e o DESFECHO (o que saiu, ou que não saiu
 * nada). Sem as duas metades, no mês seguinte ninguém consegue dizer se o CEO pressionou e os
 * filhos não entregaram, ou se o CEO nunca pediu nada — e essas duas situações pedem decisões
 * opostas ao dono.
 *
 * ═══ A ORDEM DAS DECISÕES, QUE É A REGRA E NÃO UMA SEQUÊNCIA DE IFS ════════════════════════
 *
 *  1. **não se pressiona quem o dono pausou.** A supervisão humana ganha sempre à regra
 *     automática — é o mesmo princípio de `vida.ts`, e vale também para pedidos;
 *  2. **não se pressiona quem está parado ou reformado.** Um agente parado não trabalha; pedir-lhe
 *     resultados é encher a tabela de pedidos que ninguém pode cumprir. Repor um agente parado é
 *     decisão do dono;
 *  3. **na carência não se COBRA — mas DÁ-SE TRABALHO.** E esta é a correcção de 01/10, que vem de
 *     ver o sistema a correr: a passagem avaliou os sete agentes, parou zero, e criou ZERO pedidos.
 *     A tabela ficou vazia porque a carência travava a emissão inteira.
 *
 *     O raciocínio original — «cobrar a quem nunca teve janela é cobrar o que o sistema ainda não
 *     lhe deu tempo de fazer» — está certo e mantém-se. O que ele não distinguia é que COBRAR e DAR
 *     TRABALHO não são a mesma coisa:
 *
 *       · `justificar` e `baixar_custo` são COBRANÇA — pedem contas de um resultado. Estes esperam
 *         pela carência, e é para isto que ela existe;
 *       · `construir`, `propor` e `medir` são TRABALHO. Travá-los na carência é o contrário do que
 *         ela serve: ela existe para dar ao agente TEMPO PARA TRABALHAR antes de ser julgado. O
 *         efeito que se media era o oposto — um agente novo ficava 48 h sem nada que fazer, e
 *         depois era julgado pelo que não fez nessas 48 h.
 *
 *     É uma armadilha com a forma exacta da que esta casa já conhece: parado por falta de medição,
 *     não de trabalho. Ver {@link NATUREZA};
 *  4. **não se pressiona quem se paga.** Se o trabalho dele cobre o que gasta, um pedido é ruído —
 *     e um registo cheio de ruído é um registo onde não se encontra nada;
 *  5. **não se repete o pedido enquanto o prazo corre.** Sem isto, o cron diário mandava o mesmo
 *     pedido todos os dias até o agente morrer, e ninguém lê o segundo;
 *  6. **um prazo que passou FECHA-SE com desfecho `sem_resposta`** antes de se pedir outra coisa.
 *     Deixar o pedido velho aberto era o caminho para a tabela crescer com pedidos eternos e a
 *     pergunta «este foi cumprido?» não ter resposta.
 *
 * ═══ O QUE SE PEDE A QUEM NÃO É MEDIDO ════════════════════════════════════════════════════
 *
 * Esta é a parte que vem da lição de 01/10 e é o contrário do reflexo. Ao agente que tem receita
 * zero **não se pede mais trabalho: pede-se MEDIÇÃO.** Nesse dia a equipa toda tinha receita zero e
 * trabalho feito — o que faltava era um link com `?ag=` em algum sítio. Mandar trabalhar mais quem
 * não tem onde ser medido produz mais trabalho invisível, e depois a régua mata-o com um motivo que
 * parece sólido.
 *
 * ═══ O CATÁLOGO É FECHADO, E É AÍ QUE OS LIMITES VIVEM ════════════════════════════════════
 *
 * O CEO não pede o que lhe apetecer: pede uma de {@link ACCOES}. Um catálogo fechado é o que
 * impede a autonomia de se esticar — não há forma de escrever um pedido «envia esta mensagem» ou
 * «cobra este cliente», porque não existe acção para isso. Os limites de `conhecimento.ts` não são
 * revogados por esta autonomia; aqui ficam impostos pela forma e não pela boa vontade, e
 * {@link ACCOES_RECUSADAS} nomeia o que foi deixado de fora de propósito.
 *
 * ═══ PURO, PORQUE ERRA EM SILÊNCIO ════════════════════════════════════════════════════════
 *
 * Nada aqui rebenta. Pressionar quem o dono pausou, repetir o mesmo pedido todos os dias, ou nunca
 * fechar um prazo: nenhum dá erro no ecrã. `ciclo-ceo.check.ts` atira-lhe os casos maus sem base de
 * dados.
 */
import { CARENCIA_HORAS, JANELA_HORAS, julgar, type Agente, type Juizo } from './vida'
import { montarAgente, somarJanela, type EventoLido, type LinhaAgente } from './motor'

/** Quanto tempo um pedido tem para ser cumprido, por omissão. */
export const PRAZO_HORAS = JANELA_HORAS

export type Accao = 'medir' | 'propor' | 'construir' | 'baixar_custo' | 'justificar'

export interface DefinicaoAccao {
  /** O que o agente tem de fazer, em português e sem ambiguidade. */
  oQue: string
  /** Horas até ao prazo. */
  prazoHoras: number
  /** Como se sabe que foi cumprido. Um pedido sem forma de verificação não é um pedido. */
  comoSeVe: string
}

/**
 * O QUE O CEO PODE PEDIR. Nada fora desta lista.
 *
 * Repare-se no que todas têm em comum: produzem TRABALHO ou TEXTO, dentro de casa. Nenhuma toca
 * num cliente, num preço ou em dinheiro.
 */
export const ACCOES: Record<Accao, DefinicaoAccao> = {
  medir: {
    oQue:
      'Põe o teu código de agente nos links nossos do que já produzes, para o teu trabalho passar a ' +
      'ser medível. Enquanto não houver um link teu clicável, a tua receita é zero por falta de ' +
      'medição e não de trabalho — e a régua das 48 h não sabe distinguir as duas coisas.',
    prazoHoras: PRAZO_HORAS,
    comoSeVe: 'Existe pelo menos um link nosso marcado com o teu código no que publicaste ou preparaste.',
  },
  propor: {
    oQue:
      'Entrega uma proposta escrita de uma coisa concreta que traga receita: o que é, a quem se ' +
      'vende, porque é que essa pessoa paga, e o que precisas para a pôr de pé. Decide o dono.',
    prazoHoras: PRAZO_HORAS,
    comoSeVe: 'Uma proposta escrita, com a origem de cada número que usar.',
  },
  construir: {
    oQue:
      'Constrói o que já foi aprovado: código, página, sistema ou app, no repositório. Construir é ' +
      'teu; publicar, cobrar ou mexer em preços é do dono.',
    prazoHoras: 72,
    comoSeVe: 'O trabalho está no repositório e corre. Publicar fica à espera do dono.',
  },
  baixar_custo: {
    oQue:
      'Baixa o que gastas até caber no que trazes. Pagar-se a si próprio também se consegue pelo ' +
      'lado do custo, e é o lado que depende só de ti.',
    prazoHoras: PRAZO_HORAS,
    comoSeVe: 'O gasto na janela desce abaixo da receita da janela.',
  },
  justificar: {
    oQue:
      'Diz, por escrito, porque é que a tua medição está errada — se achas que está. Um agente não ' +
      'arranja um número que lhe pareça errado: diz que lhe parece errado, e diz onde se confirma.',
    prazoHoras: 24,
    comoSeVe: 'Uma explicação escrita que aponte ao sítio onde o número se confirma.',
  },
}

/**
 * O QUE FICOU DE FORA, NOMEADO.
 *
 * Está escrito porque um limite que não se nomeia parece um esquecimento, e alguém «completa» o
 * catálogo de boa fé. Estes quatro não entram: não é falta de implementação, é a decisão.
 */
export const ACCOES_RECUSADAS: Record<string, string> = {
  enviar:
    'Enviar mensagens a clientes existe na casa e é para crescer os grupos — mas NÃO é um pedido ' +
    'que o CEO faça sozinho e o mecanismo não vive aqui. Um envio não se desfaz.',
  cobrar:
    'Cobrar, transferir, mover cripto: nenhum agente mexe em dinheiro. Receita LÊ-SE; dinheiro que ' +
    'sai é decisão do dono.',
  publicar:
    'Publicar, pôr preço ou lançar campanha é do dono. Construir é do agente; a decisão de pôr à ' +
    'venda é de quem assume o negócio.',
  executar_ordem:
    'Abrir, fechar ou alterar uma ordem de trading: nunca. A conta do agente trader é de PAPEL de ' +
    'propósito.',
}

/**
 * COBRANÇA OU TRABALHO — e é esta tabela que decide o que a carência trava.
 *
 * A distinção não é cosmética e custou uma tabela de pedidos vazia para aparecer. Um pedido de
 * TRABALHO dá ao agente algo que fazer; um pedido de COBRANÇA pede-lhe contas de um resultado.
 * Durante a carência só o primeiro faz sentido — o segundo cobrava um resultado que o sistema
 * ainda não lhe deu tempo de produzir.
 *
 * Está como `Record` completo de propósito: acrescentar uma acção ao catálogo obriga a dizer, ali
 * mesmo, se ela é trabalho ou cobrança. Um `switch` com `default` deixava a acção nova cair numa
 * das duas sem ninguém decidir — e a que ela calhasse não dava erro nenhum.
 */
export const NATUREZA: Record<Accao, 'trabalho' | 'cobranca'> = {
  medir: 'trabalho',
  propor: 'trabalho',
  construir: 'trabalho',
  baixar_custo: 'cobranca',
  justificar: 'cobranca',
}

export function ehCobranca(accao: Accao): boolean {
  return NATUREZA[accao] === 'cobranca'
}

export function accaoPermitida(x: unknown): { pode: boolean; porque: string } {
  const a = String(x ?? '').trim()
  if (a in ACCOES) return { pode: true, porque: ACCOES[a as Accao].comoSeVe }
  if (a in ACCOES_RECUSADAS) return { pode: false, porque: ACCOES_RECUSADAS[a] }
  return {
    pode: false,
    porque: `«${a || '(vazio)'}» não é uma acção do catálogo. O catálogo é fechado de propósito: é ele que impede os pedidos de se esticarem para fora do que um agente pode fazer.`,
  }
}

/** Um pedido que já está na base e ainda não teve desfecho. */
export interface PedidoAberto {
  id: string
  para_agente_id: string
  accao: string
  prazo: string
  criado_em: string
}

/** O estado de um agente, como o ciclo precisa de o ver. */
export interface AgenteNoCiclo {
  agente: Agente
  juizo: Juizo
  /** Horas de vida. Serve para a carência — um agente novo não é cobrado. */
  idadeHoras: number | null
  /** Quanto é que a ligação FORTE mediu para este agente, quando se sabe. */
  receitaMedidaForte?: number | null
}

export interface PedidoNovo {
  paraAgenteId: string
  paraNome: string
  accao: Accao
  pedido: string
  porque: string
  prazoISO: string
}

export interface PedidoAFechar {
  id: string
  paraAgenteId: string
  desfecho: 'sem_resposta'
  porque: string
}

export interface Ignorado {
  nome: string
  porque: string
}

export interface PlanoCiclo {
  pedidos: PedidoNovo[]
  aFechar: PedidoAFechar[]
  ignorados: Ignorado[]
  /** Uma frase para o evento do CEO. É isto que fica no livro como prova de que ele correu. */
  resumo: string
}

function horas(desde: string | null | undefined, agora: Date): number | null {
  if (!desde) return null
  const t = Date.parse(String(desde))
  if (!Number.isFinite(t)) return null
  return (agora.getTime() - t) / 3_600_000
}

/**
 * QUE ACÇÃO É QUE ESTE AGENTE PRECISA DE OUVIR.
 *
 * A escolha não é de gosto e é o coração deste ficheiro:
 *
 *  · **receita zero → `medir`.** Não se pede mais trabalho a quem não tem onde ser medido. Ver o
 *    cabeçalho;
 *  · **tem receita mas gasta mais → `baixar_custo`.** Está medido e vende; o problema é o custo, e
 *    o custo é o lado que depende só dele;
 *  · **já foi cobrado antes e continua sem receita → `justificar`.** À segunda vez, a pergunta
 *    certa deixa de ser «trabalha mais» e passa a ser «isto está mesmo medido?». É a lição de
 *    01/10 virada em procedimento: o sistema tem de deixar o agente dizer que a conta está errada,
 *    senão a única resposta possível é morrer calado.
 *
 * `naCarencia` corta as duas acções de COBRANÇA e deixa só trabalho — ver {@link NATUREZA} e o
 * ponto 3 do cabeçalho. Não é uma excepção simpática: um agente de 5 horas a quem se pede para
 * «baixar o custo» recebe um pedido impossível (não gastou nada ainda), e um a quem se pede para
 * «justificar a medição» recebe uma pergunta sobre uma janela que ainda não existe.
 */
export function accaoPara(
  a: AgenteNoCiclo,
  jaFoiCobrado: boolean,
  naCarencia = false,
): { accao: Accao; porque: string } {
  const receitaJ = Number(a.agente.receita_janela ?? a.agente.receita ?? 0)
  const gastoJ = Number(a.agente.gasto_janela ?? a.agente.gasto ?? 0)

  if (naCarencia) {
    /**
     * Na carência o agente não tem resultado nenhum para defender, e por isso só há duas coisas
     * sensatas a dar-lhe: se ainda não é medível, tornar-se medível (`medir`) — porque sem isso
     * tudo o que ele produzir nas próximas 48 h vai aparecer como zero no primeiro julgamento, que
     * é precisamente a armadilha de 01/10; se já traz receita, crescer (`propor`).
     */
    if (receitaJ <= 0) {
      return {
        accao: 'medir',
        porque:
          `Está na carência: ainda não vai ser julgado, e por isso NÃO se lhe cobra nada. O que se ` +
          `lhe dá é trabalho — e o primeiro trabalho de quem acaba de nascer é tornar-se medível, ` +
          `senão tudo o que produzir nestas primeiras ${JANELA_HORAS} h aparece como zero no primeiro ` +
          'julgamento, e o motivo escrito na linha vai parecer sólido.',
      }
    }
    return {
      accao: 'propor',
      porque:
        `Está na carência e já traz ${receitaJ.toFixed(2)} na janela: não há nada a corrigir, há tempo ` +
        'para usar. Dá-se trabalho, não contas.',
    }
  }

  if (receitaJ <= 0) {
    if (jaFoiCobrado) {
      return {
        accao: 'justificar',
        porque:
          `Segunda cobrança seguida com receita zero em ${JANELA_HORAS} h. Antes de se concluir que ` +
          'não trabalha, tem de poder dizer que não está medido — foi assim que a equipa inteira ' +
          'quase parou a 01/10, com o motivo «sem_codigo» a parecer sólido em cada venda.',
      }
    }
    return {
      accao: 'medir',
      porque:
        `Receita zero na janela de ${JANELA_HORAS} h, com ${gastoJ.toFixed(2)} de gasto. Zero pode ser ` +
        'falta de trabalho ou falta de MEDIÇÃO, e sem um link marcado não há como saber qual — por ' +
        'isso o primeiro pedido é tornar-se medível, não produzir mais.',
    }
  }

  if (receitaJ <= gastoJ) {
    return {
      accao: 'baixar_custo',
      porque:
        `Traz ${receitaJ.toFixed(2)} e gasta ${gastoJ.toFixed(2)} na janela: está medido e vende, mas não ` +
        'se paga. O custo é o lado que depende só dele.',
    }
  }

  return {
    accao: 'propor',
    porque: `Paga-se (${receitaJ.toFixed(2)} contra ${gastoJ.toFixed(2)}): o pedido é crescer, não corrigir.`,
  }
}

/**
 * O PLANO DO CICLO — puro.
 *
 * `ceoId` existe para o CEO não se pedir coisas a si próprio: ele responde ao Ricardo, não a si. E
 * um pedido do CEO para o CEO seria exactamente o tipo de registo que enche a tabela e não ensina
 * nada a ninguém.
 */
export function planearCiclo(entrada: {
  ceoId: string
  equipa: AgenteNoCiclo[]
  abertos: PedidoAberto[]
  agora?: Date
}): PlanoCiclo {
  const agora = entrada.agora ?? new Date()
  const pedidos: PedidoNovo[] = []
  const aFechar: PedidoAFechar[] = []
  const ignorados: Ignorado[] = []

  const abertosPor = new Map<string, PedidoAberto[]>()
  for (const p of entrada.abertos ?? []) {
    const lista = abertosPor.get(String(p.para_agente_id)) ?? []
    lista.push(p)
    abertosPor.set(String(p.para_agente_id), lista)
  }

  for (const x of entrada.equipa ?? []) {
    const nome = x.agente.nome || x.agente.id
    const id = String(x.agente.id)

    if (id === String(entrada.ceoId)) {
      ignorados.push({ nome, porque: 'É o CEO. Ele responde ao dono, não a si próprio.' })
      continue
    }

    // 1. A supervisão do dono ganha à regra automática — aqui como em `vida.ts`.
    if (x.agente.pausado || x.agente.estado === 'pausado') {
      ignorados.push({ nome, porque: 'Pausado pelo dono. Não se cobra resultados a quem uma pessoa mandou parar.' })
      continue
    }

    // 2. Parado ou reformado: nada há a pedir, e repor é do dono.
    // 06/10: e `morto` — arquivado, não volta a correr; um pedido a um morto nunca se cumpre.
    if (x.agente.estado === 'parado' || x.agente.estado === 'reformado' || x.agente.estado === 'morto') {
      ignorados.push({ nome, porque: `Está ${x.agente.estado}. Pedir trabalho a quem não trabalha enche o registo e não produz nada.` })
      continue
    }

    /**
     * 3. A carência: NÃO SE COBRA, MAS DÁ-SE TRABALHO.
     *
     * Era aqui que o ciclo acabava, e era por isso que a tabela de pedidos estava vazia depois da
     * primeira passagem a sério (01/10): os sete agentes tinham o relógio reposto, logo estavam
     * todos na carência, logo ninguém recebeu nada. A carência existe para dar TEMPO DE TRABALHAR
     * antes do julgamento — travar o trabalho durante ela produzia o contrário: 48 h sem nada que
     * fazer, seguidas de um julgamento sobre o que não foi feito nessas 48 h.
     *
     * O que se trava é a COBRANÇA, e é só isso. Ver {@link NATUREZA}.
     */
    const naCarencia = x.idadeHoras !== null && x.idadeHoras < CARENCIA_HORAS
    const faltamHoras = naCarencia ? Math.ceil(CARENCIA_HORAS - (x.idadeHoras ?? 0)) : 0

    /**
     * 4. Quem se paga não é pressionado.
     *
     * O juízo é a fonte, e não uma conta repetida aqui: `vida.ts` já decidiu se este agente se
     * paga, e uma segunda conta neste ficheiro podia discordar da primeira. Quando discordasse,
     * ninguém saberia qual das duas estava certa.
     *
     * Na carência este bloco NÃO corre, e tem de ser assim: `julgar` devolve `espera` a quem está
     * na carência, por isso deixá-lo correr voltava a travar o trabalho pela porta do lado — a
     * regra teria ficado escrita acima e sem efeito nenhum, que é a pior das duas situações.
     */
    if (!naCarencia) {
      if (x.juizo.decisao === 'continua') {
        ignorados.push({ nome, porque: `Paga-se (${x.juizo.resultado.toFixed(2)} na janela). Pressionar quem funciona é ruído.` })
        continue
      }
      if (x.juizo.decisao === 'espera') {
        ignorados.push({ nome, porque: `Não julgado nesta passagem: ${x.juizo.porque}` })
        continue
      }
    }

    // 5. Já tem um pedido aberto dentro do prazo? Não se repete.
    const meus = abertosPor.get(id) ?? []
    const dentroDoPrazo = meus.filter((p) => {
      const t = Date.parse(String(p.prazo))
      // Um prazo ilegível trata-se como AINDA A CORRER, de propósito: fechá-lo por não se
      // conseguir ler a data era dar `sem_resposta` a quem talvez tenha respondido.
      return !Number.isFinite(t) || t > agora.getTime()
    })
    const expirados = meus.filter((p) => !dentroDoPrazo.includes(p))

    for (const p of expirados) {
      aFechar.push({
        id: String(p.id),
        paraAgenteId: id,
        desfecho: 'sem_resposta',
        porque:
          `O prazo do pedido «${p.accao}» passou em ${p.prazo} e não houve resultado registado. ` +
          'Fecha-se com desfecho em vez de ficar aberto para sempre: um pedido eterno não responde ' +
          'à pergunta «isto foi cumprido?».',
      })
    }

    if (dentroDoPrazo.length > 0) {
      const p = dentroDoPrazo[0]
      ignorados.push({
        nome,
        porque: `Já tem o pedido «${p.accao}» aberto até ${p.prazo}. Repetir todos os dias é mandar um aviso que ninguém lê ao segundo.`,
      })
      continue
    }

    const { accao, porque } = accaoPara(x, expirados.length > 0, naCarencia)

    /**
     * O último travão, e é de forma e não de boa vontade: na carência NUNCA sai um pedido de
     * cobrança. `accaoPara` já o garante, mas uma segunda pessoa a mexer nessa função não tem como
     * saber que esta é a regra — aqui ela está escrita onde o pedido é emitido, e quem a quebrar
     * vê o agente a ser ignorado com o motivo em vez de receber uma cobrança por acidente.
     */
    if (naCarencia && ehCobranca(accao)) {
      ignorados.push({
        nome,
        porque:
          `Está na carência (faltam ${faltamHoras} h) e a acção escolhida («${accao}») é cobrança. ` +
          'Não se cobra um resultado a quem o sistema ainda não deu tempo de produzir.',
      })
      continue
    }

    const def = ACCOES[accao]
    const notaCarencia = naCarencia
      ? ` ISTO NÃO É UMA COBRANÇA: estás na carência e faltam ${faltamHoras} h para a primeira ` +
        'avaliação. É trabalho, para teres o que mostrar quando ela chegar.'
      : ''
    pedidos.push({
      paraAgenteId: id,
      paraNome: nome,
      accao,
      pedido: def.oQue,
      porque: `${porque} Verifica-se assim: ${def.comoSeVe}${notaCarencia}`,
      prazoISO: new Date(agora.getTime() + def.prazoHoras * 3_600_000).toISOString(),
    })
  }

  const resumo =
    pedidos.length === 0 && aFechar.length === 0
      ? `Ciclo do CEO: nada a pedir. ${ignorados.length} agente(s) fora do pedido, cada um com motivo escrito.`
      : `Ciclo do CEO: ${pedidos.length} pedido(s) com prazo (${pedidos.map((p) => `${p.paraNome}→${p.accao}`).join(', ') || '—'}), ` +
        `${aFechar.length} prazo(s) fechado(s) sem resposta, ${ignorados.length} não pressionado(s).`

  return { pedidos, aFechar, ignorados, resumo }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A partir daqui há base de dados. Tudo o que decide ficou acima, puro e provado.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

export interface ResultadoCiclo {
  ok: boolean
  ensaio: boolean
  pedidos: Array<{ para: string; accao: Accao; prazo: string; porque: string }>
  fechados: number
  ignorados: Ignorado[]
  resumo: string
  erros: string[]
}

/**
 * CORRER O CICLO.
 *
 * Lê a equipa, monta os mesmos factos que a régua de vida usa (de propósito: dois conjuntos de
 * factos sobre o mesmo agente acabam sempre a discordar), planeia, e escreve.
 *
 * `ensaio: true` mostra tudo sem escrever nada.
 *
 * ── O QUE ISTO NÃO FAZ ──
 *
 * Não envia nada a ninguém, não toca em dinheiro, não publica e não para agentes. Parar continua a
 * ser da régua de vida (`motor.ts`) e do dono. Um pedido é texto numa tabela com prazo — é isso que
 * «pressionar» quer dizer aqui, e é tudo o que quer dizer.
 */
export async function correrCicloCeo(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date } = {},
): Promise<ResultadoCiclo> {
  const ensaio = opcoes.ensaio === true
  const agora = opcoes.agora ?? new Date()
  const erros: string[] = []
  const vazio: ResultadoCiclo = {
    ok: false, ensaio, pedidos: [], fechados: 0, ignorados: [], resumo: '', erros,
  }

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select('id, nome, papel, pilar, pai_id, estado, pausado, orcamento, gasto, receita, chave_receita, avaliado_em, criado_em')
  if (error) {
    erros.push(`agentes_equipa: ${error.message ?? 'erro'}`)
    return { ...vazio, resumo: 'Ciclo não correu: não se leu a equipa.' }
  }
  const equipaBruta = (linhas ?? []) as LinhaAgente[]

  const ceo = equipaBruta.find((l) => l.pilar === 'ceo' && !l.pai_id)
  if (!ceo) {
    // Sem CEO não há quem pressione. NÃO se elege um substituto: promover o primeiro agente da
    // lista a chefe por omissão era dar-lhe um poder que ninguém lhe deu.
    erros.push('Não há CEO (pilar ceo, sem pai) — ninguém faz pedidos, e não se promove ninguém por omissão.')
    return { ...vazio, resumo: 'Ciclo não correu: não há CEO.' }
  }

  const desde = new Date(agora.getTime() - (JANELA_HORAS + 1) * 3_600_000).toISOString()
  const { data: eventos, error: erroEventos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, criado_em')
    .gte('criado_em', desde)
    .in('tipo', ['receita', 'gastou'])
  if (erroEventos) {
    // Sem os eventos, a janela de todos seria zero e o CEO cobrava a equipa inteira por uma falha
    // de leitura. Vale muito mais não pedir nada nesta passagem.
    erros.push(`agentes_eventos: ${erroEventos.message ?? 'erro'} — ninguém foi pressionado nesta passagem`)
    return { ...vazio, resumo: 'Ciclo não correu: a janela não se leu, e cobrar com a conta errada é pior do que não cobrar.' }
  }
  const somas = somarJanela((eventos ?? []) as EventoLido[], agora)

  const { data: abertosRaw, error: erroAbertos } = await db
    .from('agentes_pedidos')
    .select('id, para_agente_id, accao, prazo, criado_em')
    .is('desfecho', null)
  if (erroAbertos) {
    // Sem saber o que já está aberto, o ciclo repetia pedidos — e a tabela deixava de servir para
    // nada porque toda a gente teria cinco pedidos iguais.
    erros.push(`agentes_pedidos: ${erroAbertos.message ?? 'erro'} — não se repete às cegas`)
    return { ...vazio, resumo: 'Ciclo não correu: não se leram os pedidos abertos.' }
  }

  const equipa: AgenteNoCiclo[] = []
  for (const l of equipaBruta) {
    const montado = montarAgente(l, somas.get(String(l.id)))
    if (montado.ilegivel.length) {
      // O mesmo princípio do motor: um agente cuja linha não se consegue ler não se julga nem se
      // cobra. Corrige-se a linha, não o agente.
      equipa.push({
        agente: montado.agente,
        juizo: { decisao: 'espera', estado: montado.agente.estado, resultado: 0, porque: `campos ilegíveis (${montado.ilegivel.join(', ')})` },
        idadeHoras: horas(l.criado_em, agora),
      })
      continue
    }
    equipa.push({
      agente: montado.agente,
      juizo: julgar(montado.agente, agora),
      idadeHoras: horas(l.criado_em, agora),
    })
  }

  const plano = planearCiclo({
    ceoId: String(ceo.id),
    equipa,
    abertos: (abertosRaw ?? []) as PedidoAberto[],
    agora,
  })

  let fechados = 0
  if (!ensaio) {
    for (const f of plano.aFechar) {
      const { error: e } = await db
        .from('agentes_pedidos')
        .update({ desfecho: f.desfecho, desfecho_em: agora.toISOString(), resultado: f.porque })
        .eq('id', f.id)
      if (e) erros.push(`pedido ${f.id} não fechado (${e.message ?? 'erro'})`)
      else fechados++
    }

    for (const p of plano.pedidos) {
      const { error: e } = await db.from('agentes_pedidos').insert({
        de_agente_id: String(ceo.id),
        para_agente_id: p.paraAgenteId,
        accao: p.accao,
        pedido: p.pedido,
        porque: p.porque,
        prazo: p.prazoISO,
      })
      if (e) erros.push(`pedido a ${p.paraNome} não gravado (${e.message ?? 'erro'})`)
    }

    /**
     * E o CEO presta contas do que fez. Sem esta linha, uma passagem em que ele não pediu nada é
     * indistinguível de uma passagem em que ele não correu — e as duas pedem decisões diferentes
     * ao dono.
     */
    const { error: eEvento } = await db.from('agentes_eventos').insert({
      agente_id: String(ceo.id),
      tipo: 'trabalho',
      detalhe: plano.resumo,
    })
    if (eEvento) erros.push(`evento do ciclo não gravado (${eEvento.message ?? 'erro'})`)
  } else {
    fechados = plano.aFechar.length
  }

  return {
    ok: erros.length === 0,
    ensaio,
    pedidos: plano.pedidos.map((p) => ({ para: p.paraNome, accao: p.accao, prazo: p.prazoISO, porque: p.porque })),
    fechados,
    ignorados: plano.ignorados,
    resumo: plano.resumo,
    erros,
  }
}
