import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { atribuirEGravar } from '@/lib/agentes/receita'
import { correrAvaliacao } from '@/lib/agentes/motor'
import { correrCicloCeo } from '@/lib/agentes/ciclo-ceo'
import { reporLimitesEmFalta } from '@/lib/agentes/educacao'
import { correrDesbloqueio } from '@/lib/agentes/desbloqueio'
import { correrTrader, registarDecisoesNoLivro } from '@/lib/agentes/trader'
import { correrReproducao } from '@/lib/agentes/reproducao'
import { correrReversoes } from '@/lib/agentes/evolucao'

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
 *  · `?trader=0` deixa o agente trader de fora desta chamada. Ele passou a correr em TODAS as
 *    passagens — ver a nota abaixo, porque a mudança tem de ser justificada;
 *  · `?desbloqueio=0` e `?limites=0` desligam as duas passagens novas;
 *  · `?so=vida` (06/10) corre SÓ receita → juízo (morte arquivada) → reversões de versões →
 *    reprodução. É o que o motor autónomo do Mac (`aios/motor/orquestrador.py`) chama de hora a
 *    hora: a régua das 48 h com um cron diário às 06:00 deixava um agente viver até 72 h sem
 *    receita, e os nascimentos esperavam um dia inteiro. O ciclo do CEO, o trader e o desbloqueio
 *    continuam só na passagem diária — não precisam de correr 24 vezes.
 *
 * ═══ O TRADER PASSOU A CORRER SEMPRE — E PORQUÊ ════════════════════════════════════════════
 *
 * Até 01/10 ele só corria com `?trader=1`, ou seja: nunca, porque ninguém põe um parâmetro à mão às
 * 6 da manhã. A decisão original era consciente e o motivo era bom — a conta de papel dele JÁ TEM
 * outro escritor (`lib/mtmfunded/estrategias-sinais/todos-os-sinais.ts`), e um segundo escritor
 * duplicava posições e estragava a única medição de desempenho honesta da casa.
 *
 * Só que o que duplica posições é ABRIR, e abrir já está travado por outra coisa: o interruptor
 * `site_settings.agente_trader`. Analisar, decidir e registar não abre nada. Mantê-lo fora da
 * passagem inteira não protegia a conta de nada que o interruptor não protegesse já — e produzia um
 * agente que nunca pensava, não tinha nada para mostrar, e ia ser julgado pela régua das 48 h por
 * não produzir. Exactamente a armadilha de 01/10 noutra forma: parado por nunca lhe ter sido dado
 * trabalho.
 *
 * Agora corre sempre e REGISTA no seu livro o que analisou e decidiu. Armar a execução continua a
 * ser uma decisão do dono, de uma chave só, e está escalada em `lib/agentes/desbloqueio.ts` com o
 * motivo e o compromisso por escrito.
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
     * ── A VIDA DA EQUIPA: VERSÕES E NASCIMENTOS (06/10) ──
     *
     * DEPOIS do juízo, e a ordem conta: um agente que morreu nesta passagem já não se reproduz, e
     * os tectos de vivos contam com as mortes de agora. As reversões vêm antes da reprodução porque
     * um pai cuja versão foi revertida volta às instruções de antes — e é dessas que o filho herda.
     */
    const ceoId = await idDoCeo(db)
    const reversoes = params.get('reversoes') === '0' ? null : await correrReversoes(db, { ensaio, agora })
    const reproducao = params.get('reproducao') === '0' ? null : await correrReproducao(db, { ensaio, agora, ceoId })

    if (params.get('so') === 'vida') {
      return NextResponse.json({
        ok: avaliacao.ok && (reproducao?.ok ?? true) && (reversoes?.ok ?? true),
        ensaio,
        so: 'vida',
        avaliacao: { avaliados: avaliacao.avaliados, mortos: avaliacao.mortos, avisados: avaliacao.avisados, escritas: avaliacao.escritas },
        reversoes,
        reproducao: reproducao
          ? { resumo: reproducao.plano.resumo, nascidos: reproducao.nascidos, nascimentos: reproducao.plano.nascimentos.map((n) => ({ nome: n.nome, codigo: n.codigo, pai: n.paiNome, mutacao: n.mutacao })), bloqueios: reproducao.plano.bloqueios }
          : null,
        erros: [...receita.erros, ...avaliacao.erros, ...(reproducao?.erros ?? []), ...(reversoes?.erros ?? [])],
      })
    }

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

    /**
     * ── O TRADER: ANALISA, DECIDE, REGISTA ──
     *
     * Corre SEMPRE (ver o cabeçalho). A abertura continua travada pelo interruptor dele, dentro de
     * `correrTrader`, e pelo portão `contaSegura()` que verifica a cada passagem que a conta ainda é
     * de papel. `?trader=0` deixa-o de fora desta chamada.
     *
     * O registo é a metade que faltava: sem ele, uma passagem em que o agente analisou dez sinais e
     * decidiu não abrir nenhum é indistinguível de uma em que ele não correu — e as duas pedem
     * decisões opostas ao dono.
     */
    let trader: unknown = null
    if (params.get('trader') !== '0') {
      const r = await correrTrader(db, { ensaio, agora })
      const livro = await registarDecisoesNoLivro(db, r, { ensaio })
      trader = { ...r, registo: { gravado: livro.gravado, erro: livro.erro ?? null, detalhe: livro.detalhe } }
    }

    /**
     * ── OS LIMITES DOS FILHOS, REPOSTOS SOZINHOS ──
     *
     * A migração 174 escreveu os quatro limites em todos os filhos de hoje. Isto é para os de
     * amanhã: um agente novo nasce com as instruções que quem o criar lhe der, e o esquecimento de
     * lhe escrever os limites NÃO DÁ ERRO — dá um agente sem travões, bem escrito.
     *
     * O CEO não escreve aqui uma palavra que seja sua: o texto é o canónico da guarda, e tudo o que
     * esta passagem pode fazer é ACRESCENTAR um limite que falte. Nunca remover.
     */
    const limites = params.get('limites') === '0' ? null : await reporLimitesEmFalta(db, { ensaio })

    /**
     * ── O QUE ESTÁ PARADO: DESBLOQUEAR O QUE É DELE, ESCALAR O RESTO ──
     *
     * Corre DEPOIS do ciclo, porque precisa do id do CEO para assinar os escalonamentos — e porque
     * um bloqueio escalado é informação para o dono, não para o ciclo.
     */
    const ceoDaEquipa = ciclo ? ceoId : null
    const desbloqueio =
      params.get('desbloqueio') === '0' ? null : await correrDesbloqueio(db, { ensaio, ceoId: ceoDaEquipa })

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
        mortos: avaliacao.mortos,
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
      reversoes,
      reproducao: reproducao
        ? { resumo: reproducao.plano.resumo, nascidos: reproducao.nascidos, bloqueios: reproducao.plano.bloqueios }
        : null,
      /**
       * As duas passagens novas saem na resposta com o resumo, e não só com um contador: «0 limites
       * repostos» e «não correu» têm o mesmo número e significados opostos.
       */
      limites: limites
        ? { resumo: limites.resumo, repostos: limites.repostos, jaCompletos: limites.jaCompletos }
        : { resumo: 'Reposição de limites desligada nesta chamada (?limites=0).' },
      desbloqueio: desbloqueio
        ? {
            resumo: desbloqueio.resumo,
            feitos: desbloqueio.resolvidosAgora,
            naMesaDoDono: desbloqueio.escalados,
            jaResolvidos: desbloqueio.jaResolvidos,
          }
        : { resumo: 'Desbloqueio desligado nesta chamada (?desbloqueio=0).' },
      erros: [
        ...receita.erros,
        ...avaliacao.erros,
        ...(ciclo?.erros ?? []),
        ...(limites?.erros ?? []),
        ...(desbloqueio?.erros ?? []),
        ...(reproducao?.erros ?? []),
        ...(reversoes?.erros ?? []),
      ],
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'erro' },
      { status: 500 },
    )
  }
}


/**
 * Quem é o CEO, para assinar os escalonamentos.
 *
 * Devolve `null` quando não há — e aí nada é escalado. NÃO se elege um substituto: promover o
 * primeiro agente da lista a chefe por omissão era dar-lhe um poder que ninguém lhe deu, e é a
 * mesma decisão que `correrCicloCeo` já toma.
 */
async function idDoCeo(db: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const { data } = await db
    .from('agentes_equipa')
    .select('id, pilar, pai_id')
    .eq('pilar', 'ceo')
    .is('pai_id', null)
    .maybeSingle()
  return data ? String((data as { id: string }).id) : null
}
