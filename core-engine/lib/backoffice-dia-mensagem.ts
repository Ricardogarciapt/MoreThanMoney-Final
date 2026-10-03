import { pensar } from '@/lib/funis-ia'
import { ESTADO_PIPELINE_NOME } from '@/lib/backoffice-vista'
import type { EstadoPipeline } from '@/lib/backoffice-vista'

/**
 * O RASCUNHO DA MENSAGEM — o que transforma uma tarefa numa coisa que se faz em trinta segundos.
 *
 * PORQUE É QUE ISTO EXISTE
 * «Seguir a proposta do João» parece uma tarefa e não é: deixa o trabalho todo por fazer. A pessoa
 * ainda tem de ir buscar o contexto, decidir o tom e escrever do zero. É aí que o follow-up morre
 * — não por preguiça, por custar quinze minutos cada um. Doze tarefas dessas são três horas, e
 * ninguém tem três horas todos os dias.
 *
 * Com o rascunho ao lado, o trabalho passa a ser ler, corrigir e enviar.
 *
 * A REGRA QUE NÃO MUDA
 * A IA redige. Quem envia é a pessoa. Não há caminho, em lado nenhum deste código, para um destes
 * textos sair sozinho — e isso é uma decisão, não um esquecimento. Um sistema que escreve a cem
 * pessoas por dia sem ninguém ler acaba sempre da mesma maneira: alguém recebe a mensagem errada
 * no momento errado, e perde-se um cliente que já estava ganho.
 *
 * A voz e as regras duras (nunca prometer lucro, nunca inventar números, nunca dar conselho de
 * investimento) vêm de `lib/funis-ia.ts` e são as mesmas que o funil já usa — o cliente não pode
 * receber uma mensagem do bot e outra da equipa como se fossem empresas diferentes.
 */

export interface ContextoDoLead {
  nome: string
  estado: EstadoPipeline
  origem: string | null
  packPrevisto: string | null
  nota: string | null
  diasParado: number
}

/**
 * O que a IA sabe sobre esta pessoa.
 *
 * Só o que está no pipeline, e nada mais. Não se junta aqui histórico de pagamentos nem dados de
 * conta: uma mensagem de primeiro contacto que revela que sabemos demasiado sobre alguém assusta
 * mais do que aproxima — e nada disso é preciso para escrever duas frases certas.
 */
function retrato(c: ContextoDoLead): string {
  const linhas = [
    `Nome: ${c.nome}`,
    `Momento no funil: ${ESTADO_PIPELINE_NOME[c.estado]}`,
    c.origem ? `Como chegou: ${c.origem}` : null,
    c.packPrevisto ? `Produto em cima da mesa: ${c.packPrevisto}` : null,
    c.diasParado > 0 ? `Sem contacto há ${c.diasParado} dia(s)` : 'Chegou agora',
    c.nota ? `Contexto: ${c.nota}` : null,
  ]
  return linhas.filter(Boolean).join('\n')
}

/**
 * A reserva — o que fica na tarefa quando não há IA disponível.
 *
 * Não é uma mensagem para enviar: é um lembrete honesto de que o texto é para escrever à mão.
 * Pôr aqui uma frase pronta e genérica era pior do que não pôr nada — alguém acabaria por a
 * enviar tal e qual, e uma mensagem genérica assinada por nós vale menos do que o silêncio.
 */
function reservaPara(c: ContextoDoLead): string {
  return `(sem rascunho automático — escreve tu, em duas ou três frases, para ${c.nome})`
}

/** Redige o rascunho para uma tarefa. Nunca rebenta: sem IA, devolve a reserva. */
export async function redigirRascunho(
  contexto: ContextoDoLead,
  pedido: string,
): Promise<string> {
  if (!pedido.trim()) return ''
  try {
    const r = await pensar({
      objetivo:
        `${pedido}\n\n` +
        'Escreves a mensagem que a pessoa da equipa vai ENVIAR a este lead. Devolves só o texto ' +
        'da mensagem, sem saudação a mim, sem explicações e sem aspas à volta. ' +
        'Tratas a pessoa pelo primeiro nome. Não inventas nada que não esteja no retrato abaixo — ' +
        'se não souberes uma coisa, não a mencionas.',
      modo: 'responder',
      ramos: [],
      doCliente: retrato(contexto),
      reserva: reservaPara(contexto),
    })
    return (r.texto ?? reservaPara(contexto)).trim()
  } catch {
    return reservaPara(contexto)
  }
}

/**
 * QUANTOS RASCUNHOS POR PESSOA, POR DIA.
 *
 * Três, e são os três primeiros da lista — os que a pessoa vai mesmo fazer a seguir. Redigir doze
 * custa doze chamadas ao modelo por pessoa, todos os dias, e nove delas nunca chegariam a ser
 * lidas. O resto da lista continua a ter o que fazer e porquê; se a pessoa chegar lá, pede o
 * rascunho no momento.
 */
export const RASCUNHOS_POR_PESSOA = 3
