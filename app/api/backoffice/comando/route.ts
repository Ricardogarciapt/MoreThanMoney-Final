/**
 * TEXTO → ACÇÃO no backoffice (o que se disse ao microfone, ou se escreveu na caixa do comando).
 *
 * Ler corre já e devolve o resultado. Mudar NUNCA corre aqui: volta como `proposta`, e o botão
 * «Confirmar» do ecrã chama as rotas de sempre (`PATCH /api/backoffice/negocios/[id]`,
 * `POST /api/backoffice/tarefas`), com as fechaduras de sempre. Esta rota não escreve em tabela
 * nenhuma do negócio — por isso não tem como passar ao lado delas.
 *
 * IA: cadeia GRÁTIS (`chamarIAGratis`). Se falhar, diz-se que falhou; não se inventa acção.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade, type ContextoBackoffice } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { pode } from '@/lib/backoffice-papeis'
import { COLUNAS_DE_PARTICIPACAO } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio, type AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'
import { ESTADO_PIPELINE_NOME, type EstadoPipeline } from '@/lib/backoffice-vista'
import { chamarIAGratis, mensagemIndisponivel } from '@/lib/ia/chamar'
import { ferramentaPorNome } from '@/lib/mcp/ferramentas'
import { MAX_TEXTO_COMANDO, PAGINAS_VOZ, interpretarAccao, padraoDeProcura, sistemaDoComando } from '@/lib/backoffice-voz'

export const runtime = 'nodejs'

type NegocioCurto = { id: string; nome: string; estado: string }

async function procurarNegocios(ctx: ContextoBackoffice, texto: string): Promise<NegocioCurto[] | null> {
  if (!pode(ctx.capacidades, 'bo.pipeline_proprio')) return null
  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'pipeline')
  const { data } = await supabase
    .from('vendas_negocios')
    .select(`id, nome, estado, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .ilike('nome', padraoDeProcura(texto))
    .order('atualizado_em', { ascending: false, nullsFirst: false })
    .limit(40)
  const linhas = (data ?? []) as unknown as Array<AtribuicoesDoNegocio & NegocioCurto>
  return linhas
    .filter((n) => podeMexerNoNegocio(n, ambito))
    .slice(0, 8)
    .map((n) => ({ id: n.id, nome: n.nome, estado: n.estado }))
}

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  let texto = ''
  try {
    const b = (await request.json()) as { texto?: unknown }
    texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, MAX_TEXTO_COMANDO) : ''
  } catch {
    /* corpo inválido → texto vazio */
  }
  if (!texto) return NextResponse.json({ error: 'Diz ou escreve o que queres fazer.' }, { status: 400 })

  const podeGestao = ctx.admin || pode(ctx.capacidades, 'bo.gestao_crm')
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

  let bruto: string
  try {
    const r = await chamarIAGratis({
      sistema: sistemaDoComando(hoje, podeGestao),
      mensagens: [{ role: 'user', content: texto }],
      json: true,
      temperatura: 0,
      maxTokens: 300,
      preferencia: 'rapido',
      tarefa: 'backoffice-voz',
    })
    bruto = r.texto
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }

  const accao = interpretarAccao(bruto, podeGestao)

  switch (accao.tipo) {
    case 'responder':
      return NextResponse.json({ texto, accao, resposta: accao.texto })

    case 'abrir':
      return NextResponse.json({ texto, accao, navegar: PAGINAS_VOZ[accao.pagina] })

    case 'procurar_negocio': {
      const negocios = await procurarNegocios(ctx, accao.texto)
      if (!negocios) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      return NextResponse.json({
        texto,
        accao,
        resposta: negocios.length ? `Encontrei ${negocios.length}.` : `Não encontrei nenhum negócio com «${accao.texto}».`,
        negocios,
      })
    }

    case 'minhas_tarefas': {
      if (!pode(ctx.capacidades, 'bo.tarefas_proprias')) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem tarefas.' })
      const { data } = await getSupabaseAdmin()
        .from('vendas_tarefas')
        .select('id, titulo, prazo')
        .eq('responsavel_id', ctx.userId)
        .eq('estado', 'aberta')
        .order('prazo', { ascending: true, nullsFirst: false })
        .limit(10)
      const tarefas = data ?? []
      return NextResponse.json({ texto, accao, resposta: tarefas.length ? `Tens ${tarefas.length} tarefa(s) abertas.` : 'Não tens tarefas abertas.', tarefas })
    }

    case 'resumo_pipeline': {
      const f = ferramentaPorNome('pipeline_vendas')
      const r = (await f?.correr({ dias: accao.dias })) as
        | { total?: number; porEtapa?: [string, number][]; porOrigem?: [string, number][]; erro?: string }
        | undefined
      if (!r || r.erro) return NextResponse.json({ texto, accao, resposta: 'Não consegui ler o pipeline agora.' })
      const etapas = (r.porEtapa ?? []).map(([e, n]) => `${ESTADO_PIPELINE_NOME[e as EstadoPipeline] ?? e}: ${n}`).join(' · ')
      const origens = (r.porOrigem ?? []).slice(0, 4).map(([o, n]) => `${o}: ${n}`).join(' · ')
      return NextResponse.json({ texto, accao, resposta: `Últimos ${accao.dias} dias: ${r.total ?? 0} negócios. ${etapas}. Principais origens: ${origens}.` })
    }

    case 'mover_negocio': {
      const candidatos = await procurarNegocios(ctx, accao.negocio)
      if (!candidatos) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      if (!candidatos.length) return NextResponse.json({ texto, accao, resposta: `Não encontrei «${accao.negocio}» no teu pipeline.` })
      return NextResponse.json({
        texto,
        accao,
        resposta: `Passar para «${ESTADO_PIPELINE_NOME[accao.estado]}». Confirma o negócio certo:`,
        proposta: { tipo: 'mover_negocio', estado: accao.estado, motivo_perda: accao.motivo_perda ?? null, candidatos },
      })
    }

    case 'criar_tarefa': {
      if (!pode(ctx.capacidades, 'bo.tarefas_proprias')) return NextResponse.json({ texto, accao, resposta: 'Esta conta não pode criar tarefas.' })
      const candidatos = accao.negocio ? ((await procurarNegocios(ctx, accao.negocio)) ?? []) : []
      return NextResponse.json({
        texto,
        accao,
        resposta: 'Criar esta tarefa?',
        proposta: { tipo: 'criar_tarefa', titulo: accao.titulo, prazo: accao.prazo, negocio: accao.negocio, candidatos },
      })
    }
  }
}
