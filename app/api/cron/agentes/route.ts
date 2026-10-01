import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { atribuirEGravar } from '@/lib/agentes/receita'
import { correrAvaliacao } from '@/lib/agentes/motor'

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
      trader,
      erros: [...receita.erros, ...avaliacao.erros],
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}
