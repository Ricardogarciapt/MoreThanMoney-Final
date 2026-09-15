import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'

export const dynamic = 'force-dynamic'

/**
 * DIÁRIO DE TRADING — notas, etiquetas, emoção, setup e print por trade (funded_diario, 072).
 *
 * GET ?accountId=            → as notas da conta (máx. 500, mais recentes primeiro)
 * POST { accountId, positionId?, nota, tags, emocao, setup, screenshotUrl } → cria/actualiza a nota
 *      dessa trade (uma por trade; sem positionId é uma nota solta do dia)
 * DELETE ?accountId=&id=
 *
 * Escrever exige master (investor só lê). O diário NÃO exige conta activa: uma conta quebrada é
 * precisamente a que mais precisa de revisão.
 */

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/diario]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

const texto = (v: unknown, max: number) => (v == null || v === '' ? null : String(v).slice(0, max))

export async function GET(request: NextRequest) {
  try {
    const { conta } = await autorizarConta(request, request.nextUrl.searchParams.get('accountId') ?? '')
    const { data, error } = await getSupabaseAdmin().from('funded_diario').select('*')
      .eq('account_id', conta.id).order('criado_em', { ascending: false }).limit(500)
    if (error) throw new ErroOrdem(503, 'diário indisponível (migração 072 por aplicar?)')
    return NextResponse.json({ notas: data ?? [] })
  } catch (e) { return falhou(e) }
}

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { conta, modo } = await autorizarConta(request, String(b.accountId ?? ''))
    if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
    if (!conta.user_id) throw new ErroOrdem(409, 'conta sem dono')
    const positionId = b.positionId && /^[0-9a-f-]{36}$/i.test(String(b.positionId)) ? String(b.positionId) : null
    const url = texto(b.screenshotUrl, 500)
    if (url && !/^https?:\/\//i.test(url)) throw new ErroOrdem(422, 'o print tem de ser um link http(s)')
    const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 12) : []
    const linha = {
      user_id: conta.user_id, account_id: conta.id, position_id: positionId,
      nota: texto(b.nota, 4000), tags, emocao: texto(b.emocao, 40), setup: texto(b.setup, 80), screenshot_url: url,
      atualizado_em: new Date().toISOString(),
    }
    const db = getSupabaseAdmin()
    if (positionId) {
      const { data: p } = await db.from('funded_positions').select('id').eq('id', positionId).eq('account_id', conta.id).maybeSingle()
      if (!p) throw new ErroOrdem(404, 'trade não encontrada nesta conta')
      const { data: existe } = await db.from('funded_diario').select('id').eq('account_id', conta.id).eq('position_id', positionId).maybeSingle()
      const r = existe
        ? await db.from('funded_diario').update(linha).eq('id', existe.id).select('*').single()
        : await db.from('funded_diario').insert(linha).select('*').single()
      if (r.error) throw new ErroOrdem(500, 'não foi possível guardar a nota')
      return NextResponse.json({ nota: r.data })
    }
    const id = b.id && /^[0-9a-f-]{36}$/i.test(String(b.id)) ? String(b.id) : null
    const r = id
      ? await db.from('funded_diario').update(linha).eq('id', id).eq('account_id', conta.id).select('*').single()
      : await db.from('funded_diario').insert(linha).select('*').single()
    if (r.error) throw new ErroOrdem(500, 'não foi possível guardar a nota')
    return NextResponse.json({ nota: r.data })
  } catch (e) { return falhou(e) }
}

export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const { conta, modo } = await autorizarConta(request, sp.get('accountId') ?? '')
    if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
    const { error } = await getSupabaseAdmin().from('funded_diario').delete().eq('id', sp.get('id') ?? '').eq('account_id', conta.id)
    if (error) throw new ErroOrdem(500, 'não foi possível apagar a nota')
    return NextResponse.json({ ok: true })
  } catch (e) { return falhou(e) }
}

