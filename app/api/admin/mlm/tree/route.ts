import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import {
  bootstrapActiveMembersUnderRoot,
  fetchMlmTreeView,
  listMlmPlacementSlots,
  moveMlmLeafNode,
  MLM_ROOT_USERNAME,
} from '@/lib/mlm-tree-admin'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const rootUsername = request.nextUrl.searchParams.get('root') || MLM_ROOT_USERNAME
  const view = request.nextUrl.searchParams.get('view')

  if (view === 'slots') {
    const slots = await listMlmPlacementSlots(supabase)
    return NextResponse.json({ slots })
  }

  const tree = await fetchMlmTreeView(supabase, rootUsername)
  return NextResponse.json({ tree, root_username: rootUsername })
}

/** Inicializar: todos os activos sob MoreThanMoney (distribuição equilibrada). */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const action = body.action || 'bootstrap'

  if (action === 'bootstrap') {
    const result = await bootstrapActiveMembersUnderRoot(supabase, {
      rootUsername: body.root_username || MLM_ROOT_USERNAME,
      limit: typeof body.limit === 'number' ? body.limit : 2000,
    })
    return NextResponse.json({ success: true, ...result })
  }

  if (action === 'move') {
    const { node_id, new_parent_node_id, position } = body
    if (!node_id || !new_parent_node_id || !position) {
      return NextResponse.json(
        { error: 'node_id, new_parent_node_id e position são obrigatórios' },
        { status: 400 },
      )
    }
    if (position !== 'left' && position !== 'right') {
      return NextResponse.json({ error: 'position deve ser left ou right' }, { status: 400 })
    }

    try {
      await moveMlmLeafNode(supabase, {
        nodeId: node_id,
        newParentNodeId: new_parent_node_id,
        position,
      })
      const tree = await fetchMlmTreeView(supabase)
      return NextResponse.json({ success: true, tree })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Erro ao mover nó' },
        { status: 400 },
      )
    }
  }

  return NextResponse.json({ error: 'Acção inválida' }, { status: 400 })
}
