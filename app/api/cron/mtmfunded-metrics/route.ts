import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avaliarConta, ordenarClassificacao, type RegrasConta } from '@/lib/mtmfunded/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * LEITURA DAS CONTAS E CLASSIFICAÇÃO — de 60 em 60 minutos.
 *
 * Lê a equity de cada conta viva, aplica as regras, e reordena. O que decide o desfecho de
 * uma conta é este ciclo: quem quebrou fica CONGELADO no instante em que quebrou e sai da
 * MetaApi. Congelar não é castigo — é o que faz a classificação mostrar onde a pessoa estava
 * quando quebrou, e não o que a conta fez a andar à deriva depois disso.
 *
 * Uma conta que não responde NÃO se dá por quebrada. Um timeout da MetaApi não é uma perda:
 * dar por quebrada uma conta viva por causa de uma leitura falhada é o erro caro deste
 * ficheiro, e por isso a leitura falhada apenas se regista e passa à frente.
 */

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET
  if (!esperado) return false
  const dado =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    request.nextUrl.searchParams.get('secret')
  const a = Buffer.from(String(dado ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}


/**
 * O HISTÓRICO DE EQUITY, guardado ponto a ponto.
 *
 * Sem ele não há gráfico nenhum para mostrar — e, mais importante, não há forma de mostrar a
 * ALGUÉM porque é que uma conta quebrou. Um número final («−10,4%») é uma afirmação; a curva
 * que lá chegou é uma prova, e é a diferença entre uma decisão que se explica e uma que se
 * impõe.
 *
 * Fica nas próprias métricas, em vez de numa tabela à parte: são 240 pontos por conta, não
 * séries temporais a sério. Uma tabela nova para isto seria mais máquina do que o problema.
 *
 * 240 pontos = dez dias a uma leitura por hora. Passando disso, deita-se fora o mais antigo:
 * um histórico que cresce para sempre acaba por ser uma linha de base de dados que ninguém
 * consegue ler nem apagar.
 */
const PONTOS_HISTORICO = 240

function empilhar(
  anterior: unknown,
  ponto: { equity: number; saldo: number; margem?: number },
): Array<{ t: string; e: number; s: number; m?: number }> {
  const antes = Array.isArray(anterior)
    ? (anterior as Array<{ t: string; e: number; s: number; m?: number }>)
    : []
  const novo = {
    t: new Date().toISOString(),
    e: Math.round(ponto.equity * 100) / 100,
    s: Math.round(ponto.saldo * 100) / 100,
    ...(ponto.margem != null ? { m: Math.round(ponto.margem * 100) / 100 } : {}),
  }
  return [...antes, novo].slice(-PONTOS_HISTORICO)
}

interface Snapshot {
  equity: number
  saldo: number
  /** Margem usada e livre — o que mostra se a conta está esticada antes de a equity o dizer. */
  margem?: number
  margemLivre?: number
  nivelMargem?: number
}

/** Lê equity e saldo de uma conta MetaApi. `null` quando não responde — não é perda. */
async function lerConta(metaapiId: string): Promise<Snapshot | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  const { contaInexistente, marcarContaInexistente } = await import('@/lib/mtmcopy/metaapi-inexistentes')
  if (await contaInexistente(metaapiId)) return null
  // Travão de quota: uma leitura de classificação nunca pode gastar o que as ordens precisam.
  const { leituraDeFundoBloqueada, registarErroQuota } = await import('@/lib/mtmcopy/metaapi-quota')
  if (await leituraDeFundoBloqueada(metaapiId)) return null
  try {
    const r = await fetch(
      `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaapiId}/account-information`,
      { headers: { 'auth-token': token }, cache: 'no-store', signal: AbortSignal.timeout(20_000) },
    )
    if (!r.ok) {
      const erro = { status: r.status, message: await r.text().catch(() => '') }
      if (r.status === 429) await registarErroQuota(metaapiId, erro)
      if (r.status === 404) await marcarContaInexistente(metaapiId, erro, { nivelConta: true, origem: 'mtmfunded-metrics' })
      return null
    }
    const d = (await r.json()) as {
      equity?: number
      balance?: number
      margin?: number
      freeMargin?: number
      marginLevel?: number
    }
    if (typeof d.equity !== 'number' || typeof d.balance !== 'number') return null
    return {
      equity: d.equity,
      saldo: d.balance,
      margem: typeof d.margin === 'number' ? d.margin : undefined,
      margemLivre: typeof d.freeMargin === 'number' ? d.freeMargin : undefined,
      nivelMargem: typeof d.marginLevel === 'number' ? d.marginLevel : undefined,
    }
  } catch {
    return null
  }
}


