import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { atribuirEGravar } from '@/lib/agentes/receita'
import { correrAvaliacao } from '@/lib/agentes/motor'
import { correrCicloCeo } from '@/lib/agentes/ciclo-ceo'

/**
 * A PASSAGEM DIÁRIA DA EQUIPA DE AGENTES — mede a receita, e depois julga.
 *
 * ═══ A ORDEM NÃO É ARBITRÁRIA ══════════════════════════════════════════════════════════════
 *
 * Primeiro a receita, depois o juízo. Ao contrário, a regra das 48 horas julgava com os números de
 * ontem e parava um agente que tinha vendido esta manhã — e o motivo escrito na linha pareceria
 * perfeitamente sólido a quem o fosse ler depois.
 *
 * Se a atribuição de receita falhar, NÃO se julga. Receita que não se conseguiu ler conta como
 * zero, e zero põe a equipa inteira em risco de uma vez. Vale muito mais ninguém ser julgado nesta
 * passagem do que todos serem julgados com a conta errada.
 *
 * ═══ O QUE ISTO NÃO FAZ ════════════════════════════════════════════════════════════════════
 *
 * Não apaga nada. Parar um agente é mudar `estado` e escrever o motivo — é um limite do dono, e a
 * linha fica para ensinar. Nenhum caminho deste cron produz um `delete`.
 *
 * ═══ COMO SE EXPERIMENTA ═══════════════════════════════════════════════════════════════════
 *
 *  · `?dry=1` lê tudo, decide tudo, e não escreve nada. É assim que isto se vê funcionar antes de
 *    lhe dar a faca;
 *  · `?ciclo=0` corre a medição e o juízo e NÃO deixa o CEO pedir nada. Serve para quem quiser
 *    ver as contas sem acrescentar pedidos à tabela;
 *  · `?trader=1` corre também o agente trader. Fica FORA da passagem automática de propósito: o
 *    trader tem o seu próprio interruptor e a conta dele já tem outro escritor — ver o cabeçalho
 *    de `lib/agentes/trader.ts`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const ensaio = params.get('dry') === '1'
  const db = getSupabaseAdmin()
  const agora = new Date()

  try {
    const receita = await atribuirEGravar(db, { ensaio })

    /**
     * Um erro na atribuição trava o juízo. Devolve-se 200 com `ok: false` e o motivo: isto é um
     * cron, e um 500 só produz um alerta sem explicação. O que interessa é a frase.
     */
    if (!receita.ok) {
      return NextResponse.json({
        ok: false,
        ensaio,
        fase: 'receita',
        nota: 'Receita não foi medida — ninguém foi julgado nesta passagem. Julgar com receita a zero punha a equipa toda em risco de uma vez.',
        receita,
      })
    }

    const avaliacao = await correrAvaliacao(db, { ensaio, agora })

    /**
     * ── E AGORA O CEO AGE: LÊ A EQUIPA JULGADA E PEDE ALGO A QUEM NÃO SE PAGA ──
     *
     * DEPOIS do juízo, e a ordem é a regra outra vez. Ao contrário, o CEO pedia resultados com os
     * estados de ontem: cobrava um agente que esta manhã recuperou, e dava-se por livre de cobrar
     * um que acabou de entrar em risco. O pedido ficava escrito com um motivo perfeitamente
     * sólido, como sempre acontece neste sistema quando a ordem está trocada.
     *
     * Um erro no juízo NÃO trava o ciclo: o ciclo volta a ler a equipa e a julgá-la pela mesma
     * régua, por isso o que ele vê é coerente mesmo que a gravação do estado tenha falhado numa
     * linha. O que o trava é não conseguir ler a janela — e isso está decidido dentro dele.
     *
     * `?ciclo=0` desliga-o. Fica LIGADO por omissão porque é o pedido do dono de 01/10: o CEO
     * auto-corre. Um ciclo que só corresse quando alguém se lembrasse de o chamar não era
     * autonomia nenhuma.
     */
    const ciclo = params.get('ciclo') === '0' ? null : await correrCicloCeo(db, { ensaio, agora })

    let trader: unknown = null
    if (params.get('trader') === '1') {
      const { correrTrader } = await import('@/lib/agentes/trader')
      trader = await correrTrader(db, { ensaio, agora })
    }

    return NextResponse.json({
      ok: avaliacao.ok,
      ensaio,
      receita: {
        liquidoEur: (receita.atribuicao.liquidoCents / 100).toFixed(2),
        atribuidoEur: (receita.atribuicao.atribuidoCents / 100).toFixed(2),
        // O que não se conseguiu atribuir aparece SEMPRE, com os motivos. Não se esconde nem se
        // reparte: um agente medido a adivinhar é pior do que um agente não medido.
        porAtribuirEur: (receita.atribuicao.naoAtribuidoCents / 100).toFixed(2),
        porAtribuir: receita.atribuicao.porAtribuir,
        porAgente: receita.atribuicao.porAgente,
      },
      avaliacao: {
        avaliados: avaliacao.avaliados,
        parados: avaliacao.parados,
        avisados: avaliacao.avisados,
        ignorados: avaliacao.ignorados,
        escritas: avaliacao.escritas,
      },
      /**
       * O que o CEO pediu, a quem, e com que prazo. Sai na resposta do cron de propósito: é a
       * única forma de alguém ver, sem ir à base, se a passagem de hoje pressionou alguém ou se
       * não havia nada a pressionar — e as duas coisas são informação diferente.
       */
      ceo: ciclo
        ? {
            resumo: ciclo.resumo,
            pedidos: ciclo.pedidos,
            prazosFechados: ciclo.fechados,
            naoPressionados: ciclo.ignorados,
          }
        : { resumo: 'Ciclo do CEO desligado nesta chamada (?ciclo=0).' },
      trader,
      erros: [...receita.erros, ...avaliacao.erros, ...(ciclo?.erros ?? [])],
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}
