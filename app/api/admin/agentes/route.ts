import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { JANELA_HORAS, julgar, lerRegrasVida } from '@/lib/agentes/vida'
import { acaoManual, montarAgente, somarJanela, ultimaReceita, type EventoLido, type LinhaAgente } from '@/lib/agentes/motor'
import { gravarInterruptor, lerInterruptor } from '@/lib/agentes/motor-interruptor'
import { atribuirEGravar } from '@/lib/agentes/receita'
import {
  decidirInterruptor,
  motivoDoInterruptor,
  veioDoInterruptor,
  type AgenteNoInterruptor,
} from '@/lib/agentes/interruptor-equipa'

/**
 * O PAINEL DA EQUIPA DE AGENTES — leitura, e os três botões.
 *
 * O juízo que aparece no ecrã é calculado com a MESMA função que o cron usa (`julgar`), sobre os
 * mesmos factos. Uma segunda cópia da regra no servidor do painel discordaria da do cron
 * exactamente no caso difícil, que é o único em que a regra importa — e o dono veria «em risco»
 * num ecrã e «parado» noutro.
 *
 * `parar` NÃO apaga. É um limite do dono.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const agora = new Date()

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select(
      'id, nome, papel, pilar, pai_id, estado, pausado, instrucoes, orcamento, gasto, receita, chave_receita, avaliado_em, parado_em, parado_porque, morto_em, causa_morte, mutacao, criado_em',
    )
    .order('pilar', { ascending: true })
    .order('criado_em', { ascending: true })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  const equipa = (linhas ?? []) as LinhaAgente[]

  /**
   * Os eventos da janela, para o painel mostrar o MESMO resultado que a regra usa. Sem isto o ecrã
   * mostrava o acumulado e o cron julgava pela janela — dois números diferentes com o mesmo nome.
   */
  const desde = new Date(agora.getTime() - (JANELA_HORAS + 1) * 3_600_000).toISOString()
  const { data: eventos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, criado_em')
    .gte('criado_em', desde)
    .in('tipo', ['receita', 'gastou'])
  const somas = somarJanela((eventos ?? []) as EventoLido[], agora)

  /**
   * 06/10: a régua é «48 h seguidas sem receita» — precisa da hora da ÚLTIMA receita de cada um
   * (de sempre, não só da janela) e das regras configuradas (`regra_desde`, graça). Sem isto o
   * painel julgava pela régua antiga e mostrava «morre» a quem o cron mantém vivo.
   */
  const [{ data: receitasSempre }, { data: cfgVida }, interruptor] = await Promise.all([
    db.from('agentes_eventos').select('agente_id, tipo, valor, criado_em').eq('tipo', 'receita').order('criado_em', { ascending: false }).limit(5000),
    db.from('site_settings').select('value').eq('key', 'agentes_vida').maybeSingle(),
    lerInterruptor(db),
  ])
  const ultimas = ultimaReceita((receitasSempre ?? []) as EventoLido[], agora)
  const regras = lerRegrasVida(cfgVida?.value)

  // As últimas linhas do livro, para o painel poder mostrar o historial sem uma segunda chamada.
  const { data: ultimos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, detalhe, criado_em')
    .order('criado_em', { ascending: false })
    .limit(120)

  const agentes = equipa.map((l) => {
    const montado = montarAgente(l, somas.get(String(l.id)), ultimas.get(String(l.id)) ?? null)
    const juizo = montado.ilegivel.length
      ? {
          decisao: 'espera' as const,
          estado: montado.agente.estado,
          resultado: 0,
          porque: `Não julgado: campos ilegíveis na base (${montado.ilegivel.join(', ')}).`,
        }
      : julgar(montado.agente, agora, regras)

    return {
      id: montado.agente.id,
      nome: montado.agente.nome,
      papel: l.papel ?? null,
      pilar: montado.agente.pilar,
      pai_id: l.pai_id ?? null,
      estado: montado.agente.estado,
      pausado: l.pausado === true,
      instrucoes: l.instrucoes ?? null,
      chave_receita: l.chave_receita ?? null,
      orcamento: Number(l.orcamento ?? 0),
      gasto: montado.agente.gasto,
      receita: montado.agente.receita,
      saldo: montado.agente.saldo,
      receita_janela: montado.agente.receita_janela ?? 0,
      gasto_janela: montado.agente.gasto_janela ?? 0,
      /** Receita menos gasto NA JANELA — é este o número por que o agente vive. */
      resultado: juizo.resultado,
      criado_em: l.criado_em ?? null,
      avaliado_em: l.avaliado_em ?? null,
      parado_em: l.parado_em ?? null,
      parado_porque: l.parado_porque ?? null,
      morto_em: l.morto_em ?? null,
      causa_morte: l.causa_morte ?? null,
      ultima_receita_em: montado.agente.ultima_receita_em ?? null,
      /** O motivo escrito do juízo, que é o que o dono tem de poder ler. */
      juizo: { decisao: juizo.decisao, porque: juizo.porque },
      ilegivel: montado.ilegivel,
    }
  })

  /**
   * A receita, em ENSAIO: o painel mostra o que está atribuído e o que não está, sem escrever
   * nada. Quem escreve é o cron — um ecrã que grava ao ser aberto grava quando alguém faz F5.
   */
  const receita = await atribuirEGravar(db, { ensaio: true })

  /**
   * ── O GOVERNO DA EQUIPA: PEDIDOS, ESCALONAMENTOS E REESCRITAS ──
   *
   * Isto está aqui por uma regra desta casa: automação sem rasto é a doença que se acabou de curar
   * nos agentes. O CEO passou a fechar coisas sozinho — pedir, educar, desbloquear — e tudo o que
   * ele fecha tem de poder ser visto neste ecrã, senão a autonomia é invisível e ninguém a pode
   * auditar.
   *
   * As três leituras em paralelo, e nenhuma delas trava o painel: um erro aqui mostra uma lista
   * vazia e o resto do ecrã continua a funcionar. Um painel de estado que rebenta por não
   * conseguir ler o histórico é um painel que não se abre no dia em que faz falta.
   */
  const [pedidosQ, escalonamentosQ, reescritasQ] = await Promise.all([
    db
      .from('agentes_pedidos')
      .select('id, de_agente_id, para_agente_id, accao, pedido, porque, prazo, desfecho, desfecho_em, resultado, criado_em')
      .order('criado_em', { ascending: false })
      .limit(40),
    db
      .from('agentes_escalonamentos')
      .select('id, assunto, o_que, porque, decisao_pronta, estado, criado_em')
      .order('criado_em', { ascending: false })
      .limit(20),
    db
      .from('agentes_instrucoes_versoes')
      .select('id, agente_id, autor, aceita, limites_perdidos, limites_acrescentados, veredicto, porque, criado_em')
      .order('criado_em', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    ok: true,
    janelaHoras: regras.janelaHoras ?? JANELA_HORAS,
    gracaHoras: regras.gracaHoras,
    /** O interruptor geral do motor autónomo — o MESMO que o painel do AIOS e o Telegram mexem. */
    motor: interruptor,
    agentes,
    eventos: ultimos ?? [],
    receita: {
      moeda: 'EUR',
      liquidoCents: receita.atribuicao.liquidoCents,
      atribuidoCents: receita.atribuicao.atribuidoCents,
      naoAtribuidoCents: receita.atribuicao.naoAtribuidoCents,
      porAtribuir: receita.atribuicao.porAtribuir,
    },
    pedidos: pedidosQ.data ?? [],
    escalonamentos: escalonamentosQ.data ?? [],
    /**
     * As reescritas RECUSADAS saem a par das aceites, e são as que interessam mais: uma recusa diz
     * que o CEO tentou apagar um limite de um filho. Se só se mostrasse o que foi gravado, a
     * tentativa era invisível — e a tentativa é precisamente o que se quer poder ver.
     */
    reescritas: reescritasQ.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const body = (await request.json().catch(() => ({}))) as {
    acao?: 'pausar' | 'retomar' | 'parar' | 'ligar' | 'desligar'
    /**
     * `equipa` = o interruptor dos sete de uma vez. `motor` (06/10) = o interruptor geral do motor
     * autónomo. Sem nenhum, mexe-se num agente só.
     */
    alvo?: 'agente' | 'equipa' | 'motor'
    id?: string
    porque?: string
  }

  /**
   * O INTERRUPTOR GERAL DO MOTOR (06/10). Escreve `site_settings.agentes_motor_ligado` — a MESMA
   * chave que o painel do AIOS e o comando «para os agentes» no Telegram escrevem. Um sítio só,
   * para os três nunca discordarem.
   */
  if (body.alvo === 'motor') {
    if (body.acao !== 'ligar' && body.acao !== 'desligar') {
      return NextResponse.json({ ok: false, erro: 'O motor liga ou desliga.' }, { status: 400 })
    }
    const db = getSupabaseAdmin()
    const r = await gravarInterruptor(db, body.acao === 'ligar', 'painel', String(body.porque ?? ''))
    return NextResponse.json(
      r.ok
        ? { ok: true, porque: body.acao === 'ligar' ? 'Motor ligado: os agentes vivos voltam a acordar no próximo minuto do orquestrador.' : 'Motor desligado: nenhum agente acorda até o voltares a ligar.' }
        : { ok: false, erro: r.erro },
      { status: r.ok ? 200 : 500 },
    )
  }

  const acao = body.acao
  if (acao !== 'pausar' && acao !== 'retomar' && acao !== 'parar') {
    return NextResponse.json({ ok: false, erro: 'acção inválida' }, { status: 400 })
  }

  /**
   * O INTERRUPTOR DA EQUIPA.
   *
   * `parar` não entra aqui de propósito: parar é o fim da linha, com data e motivo escritos, e um
   * botão que o fizesse aos sete de uma vez era um acidente à espera de acontecer. A equipa pausa
   * e retoma; parar continua a ser um a um, com a mão do dono.
   */
  if (body.alvo === 'equipa') {
    if (acao === 'parar') {
      return NextResponse.json(
        { ok: false, erro: 'Parar é um a um: é o fim da linha e fica com data e motivo escritos.' },
        { status: 400 },
      )
    }
    /**
     * Ligado ao interruptor geral (pedido do dono, 06/10): pausar a equipa DESLIGA o motor, retomar
     * LIGA-o. Desligar primeiro: se a pausa falhar a meio, o motor já não acorda ninguém.
     */
    const dbMotor = getSupabaseAdmin()
    const m = await gravarInterruptor(dbMotor, acao === 'retomar', 'painel', `interruptor da equipa: ${acao}`)
    const resposta = await interruptorDaEquipa(acao, String(body.porque ?? ''))
    if (!m.ok) {
      const j = await resposta.json()
      return NextResponse.json({ ...j, ok: false, erro: `Equipa: ${j.porque ?? ''} — mas o interruptor do motor NÃO foi gravado (${m.erro}).` }, { status: 500 })
    }
    return resposta
  }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ ok: false, erro: 'falta o agente' }, { status: 400 })

  const db = getSupabaseAdmin()
  const r = await acaoManual(db, id, acao, String(body.porque ?? ''))
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro ?? 'não foi possível' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    porque:
      acao === 'parar'
        ? 'Agente parado. A linha fica — parar não apaga, e volta com um clique em Retomar.'
        : acao === 'pausar'
          ? 'Agente pausado. A regra das 48 horas não corre em agentes pausados.'
          : 'Agente retomado.',
  })
}

