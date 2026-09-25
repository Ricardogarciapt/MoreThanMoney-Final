/**
 * O QUE DIZER A SEGUIR — o apoio ao negócio em curso, no pipeline.
 *
 * PORQUE É QUE ISTO NÃO CHAMA UM MODELO
 * O pedido era «sugestões do que dizer a seguir, com base no estado do negócio e no que já
 * aconteceu». A tentação era mandar cada linha do pipeline a uma IA. Não se faz, por três razões,
 * e a terceira é a que decide:
 *
 * 1. Uma chamada por negócio significa vinte chamadas para abrir uma página.
 * 2. O passo seguinte de um negócio em `marcado` é sempre o mesmo passo — não é uma pergunta
 *    aberta, é o guião da casa (`docs/mtm-sales-brain.md` §5 e §6).
 * 3. Um modelo a improvisar o passo seguinte inventa números. É exactamente assim que apareceram
 *    as promessas de «50% recorrente» e «20 000 €/mês» que tivemos de ir tirar de texto público.
 *    Aqui não há nada a inventar: o movimento é fixo e os preços, quando são precisos, vêm por
 *    função de `lib/escada-precos.ts`.
 *
 * Isto é a memória de vendas da casa escrita como código, não um gerador. Ficheiro PURO: prova-se
 * em `lib/backoffice-playbook.check.ts` sem rede e sem base.
 */
import { escadaNumaLinha, bonusNumaLinha, NOME_DEGRAU_TOPO } from '@/lib/escada-precos'
import type { EstadoPipeline } from '@/lib/backoffice-vista'

export interface Sugestao {
  /** O movimento, em três ou quatro palavras. É o que a pessoa lê primeiro. */
  passo: string
  /** Porque é este o passo. Sem isto, a sugestão é uma ordem sem razão e ignora-se. */
  porque: string
  /** O que dizer — ponto de partida para a pessoa escrever, nunca uma mensagem para colar às cegas. */
  abrir: string
}

/**
 * NADA DE NÚMEROS ESCRITOS À MÃO aqui dentro. Quando um passo precisa da escada, chama a função —
 * e é isso que faz com que um preço mudado num sítio mude aqui também. A guarda deste ficheiro
 * falha se aparecer um preço escrito.
 */
const GUIAO: Record<EstadoPipeline, Sugestao> = {
  lead: {
    passo: 'Primeiro contacto',
    porque:
      'Um lead sem contacto não é um negócio, é um nome numa lista. Enquanto ninguém falar com ele, o estado não muda sozinho.',
    abrir:
      'Uma mensagem curta, pessoal, com uma pergunta só: onde é que a pessoa está hoje (nunca fez nada / já tentou sozinha / já opera). Não se manda escada nem links no primeiro contacto.',
  },
  contactado: {
    passo: 'Qualificar antes de apresentar',
    porque:
      'Apresentar a escada a quem ainda não disse o que quer é uma discussão de preço. Qualificar primeiro (experiência, dor, disponibilidade) é o que permite apresentar só o degrau que serve.',
    abrir:
      'Uma pergunta de cada vez: qual é a dor principal, e quanto tempo por semana tem. É a resposta a essas duas que escolhe o degrau.',
  },
  qualificado: {
    passo: 'Marcar a conversa',
    porque:
      'Está qualificado: já se sabe o que quer. O que falta é hora marcada — um negócio qualificado que fica a arrastar-se esfria e volta ao início.',
    abrir:
      'Propor duas horas concretas, não «quando puderes». E dizer o que vai acontecer na conversa, para não parecer uma chamada de venda às cegas.',
  },
  marcado: {
    passo: 'Confirmar antes da hora',
    porque:
      'A maior parte dos «não apareceu» resolve-se com uma confirmação no dia. Marcar e não confirmar é onde se perde a reunião que já estava ganha.',
    abrir:
      'Mensagem no dia: confirmar a hora e o link, e pedir uma resposta de uma palavra. Se não responder, ligar.',
  },
  no_show: {
    passo: 'Recuperar, sem culpar',
    porque:
      'Um «não apareceu» não é um «não». Tratado como recusa perde-se um negócio que só teve um dia mau; tratado como falta de educação perde-se a pessoa.',
    abrir:
      'Dar o benefício da dúvida por escrito e voltar a propor duas horas. Uma vez. Se não houver resposta à segunda, passa a perdido com o motivo — e o motivo é o que ensina a equipa.',
  },
  apresentado: {
    passo: 'Fechar no degrau que serve',
    porque:
      'A escada já foi apresentada: o que falta é escolher com a pessoa, e não voltar a explicá-la. Reapresentar é começar outra vez.',
    abrir:
      `Perguntar qual dos degraus faz sentido para ela HOJE e fechar nesse. A escada, pela ordem da casa: ${escadaNumaLinha()}. ` +
      `O ${NOME_DEGRAU_TOPO} é para quem sobe, nunca a abertura.`,
  },
  ganho: {
    passo: 'Garantir que entra e fica',
    porque:
      'Ganho no pipeline não é dinheiro na conta — é o closer a dizer que fechou. A comissão só nasce quando o pagamento é confirmado, e quem não chega a entrar no produto cancela no primeiro mês.',
    abrir:
      'Confirmar que a pessoa entrou mesmo (app, grupos, acessos) e que sabe qual é o primeiro passo dela lá dentro. A venda que não se usa devolve-se.',
  },
  perdido: {
    passo: 'Escrever o motivo',
    porque:
      'Um pipeline sem motivos de perda não ensina nada a quem vende. E há motivos que voltam a abrir: quem disse «não é agora» não disse «não».',
    abrir:
      'Deixar o motivo escrito no negócio. Se foi preço, é aqui que se anota — e é o único sítio onde essa informação vale alguma coisa mais tarde.',
  },
}

export function sugestaoPara(estado: EstadoPipeline): Sugestao {
  return GUIAO[estado]
}

/**
 * Quantos dias um negócio está sem se mexer.
 *
 * Não é decoração: é o único número desta página que não vem de ninguém ter escrito nada. Um
 * negócio parado é o que mais custa e o que menos se vê — aparece na lista com o mesmo aspecto de
 * um que mexeu ontem.
 */
export function diasParado(atualizadoEm: string | null | undefined, agora: Date = new Date()): number | null {
  if (!atualizadoEm) return null
  const t = Date.parse(atualizadoEm)
  if (!Number.isFinite(t)) return null
  const dias = Math.floor((agora.getTime() - t) / 86400000)
  return dias < 0 ? 0 : dias
}

/** A partir de quando um negócio vivo conta como parado. Uma semana: o ciclo de trabalho da equipa. */
export const DIAS_PARA_ESTAR_PARADO = 7

/**
 * O aviso de negócio parado — texto, não cor. Uma etiqueta vermelha diz que há problema; esta
 * frase diz qual é.
 */
export function avisoParado(dias: number | null): string | null {
  if (dias === null || dias < DIAS_PARA_ESTAR_PARADO) return null
  return `Sem se mexer há ${dias} dias. Ou avança, ou fecha com motivo — deixá-lo aqui não é uma terceira opção.`
}

/**
 * A regra do bónus da corretora, inteira, para quem precisar dela no pipeline.
 *
 * Existe como função (e não como texto) porque as três regras do bónus só valem juntas: metade
 * delas promete a quem não tem direito, e a outra metade esconde metade de quem tem.
 */
export function regraDoBonus(): string {
  return bonusNumaLinha()
}
