import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { mudarCampanha, type MudancaCampanha } from '@/lib/trafego/meta'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/trafego/acoes { campanhaId, acao: 'pausar'|'activar'|'orcamento', diario? }
 *
 * Mexe em dinheiro — por isso, mesmo com o acesso «Comercial» (que lê o tráfego), só o DONO escreve.
 * O ecrã pede confirmação; aqui volta-se a verificar quem é.
 */
export async function POST(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.gestao_comercial')
  if (g.negado) return g.negado
  if (!g.admin) return NextResponse.json({ error: 'Só o dono mexe em campanhas e orçamentos.' }, { status: 403 })

  const b = (await request.json().catch(() => ({}))) as { campanhaId?: string; acao?: string; diario?: number }
  const campanhaId = String(b.campanhaId ?? '')
  let m: MudancaCampanha
  if (b.acao === 'pausar' || b.acao === 'activar') m = { acao: b.acao }
  else if (b.acao === 'orcamento') m = { acao: 'orcamento', diario: Number(b.diario) }
  else return NextResponse.json({ error: 'Acção desconhecida.' }, { status: 400 })

  const r = await mudarCampanha(campanhaId, m)
  console.info('[trafego] acção', { por: g.userId, campanhaId, ...m, ok: r.ok })
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: 400 })
}