/**
 * Pausar ou retomar a equipa toda.
 *
 * ═══ PORQUE É QUE ISTO LÊ EVENTOS ANTES DE DECIDIR ═════════════════════════════════════════
 *
 * Porque «retomar a equipa» só pode mexer em quem o PRÓPRIO botão pausou. Para o saber, lê-se o
 * último evento de pausa de cada agente e vê-se se traz a marca do interruptor. A alternativa era
 * uma coluna nova a dizer «fui pausado pelo botão» — e uma segunda versão do mesmo facto é como
 * elas divergem. O livro de eventos já é a memória de quem fez o quê.
 *
 * A decisão em si está em `lib/agentes/interruptor-equipa.ts`, com guarda ao lado: é a parte que
 * erra em silêncio, e aqui só se executa o que ela decidiu.
 */
async function interruptorDaEquipa(acao: 'pausar' | 'retomar', porqueDoDono: string) {
  const db = getSupabaseAdmin()

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select('id, nome, estado, pausado')
    .order('nome')
  if (error || !linhas) {
    return NextResponse.json({ ok: false, erro: error?.message ?? 'não deu para ler a equipa' }, { status: 500 })
  }

  /**
   * Quem foi pausado pelo botão? Só interessa para o retomar — no pausar ninguém pergunta. Lê-se
   * o evento de pausa MAIS RECENTE de cada agente: um agente pausado pelo botão na segunda-feira,
   * retomado, e pausado à mão na quarta tem de contar como pausado à mão.
   */
  const marcados = new Set<string>()
  if (acao === 'retomar') {
    const { data: eventos } = await db
      .from('agentes_eventos')
      .select('agente_id, tipo, detalhe, criado_em')
      .in('tipo', ['avisado', 'retomado'])
      .order('criado_em', { ascending: false })
      .limit(400)
    const jaVisto = new Set<string>()
    for (const e of (eventos ?? []) as { agente_id: string; tipo: string; detalhe: string | null }[]) {
      if (jaVisto.has(e.agente_id)) continue // só o mais recente de cada um conta
      jaVisto.add(e.agente_id)
      if (e.tipo === 'avisado' && veioDoInterruptor(e.detalhe)) marcados.add(e.agente_id)
    }
  }

  const equipa: AgenteNoInterruptor[] = (linhas as LinhaAgente[]).map((l) => ({
    id: l.id,
    nome: l.nome,
    estado: String(l.estado ?? ''),
    pausado: Boolean(l.pausado),
    pausadoPelaEquipa: marcados.has(l.id),
  }))

  const plano = decidirInterruptor(equipa, acao)
  const motivo = motivoDoInterruptor(porqueDoDono)

  /**
   * Um a um, e não em bloco: `acaoManual` é quem sabe escrever o estado E o evento, e reescrever
   * isso aqui criava a segunda versão da mesma regra. Se um falhar a meio, os anteriores ficam
   * feitos — e é por isso que se devolve a lista do que correu mal em vez de um «erro» sozinho.
   */
  const falhados: { nome: string; erro: string }[] = []
  for (const m of plano.mexer) {
    if (!m.acao) continue
    const r = await acaoManual(db, m.id, m.acao, motivo)
    if (!r.ok) falhados.push({ nome: m.nome, erro: r.erro ?? 'não foi possível' })
  }

  const mexidos = plano.mexer.length - falhados.length
  return NextResponse.json({
    ok: falhados.length === 0,
    porque:
      falhados.length === 0
        ? plano.resumo
        : `${mexidos} de ${plano.mexer.length} ${acao === 'pausar' ? 'pausados' : 'retomados'}; os outros falharam.`,
    mexidos,
    deixados: plano.deixar,
    falhados,
  })
}
