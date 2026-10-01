/**
 * O INTERRUPTOR DA EQUIPA — parar e retomar os sete de uma vez.
 *
 * ═══ PORQUE É QUE ISTO NÃO É UM CICLO `for` ════════════════════════════════════════════════
 *
 * À primeira vista, «pausar a equipa» é correr a acção individual em cada agente. Não é, e o erro
 * só aparece no RETOMAR — quando já é tarde.
 *
 * Imagina que o Ricardo pausou o Trader Papel à mão na segunda-feira, por um motivo dele. Na
 * quarta carrega em «pausar a equipa» e na quinta em «retomar a equipa». Um ciclo ingénuo retoma
 * os sete — incluindo o Trader, que ele nunca mandou retomar. A decisão individual dele foi
 * apagada por um botão que parecia só estar a desfazer o que tinha acabado de fazer. E não há erro
 * nenhum no ecrã: tudo correu bem, só que um agente que devia estar parado está a trabalhar.
 *
 * Por isso o retomar da equipa só mexe em quem o PRÓPRIO interruptor pausou. Quem foi pausado à
 * mão fica pausado, e o painel diz porquê, para ninguém pensar que o botão falhou.
 *
 * ═══ PAUSAR NÃO É PARAR ════════════════════════════════════════════════════════════════════
 *
 * São estados diferentes e com pesos diferentes: `pausado` é «fica quieto, a regra das 48 horas
 * não corre»; `parado` é o fim da linha, com data e motivo escritos. Um agente PARADO não entra no
 * interruptor da equipa em nenhum dos sentidos:
 *
 *  · pausá-lo escrevia `pausado` por cima de `parado` e apagava a data e o motivo da paragem —
 *    perdia-se a razão pela qual ele morreu, que é precisamente o que se guardou para ensinar;
 *  · retomá-lo ressuscitava-o em massa, quando parar é um limite do dono e volta um a um.
 *
 * ═══ COMO SE SABE QUEM O INTERRUPTOR PAUSOU ════════════════════════════════════════════════
 *
 * Pela marca no motivo. `acaoManual` já escreve um evento com `Pausado pelo dono: <motivo>`, e o
 * interruptor assina o dele com `MARCA_EQUIPA`. Quem chama lê o último evento de pausa de cada
 * agente e diz, neste módulo, se a marca lá está. Não se inventou coluna nova para isto: o livro
 * de eventos já é a memória de quem fez o quê, e uma segunda versão do mesmo facto é como as duas
 * divergem.
 */

/** A assinatura do interruptor. Muda isto e o retomar deixa de reconhecer pausas antigas. */
export const MARCA_EQUIPA = 'interruptor da equipa'

export type AgenteNoInterruptor = {
  id: string
  nome: string
  /** `vivo` | `pausado` | `parado` | `em_risco` — o que estiver na coluna, incluindo o inesperado. */
  estado: string
  pausado: boolean
  /** O último evento de pausa deste agente trazia a marca do interruptor? */
  pausadoPelaEquipa: boolean
}

export type Movimento = {
  id: string
  nome: string
  /** `null` = fica como está. */
  acao: 'pausar' | 'retomar' | null
  porque: string
}

export type PlanoDoInterruptor = {
  /** Os que mudam mesmo — é só nestes que se chama a acção individual. */
  mexer: Movimento[]
  /** Os que ficam na mesma, cada um com a razão escrita para o painel a mostrar. */
  deixar: Movimento[]
  /** Frase única para o painel, já pronta a ler. */
  resumo: string
}

/**
 * Decide, sem tocar na base, o que o interruptor faz a cada agente.
 *
 * Função pura de propósito: isto é a parte que erra em silêncio, e assim prova-se com uma lista
 * de objectos em vez de uma base de dados.
 */
export function decidirInterruptor(
  agentes: readonly AgenteNoInterruptor[],
  acao: 'pausar' | 'retomar',
): PlanoDoInterruptor {
  const mexer: Movimento[] = []
  const deixar: Movimento[] = []

  for (const a of agentes) {
    const parado = a.estado === 'parado'

    if (acao === 'pausar') {
      if (parado) {
        deixar.push({
          id: a.id,
          nome: a.nome,
          acao: null,
          porque: 'Está parado. Pausar por cima apagava a data e o motivo da paragem.',
        })
        continue
      }
      if (a.pausado) {
        deixar.push({ id: a.id, nome: a.nome, acao: null, porque: 'Já estava pausado.' })
        continue
      }
      mexer.push({ id: a.id, nome: a.nome, acao: 'pausar', porque: MARCA_EQUIPA })
      continue
    }

    // retomar
    if (parado) {
      deixar.push({
        id: a.id,
        nome: a.nome,
        acao: null,
        porque: 'Está parado, e parar é um limite do dono: volta um a um, não em massa.',
      })
      continue
    }
    if (!a.pausado) {
      deixar.push({ id: a.id, nome: a.nome, acao: null, porque: 'Já estava a trabalhar.' })
      continue
    }
    if (!a.pausadoPelaEquipa) {
      deixar.push({
        id: a.id,
        nome: a.nome,
        acao: null,
        porque: 'Foi pausado à mão, não por este botão. Retomá-lo aqui apagava essa decisão.',
      })
      continue
    }
    mexer.push({ id: a.id, nome: a.nome, acao: 'retomar', porque: MARCA_EQUIPA })
  }

  return { mexer, deixar, resumo: frase(acao, mexer.length, deixar.length) }
}

/**
 * A frase do painel. «0 agentes» não é um erro — é o que acontece ao carregar duas vezes — mas tem
 * de se distinguir de «correu mal», senão o Ricardo carrega outra vez à espera que aconteça algo.
 */
function frase(acao: 'pausar' | 'retomar', mexidos: number, deixados: number): string {
  const verbo = acao === 'pausar' ? 'pausado' : 'retomado'
  if (mexidos === 0) {
    return deixados === 0
      ? 'Não há agentes na equipa.'
      : `Nada mudou: nenhum dos ${deixados} agentes precisava de ser ${verbo}.`
  }
  const quantos = `${mexidos} ${mexidos === 1 ? 'agente' : 'agentes'}`
  if (deixados === 0) return `${quantos} ${mexidos === 1 ? verbo : verbo + 's'}.`
  return `${quantos} ${mexidos === 1 ? verbo : verbo + 's'}; ${deixados} ${deixados === 1 ? 'ficou' : 'ficaram'} como ${deixados === 1 ? 'estava' : 'estavam'}, com o motivo ao lado.`
}

/**
 * O motivo que se grava no evento. Leva a marca à frente para o retomar o reconhecer, e o que o
 * Ricardo tiver escrito a seguir, se escreveu alguma coisa.
 */
export function motivoDoInterruptor(porqueDoDono: string): string {
  const dele = porqueDoDono.trim()
  return dele ? `${MARCA_EQUIPA}: ${dele}` : MARCA_EQUIPA
}

/** Um evento de pausa veio deste interruptor? Lê-se o detalhe tal como `acaoManual` o escreveu. */
export function veioDoInterruptor(detalheDoEvento: string | null | undefined): boolean {
  return typeof detalheDoEvento === 'string' && detalheDoEvento.includes(MARCA_EQUIPA)
}