/**
 * CONTAS ÓRFÃS — sem dono, e por isso sem ninguém a quem responder.
 *
 * Nascem de provas de emissão e de inscrições que não chegaram ao fim. Ficam vivas no
 * MetaTrader, ocupam lugar na árvore do Navegador por onde o agente se orienta, e continuam a
 * contar na MetaApi. Ninguém as reclama porque não são de ninguém.
 *
 * Só se apagam depois de uma folga de horas: uma conta acabada de criar está órfã por um
 * instante — entre o agente a gravá-la e o site a atribuí-la ao dono — e apagá-la nessa janela
 * seria apagar a conta que alguém está a receber.
 *
 * A limpeza é a mesma das contas quebradas: MetaApi, depois o agente do VPS (trocar a password
 * E remover do terminal), e só então a base de dados.
 */
async function limparOrfas(
  db: ReturnType<typeof getSupabaseAdmin>,
  notas: string[],
): Promise<number> {
  const FOLGA_HORAS = Number(process.env.MTMFUNDED_ORFAS_HORAS || 6)
  const limite = new Date(Date.now() - FOLGA_HORAS * 3600_000).toISOString()

  const { data: orfas } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, created_at')
    .is('user_id', null)
    .lt('created_at', limite)
    .limit(50)

  if (!orfas?.length) return 0

  const { quebrarConta } = await import('@/lib/mtmfunded/ciclo-de-vida')
  let apagadas = 0
  for (const c of orfas) {
    try {
      // Sem dono não há email — `quebrarConta` salta-o sozinho, porque não há perfil para ler.
      // Explícito: as simuladas não se apagam por omissão, mas uma órfã não tem histórico de ninguém.
      const r = await quebrarConta(c.id as string, 'orfa', { apagar: true })
      if (r.ok) apagadas++
      if (!r.vpsAgendado && c.mt5_login) {
        notas.push(`órfã ${c.mt5_login}: apagada da base mas o agente não foi avisado`)
      }
    } catch (e) {
      notas.push(`órfã ${c.mt5_login ?? c.id}: limpeza falhou — ${String(e).slice(0, 60)}`)
    }
  }
  if (apagadas) notas.push(`${apagadas} contas sem dono apagadas`)
  return apagadas
}


/**
 * AS CONTAS REAIS QUE NINGUÉM LIA.
 *
 * ═══ O BURACO, MEDIDO A 01/10/2026 ═════════════════════════════════════════════════════════
 *
 * Este cron sempre leu as contas pela lista de PARTICIPANTES DE TORNEIO. Quem não está num
 * torneio nunca era lido — e isso incluía as cinco contas provider na MetaApi (19036, 19037,
 * 19038, 19040, 19042), que são as que alimentam a cópia para os clientes. Medido: `metricas` a
 * nulo e `metricas_lidas_em` a NULO desde que nasceram, a 11 de Setembro.
 *
 * Ou seja: a casa não sabia a equidade das contas de onde sai o sinal que os clientes copiam. Não
 * dava erro em lado nenhum — o painel mostrava um traço, e um traço lê-se como «ainda não
 * carregou».
 *
 * Isto corre DEPOIS dos torneios de propósito: se a quota da MetaApi se esgotar, esgota-se a ler
 * o que decide prémios, e não o que enche um painel.
 */
