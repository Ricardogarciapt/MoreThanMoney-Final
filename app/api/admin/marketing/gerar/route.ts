import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import { excessos, formatoSaida, geradorPorId, normalizarVariacoes } from '@/lib/marketing/geradores'
import { lerMarca, marcaEmTexto } from '@/lib/marketing/marca'
import { REGRAS_CASA, peneira } from '@/lib/marketing/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * ESTÚDIO — POST { gerador, entradas } → as variações desse gerador (lib/marketing/geradores).
 *
 * Uma rota para os 29 geradores e optimizadores. A IA é a cadeia da casa (grátis primeiro), a
 * marca entra em todos os pedidos e cada variação volta com a «peneira» das regras (o que se
 * apanha sem IA: promessas, «você», trading sem aviso) e os excessos de caracteres da plataforma.
 * Só escreve texto: publicar continua a ser um gesto do dono.
 */
export async function POST(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado

  const b = (await request.json().catch(() => ({}))) as { gerador?: string; entradas?: Record<string, unknown> }
  const g = geradorPorId(String(b.gerador ?? ''))
  if (!g) return NextResponse.json({ error: 'Gerador desconhecido.' }, { status: 400 })

  const entradas = b.entradas && typeof b.entradas === 'object' ? b.entradas : {}
  const valores = g.entradas.map((c) => [c, String(entradas[c.id] ?? '').trim().slice(0, 4000)] as const)
  const falta = valores.find(([c, v]) => c.obrigatorio && !v)
  if (falta) return NextResponse.json({ error: `Falta: ${falta[0].rotulo}.` }, { status: 400 })

  const marca = await lerMarca()
  const sistema = `És o estúdio de marketing da MoreThanMoney: copywriter e gestor de tráfego sénior.
Ferramenta: ${g.nome} — ${g.descricao}
${g.pede}

${REGRAS_CASA}

${marcaEmTexto(marca)}

${formatoSaida(g)}`

  try {
    const r = await chamarIA({
      tarefa: `marketing-estudio:${g.id}`,
      preferencia: 'qualidade',
      json: true,
      maxTokens: 2600,
      timeoutMs: 45_000,
      sistema,
      mensagens: [{ role: 'user', content: valores.map(([c, v]) => `${c.rotulo}: ${v || '—'}`).join('\n') }],
    })
    const bruto = JSON.parse(r.texto) as Record<string, unknown>
    const variacoes = normalizarVariacoes(g, bruto).map((v) => ({
      ...v,
      excessos: excessos(g, v),
      alertas: peneira(Object.values(v.campos).flat().join('\n')),
    }))
    return NextResponse.json({ gerador: g.id, variacoes, notas: String(bruto.notas ?? '').slice(0, 600), modelo: r.modelo, fornecedor: r.fornecedor })
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }
}
