/**
 * TRANSCRIÇÃO DE UMA CHAMADA → RESUMO, objeções, próximos passos e tarefas propostas.
 *
 * Não escreve nada: devolve o resumo e, se a chamada estiver ligada a um negócio do teu âmbito, a
 * nota sugerida (resumo por cima, nota antiga por baixo). Guardar a nota e criar as tarefas são
 * toques do ecrã que chamam as rotas de sempre (`PATCH /api/backoffice/negocios/[id]`,
 * `POST /api/backoffice/tarefas`), com as fechaduras de sempre.
 *
 * IA: cadeia GRÁTIS (`chamarIAGratis`). Áudio nunca chega aqui — só texto.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { notaDoNegocio } from '@/lib/backoffice-procura'
import { chamarIAGratis, mensagemIndisponivel } from '@/lib/ia/chamar'
import { ehTipoChamada, encurtarTranscricao, interpretarResumo, notaDaChamada, sistemaDoResumo } from '@/lib/backoffice-chamada'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  let b: { tipo?: unknown; transcricao?: unknown; negocio_id?: unknown }
  try {
    b = (await request.json()) as typeof b
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const tipo = ehTipoChamada(b.tipo) ? b.tipo : 'followup'
  const bruta = typeof b.transcricao === 'string' ? b.transcricao : ''
  if (bruta.trim().length < 40) return NextResponse.json({ error: 'A transcrição é demasiado curta para resumir.' }, { status: 400 })
  const { texto, cortada } = encurtarTranscricao(bruta)

  const negocioId = typeof b.negocio_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.negocio_id) ? b.negocio_id : null
  const negocio = negocioId ? await notaDoNegocio(ctx, negocioId) : undefined
  if (negocioId && !negocio) return NextResponse.json({ error: 'Esse negócio não está no teu pipeline.' }, { status: 403 })

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
  let bruto: string
  try {
    const r = await chamarIAGratis({
      sistema: sistemaDoResumo(tipo, hoje),
      mensagens: [{ role: 'user', content: texto }],
      json: true,
      temperatura: 0.2,
      maxTokens: 900,
      tarefa: 'backoffice-chamada',
    })
    bruto = r.texto
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }

  const resumo = interpretarResumo(bruto)
  if (!resumo) return NextResponse.json({ error: 'A IA não devolveu um resumo legível. Tenta outra vez.' }, { status: 502 })

  return NextResponse.json({
    ...resumo,
    cortada,
    negocio: negocio && negocioId ? { id: negocioId, nome: negocio.nome } : null,
    nota_sugerida: negocio ? notaDaChamada(tipo, hoje, resumo, negocio.nota) : null,
  })
}