async function lerContasForaDeTorneio(
  db: ReturnType<typeof getSupabaseAdmin>,
  notas: string[],
): Promise<{ lidas: number; semResposta: number }> {
  /**
   * Salta o que já foi lido nesta passagem pela FRESCURA e não por uma lista de ids: a lista das
   * contas de torneio vive dentro de outra função, e passá-la para cá só para a cruzar criava um
   * acoplamento que se parte na primeira vez que alguém mexer numa delas.
   */
  const agoraMenos10 = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, metaapi_account_id, metricas, metricas_lidas_em')
    .eq('estado', 'ativa')
    .eq('motor', 'mt5')
    .not('metaapi_account_id', 'is', null)
    .or(`metricas_lidas_em.is.null,metricas_lidas_em.lt.${agoraMenos10}`)
    .limit(60)

  let lidas = 0
  let semResposta = 0
  for (const c of contas ?? []) {
    const id = String(c.id)
    const snap = await lerConta(String(c.metaapi_account_id))
    if (!snap) {
      semResposta++
      continue
    }
    const metricas = { ...(c.metricas as Record<string, unknown> ?? {}), ...snap }
    await db
      .from('mtm_trading_accounts')
      .update({ metricas, metricas_lidas_em: new Date().toISOString() })
      .eq('id', id)
    lidas++
  }
  if (semResposta) notas.push(`fora de torneio: ${semResposta} conta(s) sem resposta da MetaApi`)
  return { lidas, semResposta }
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()
  const notas: string[] = []
  let lidas = 0
  let quebradas = 0
  let semResposta = 0

  const { data: torneios } = await db
    .from('mtm_tournaments')
    .select('id, slug, regras, saldo_inicial, comeca_em')
    .in('estado', ['inscricoes', 'a_decorrer'])

  for (const torneio of torneios ?? []) {
    const regras = (torneio.regras ?? {}) as RegrasConta
    const { data: participantes } = await db
      .from('mtm_tournament_participants')
      .select('id, user_id, account_id, estado, metricas')
      .eq('tournament_id', torneio.id)
      .in('estado', ['inscrito', 'ativo'])

    if (!participantes?.length) continue

    const contas = new Map<string, Record<string, unknown>>()
    const ids = participantes.map((p) => p.account_id).filter(Boolean) as string[]
    if (ids.length) {
      const { data } = await db
        .from('mtm_trading_accounts')
        .select('id, metaapi_account_id, saldo_inicial, estado, metricas, motor, tipo')
        .in('id', ids)
      for (const c of data ?? []) contas.set(c.id as string, c)
    }

    const linhas: Array<{
      participanteId: string
      accountId: string | null
      resultadoPct: number
      elegivel: boolean
      quebrou: boolean
      drawdownPct?: number
      veredicto: ReturnType<typeof avaliarConta> | null
    }> = []

    for (const p of participantes) {
      const conta = p.account_id ? contas.get(p.account_id) : null
      const metaapiId = conta?.metaapi_account_id as string | undefined

      /**
       * CONTA SIMULADA: quem a mede é o motor do VPS, tick a tick — não a MetaApi (não tem
       * `metaapi_account_id`, e sem este ramo ficava no fundo da classificação com 0%, como uma
       * conta por emitir). Aqui só se ORDENA, com as métricas que o motor escreveu, e pelo
       * resultado SEM as ideias da casa: aceitar ideias da MTM é permitido, mas o torneio mede o
       * trader. A quebra também já foi tratada pelo motor; não se reavalia.
       */
      if (conta && conta.motor === 'sim' && conta.estado === 'ativa') {
        const m = (conta.metricas ?? {}) as Record<string, unknown>
        const num = (x: unknown) => (typeof x === 'number' ? x : null)
        const resultadoPct = num(m.resultadoPctSemIdeias) ?? num(m.resultadoPct) ?? 0
        linhas.push({
          participanteId: p.id, accountId: p.account_id, resultadoPct,
          elegivel: m.elegivel === true, quebrou: false,
          drawdownPct: num(m.drawdownPct) ?? undefined,
          veredicto: {
            quebrou: false, resultadoPct, elegivel: m.elegivel === true,
            naoElegivelPorque: typeof m.naoElegivelPorque === 'string' ? m.naoElegivelPorque : undefined,
            margemDiaria: num(m.margemDiaria) ?? 0, margemTotal: num(m.margemTotal) ?? 0,
          },
        })
        continue
      }

      /**
       * CONTA MT5 LIDA PELO VPS (leitor-torneios.py, 22/09): sem MetaApi, quem lê é o terminal
       * leitor do VPS de hora a hora e grava em `metricas` (fonte `leitor-mt5`). O snapshot vem
       * daí em vez da MetaApi — daqui para baixo é tudo igual, incluindo as regras do torneio e a
       * quebra. Sem este ramo, estas contas caíam no «sem conta emitida» e ficavam a 0% na
       * classificação, com a conta a render 8% no MetaTrader.
       */
      const guardadoVps = (conta?.metricas ?? {}) as Record<string, unknown>
      const doVps = !metaapiId && guardadoVps.fonte === 'leitor-mt5' && typeof guardadoVps.equity === 'number'

      // Sem conta emitida ainda: fica no fundo, sem resultado. Não é quebra.
      if (!conta || (!metaapiId && !doVps) || conta.estado !== 'ativa') {
        linhas.push({
          participanteId: p.id, accountId: p.account_id, resultadoPct: 0,
          elegivel: false, quebrou: false, veredicto: null,
        })
        continue
      }

      const num = (x: unknown) => (typeof x === 'number' ? x : undefined)
      const snap = doVps
        ? {
            equity: Number(guardadoVps.equity),
            saldo: Number(guardadoVps.saldo ?? guardadoVps.equity),
            margem: num(guardadoVps.margemUsada) ?? num(guardadoVps.margem),
            margemLivre: num(guardadoVps.margemLivre),
            nivelMargem: num(guardadoVps.nivelMargem),
          }
        : await lerConta(metaapiId as string)
      if (!snap) {
        semResposta++
        // Mantém-se o que se sabia da última leitura. Uma leitura falhada não é uma perda.
        const m = (conta.metricas ?? {}) as Record<string, unknown>
        linhas.push({
          participanteId: p.id, accountId: p.account_id,
          resultadoPct: Number(m.resultadoPct ?? 0),
          elegivel: m.elegivel === true, quebrou: false,
          drawdownPct: typeof m.drawdownPct === 'number' ? m.drawdownPct : undefined,
          veredicto: null,
        })
        continue
      }
      lidas++

      const anterior = (conta.metricas ?? {}) as Record<string, unknown>
      const saldoInicial = Number(conta.saldo_inicial ?? torneio.saldo_inicial ?? 0)
      // Âncora do dia: o saldo com que o dia abriu. Sem histórico ainda, usa-se o de agora.
      const refDia = Number(anterior.saldoReferenciaDia ?? snap.saldo)
      const pico = Math.max(Number(anterior.picoEquity ?? saldoInicial), snap.equity)
      const drawdownPct = pico > 0 ? Math.round(((pico - snap.equity) / pico) * 10000) / 100 : 0

      const veredicto = avaliarConta(regras, {
        saldoInicial,
        equity: snap.equity,
        saldoReferenciaDia: refDia,
        lucroPorDia: (anterior.lucroPorDia ?? {}) as Record<string, number>,
        diasNegociados: Number(anterior.diasNegociados ?? 0),
        diasDecorridos: torneio.comeca_em
          ? Math.floor((Date.now() - new Date(torneio.comeca_em).getTime()) / 86_400_000)
          : undefined,
      })

      const metricas = {
        ...anterior,
        equity: snap.equity,
        saldo: snap.saldo,
        saldoReferenciaDia: refDia,
        picoEquity: pico,
        drawdownPct,
        resultadoPct: veredicto.resultadoPct,
        elegivel: veredicto.elegivel,
        naoElegivelPorque: veredicto.naoElegivelPorque ?? null,
        margemDiaria: veredicto.margemDiaria,
        margemTotal: veredicto.margemTotal,
        margemUsada: snap.margem ?? null,
        margemLivre: snap.margemLivre ?? null,
        nivelMargem: snap.nivelMargem ?? null,
        historico: empilhar(anterior.historico, snap),
        lidoEm: new Date().toISOString(),
      }

      if (veredicto.quebrou) {
        quebradas++
        /**
         * CONGELA e SAI. As métricas ficam como estão neste instante, e a conta é retirada da
         * MetaApi — deixar de a ler poupa as leituras e, mais importante, impede que a
         * classificação continue a mexer numa conta que já não está em prova.
         */
        await db.from('mtm_trading_accounts').update({
          estado: 'quebrada',
          quebrou_regra: veredicto.motivo,
          quebrada_em: new Date().toISOString(),
          metricas: { ...metricas, congeladoEm: new Date().toISOString(), motivo: veredicto.detalhe },
          metricas_lidas_em: new Date().toISOString(),
        }).eq('id', conta.id as string)

        await db.from('mtm_tournament_participants')
          .update({ estado: 'quebrado', resultado_pct: veredicto.resultadoPct, metricas, updated_at: new Date().toISOString() })
          .eq('id', p.id)

        /**
         * E daqui em diante trata dela o CICLO DE VIDA: avisa o trader por email com o motivo,
         * apaga a conta da MetaApi, manda o agente do VPS trocar-lhe a password e removê-la do
         * MetaTrader, e só então a apaga da base.
         *
         * Continua a ser best-effort: a conta já está marcada como quebrada e a classificação
         * já está certa. Uma falha na limpeza não pode desfazer a decisão que acabou de ser
         * tomada — só deixa trabalho para a passagem seguinte.
         */
        try {
          const { quebrarConta } = await import('@/lib/mtmfunded/ciclo-de-vida')
          const r = await quebrarConta(conta.id as string, String(veredicto.motivo ?? 'regra'))
          if (!r.emailEnviado) notas.push(`conta ${String(conta.id).slice(0, 8)}: quebrou mas o email falhou`)
          if (!r.metaapiApagada) notas.push(`conta ${String(conta.id).slice(0, 8)}: ficou na MetaApi`)
        } catch (e) {
          notas.push(`conta ${String(conta.id).slice(0, 8)}: limpeza falhou — ${String(e).slice(0, 60)}`)
        }

        linhas.push({
          participanteId: p.id, accountId: p.account_id,
          resultadoPct: veredicto.resultadoPct, elegivel: false, quebrou: true, drawdownPct,
          veredicto,
        })
        continue
      }

      /**
       * OBJECTIVO ATINGIDO — a outra ponta da mesma leitura.
       *
       * A conta que passa não faz barulho nenhum sozinha: sem isto, um trader cumpria o
       * objectivo e ficava à espera de que alguém reparasse. Emite-se o certificado e
       * manda-se o email na mesma passagem que detecta a quebra dos outros.
       *
       * A marca fica nas métricas: sem ela, cada leitura de hora a hora mandava outro email.
       */
      const objetivo = Number(regras.objetivo_pct ?? 0)
      const jaConcluida = Boolean((conta.metricas as Record<string, unknown> | null)?.faseConcluida)
      if (
        objetivo > 0 &&
        !jaConcluida &&
        conta.tipo === 'desafio' &&
        veredicto.resultadoPct != null &&
        veredicto.resultadoPct >= objetivo &&
        veredicto.elegivel
      ) {
        try {
          const { concluirDesafio } = await import('@/lib/mtmfunded/ciclo-de-vida')
          const r = await concluirDesafio(conta.id as string, { resultadoPct: veredicto.resultadoPct })
          notas.push(
            r.ok
              ? `conta ${String(conta.id).slice(0, 8)}: desafio concluído · ${r.codigo}`
              : `conta ${String(conta.id).slice(0, 8)}: concluiu mas o certificado falhou — ${r.erro}`,
          )
        } catch (e) {
          notas.push(`conta ${String(conta.id).slice(0, 8)}: conclusão falhou — ${String(e).slice(0, 60)}`)
        }
      }

      await db.from('mtm_trading_accounts')
        .update({ metricas, metricas_lidas_em: new Date().toISOString() })
        .eq('id', conta.id as string)

      linhas.push({
        participanteId: p.id, accountId: p.account_id,
        resultadoPct: veredicto.resultadoPct, elegivel: veredicto.elegivel,
        quebrou: false, drawdownPct, veredicto,
      })
    }

    // Ordena e grava as posições. Uma escrita por participante: são dezenas, não milhares.
    const ordenadas = ordenarClassificacao(linhas)
    for (let i = 0; i < ordenadas.length; i++) {
      const l = ordenadas[i]
      const patch: Record<string, unknown> = {
        posicao: i + 1,
        resultado_pct: l.resultadoPct,
        updated_at: new Date().toISOString(),
      }
      if (l.veredicto && !l.quebrou) {
        patch.estado = 'ativo'
        patch.metricas = {
          elegivel: l.elegivel,
          naoElegivelPorque: l.veredicto.naoElegivelPorque ?? null,
          resultadoPct: l.resultadoPct,
          drawdownPct: l.drawdownPct ?? null,
          margemDiaria: l.veredicto.margemDiaria,
          margemTotal: l.veredicto.margemTotal,
        }
      }
      await db.from('mtm_tournament_participants').update(patch).eq('id', l.participanteId)
    }

    notas.push(`${torneio.slug}: ${ordenadas.length} participantes ordenados`)
  }

  // ── os desafios MT5, que não têm participante nenhum a apontar para eles ──
  // Mesmo vigia do cron de 10 min (lib/mtmfunded/leitura-mt5-servidor.ts): só REST, respeita a
  // quota, não lê contas undeployed, lê histórico para a âncora do dia e para o lucro por dia.
  const { vigiarContasMt5 } = await import('@/lib/mtmfunded/leitura-mt5-servidor')
  const { getMtmFundedConfig } = await import('@/lib/mtmfunded/config')
  const desafios = await vigiarContasMt5(db, notas, (await getMtmFundedConfig()).minutos_entre_leituras)
  lidas += desafios.lidas
  quebradas += desafios.quebradas
  semResposta += desafios.semResposta

  // ── e as contas que não são de ninguém ────────────────────────────────────
  // As contas reais fora de torneio — ver o cabeçalho de `lerContasForaDeTorneio`.
  const fora = await lerContasForaDeTorneio(db, notas)

  const orfas = await limparOrfas(db, notas)

  return NextResponse.json({
    ok: true, lidas, quebradas, semResposta, orfas, notas,
    foraDeTorneio: { lidas: fora.lidas, semResposta: fora.semResposta },
  })
}
