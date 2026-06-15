import type { SupabaseClient } from '@supabase/supabase-js'
import { placeBuyerInMlmTree } from '@/lib/mlm-tree'

type MlmSupabase = SupabaseClient

export const MLM_ROOT_USERNAME = 'MoreThanMoney'

export type MlmTreeNodeView = {
  node_id: string
  user_id: string
  username: string | null
  email: string | null
  position: 'left' | 'right' | null
  sponsor_username: string | null
  rank_id: number
  left_count: number
  right_count: number
  left_child_id: string | null
  right_child_id: string | null
  left: MlmTreeNodeView | null
  right: MlmTreeNodeView | null
}

type FlatNode = {
  id: string
  user_id: string
  parent_node_id: string | null
  position: 'left' | 'right' | null
  sponsor_id: string | null
  left_child_id: string | null
  right_child_id: string | null
  left_count: number
  right_count: number
  rank_id: number
}

const SYSTEM_ROOT_USERNAMES = new Set([
  MLM_ROOT_USERNAME.toLowerCase(),
  'morethanmoney',
  'mtm_sistema',
])

export async function resolveMlmRootUser(
  supabase: MlmSupabase,
  rootUsername = MLM_ROOT_USERNAME,
): Promise<{ id: string; username: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', rootUsername)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (data?.id) return { id: data.id, username: data.username }

  const { data: byEmail } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('email', 'morethanmoneypt@gmail.com')
    .maybeSingle()

  return byEmail?.id ? { id: byEmail.id, username: byEmail.username } : null
}

export async function ensureMlmRootNode(supabase: MlmSupabase, rootUserId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('mlm_nodes')
    .select('id')
    .eq('user_id', rootUserId)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created } = await supabase
    .from('mlm_nodes')
    .insert({
      user_id: rootUserId,
      parent_node_id: null,
      position: null,
      rank_id: 0,
    })
    .select('id')
    .single()

  if (!created?.id) throw new Error('Não foi possível criar nó raiz MLM')
  return created.id
}

/** Coloca todas as subscrições activas sob a raiz, distribuição equilibrada (BFS). */
export async function bootstrapActiveMembersUnderRoot(
  supabase: MlmSupabase,
  options?: { rootUsername?: string; limit?: number },
): Promise<{
  root_user_id: string
  root_node_id: string
  placed: number
  skipped: number
  sponsor_updated: number
  errors: string[]
}> {
  const result = {
    root_user_id: '',
    root_node_id: '',
    placed: 0,
    skipped: 0,
    sponsor_updated: 0,
    errors: [] as string[],
  }

  const root = await resolveMlmRootUser(supabase, options?.rootUsername)
  if (!root) {
    result.errors.push(`Utilizador raiz "${options?.rootUsername ?? MLM_ROOT_USERNAME}" não encontrado`)
    return result
  }

  result.root_user_id = root.id
  result.root_node_id = await ensureMlmRootNode(supabase, root.id)

  const limit = options?.limit ?? 2000

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, is_active, subscription_status, subscription_plan, apple_original_transaction_id, stripe_customer_id, mlm_sponsor_username')
    .eq('is_active', true)
    .in('subscription_status', ['active', 'grace_period'])
    .or(
      'subscription_plan.not.is.null,apple_original_transaction_id.not.is.null,stripe_customer_id.not.is.null',
    )
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    result.errors.push(error.message)
    return result
  }

  const { data: nodes } = await supabase.from('mlm_nodes').select('user_id')
  const inTree = new Set((nodes || []).map((n) => n.user_id))

  for (const profile of profiles || []) {
    if (profile.id === root.id) {
      result.skipped += 1
      continue
    }

    const uname = (profile.username || '').toLowerCase()
    if (SYSTEM_ROOT_USERNAMES.has(uname) && profile.id !== root.id) {
      result.skipped += 1
      continue
    }

    if (!profile.mlm_sponsor_username || profile.mlm_sponsor_username !== root.username) {
      await supabase
        .from('profiles')
        .update({ mlm_sponsor_username: root.username })
        .eq('id', profile.id)
      result.sponsor_updated += 1
    }

    if (inTree.has(profile.id)) {
      result.skipped += 1
      continue
    }

    try {
      await placeBuyerInMlmTree(supabase, profile.id, root.id, 0, { skipPendingIncrement: true })
      inTree.add(profile.id)
      result.placed += 1
    } catch (err) {
      result.errors.push(
        `${profile.username ?? profile.id}: ${err instanceof Error ? err.message : 'erro'}`,
      )
    }
  }

  await recalculateEntireTreeCounts(supabase, result.root_node_id)
  return result
}

export async function fetchMlmTreeView(
  supabase: MlmSupabase,
  rootUsername = MLM_ROOT_USERNAME,
): Promise<MlmTreeNodeView | null> {
  const root = await resolveMlmRootUser(supabase, rootUsername)
  if (!root) return null

  const rootNodeId = await ensureMlmRootNode(supabase, root.id)

  const { data: nodes } = await supabase
    .from('mlm_nodes')
    .select(
      'id, user_id, parent_node_id, position, sponsor_id, left_child_id, right_child_id, left_count, right_count, rank_id',
    )

  if (!nodes?.length) return null

  const userIds = [...new Set(nodes.map((n) => n.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, email, mlm_sponsor_username')
    .in('id', userIds)

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))
  const nodeMap = new Map(nodes.map((n) => [n.id, n as FlatNode]))

  function build(nodeId: string): MlmTreeNodeView | null {
    const node = nodeMap.get(nodeId)
    if (!node) return null
    const prof = profileMap.get(node.user_id)
    return {
      node_id: node.id,
      user_id: node.user_id,
      username: prof?.username ?? null,
      email: prof?.email ?? null,
      position: node.position,
      sponsor_username: prof?.mlm_sponsor_username ?? null,
      rank_id: node.rank_id ?? 0,
      left_count: node.left_count ?? 0,
      right_count: node.right_count ?? 0,
      left_child_id: node.left_child_id,
      right_child_id: node.right_child_id,
      left: node.left_child_id ? build(node.left_child_id) : null,
      right: node.right_child_id ? build(node.right_child_id) : null,
    }
  }

  return build(rootNodeId)
}

/** Lista nós com slots livres (para mover/posicionar). */
export async function listMlmPlacementSlots(supabase: MlmSupabase): Promise<
  Array<{
    node_id: string
    user_id: string
    username: string | null
    open_left: boolean
    open_right: boolean
  }>
> {
  const { data: nodes } = await supabase
    .from('mlm_nodes')
    .select('id, user_id, left_child_id, right_child_id')

  if (!nodes?.length) return []

  const userIds = nodes.map((n) => n.user_id)
  const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
  const profileMap = new Map((profiles || []).map((p) => [p.id, p.username]))

  return nodes
    .filter((n) => !n.left_child_id || !n.right_child_id)
    .map((n) => ({
      node_id: n.id,
      user_id: n.user_id,
      username: profileMap.get(n.user_id) ?? null,
      open_left: !n.left_child_id,
      open_right: !n.right_child_id,
    }))
}

/** Move um nó folha para outro pai (esquerda/direita). */
export async function moveMlmLeafNode(
  supabase: MlmSupabase,
  params: { nodeId: string; newParentNodeId: string; position: 'left' | 'right' },
): Promise<void> {
  const { nodeId, newParentNodeId, position } = params

  if (nodeId === newParentNodeId) {
    throw new Error('Nó não pode ser pai de si mesmo')
  }

  const { data: node } = await supabase
    .from('mlm_nodes')
    .select('id, user_id, parent_node_id, position, left_child_id, right_child_id')
    .eq('id', nodeId)
    .single()

  if (!node) throw new Error('Nó não encontrado')
  if (node.left_child_id || node.right_child_id) {
    throw new Error('Só é possível mover nós folha (sem filhos)')
  }

  const { data: newParent } = await supabase
    .from('mlm_nodes')
    .select('id, user_id, left_child_id, right_child_id, parent_node_id')
    .eq('id', newParentNodeId)
    .single()

  if (!newParent) throw new Error('Nó pai destino não encontrado')

  const childField = position === 'left' ? 'left_child_id' : 'right_child_id'
  if (newParent[childField as 'left_child_id' | 'right_child_id']) {
    throw new Error(`Posição ${position} já ocupada no nó destino`)
  }

  // Evitar ciclo: destino não pode estar abaixo do nó movido (folha → sempre ok se destino != node)
  if (await isDescendant(supabase, nodeId, newParentNodeId)) {
    throw new Error('Destino inválido: criaria ciclo na árvore')
  }

  // Remover do pai antigo
  if (node.parent_node_id) {
    const oldParentField = node.position === 'left' ? 'left_child_id' : 'right_child_id'
    await supabase
      .from('mlm_nodes')
      .update({ [oldParentField]: null, updated_at: new Date().toISOString() })
      .eq('id', node.parent_node_id)
  }

  // Ligar ao novo pai
  await supabase
    .from('mlm_nodes')
    .update({
      parent_node_id: newParentNodeId,
      position,
      sponsor_id: newParent.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', nodeId)

  await supabase
    .from('mlm_nodes')
    .update({ [childField]: nodeId, updated_at: new Date().toISOString() })
    .eq('id', newParentNodeId)

  const { data: sponsorProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', newParent.user_id)
    .maybeSingle()

  if (sponsorProfile?.username) {
    await supabase
      .from('profiles')
      .update({ mlm_sponsor_username: sponsorProfile.username })
      .eq('id', node.user_id)
  }

  const root = await resolveMlmRootUser(supabase)
  if (root) {
    const rootNodeId = await ensureMlmRootNode(supabase, root.id)
    await recalculateEntireTreeCounts(supabase, rootNodeId)
  }
}

async function isDescendant(
  supabase: MlmSupabase,
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  let currentId: string | null = candidateId
  let depth = 0
  while (currentId && depth < 50) {
    if (currentId === ancestorId) return true
    const { data } = await supabase
      .from('mlm_nodes')
      .select('parent_node_id')
      .eq('id', currentId)
      .maybeSingle()
    currentId = data?.parent_node_id ?? null
    depth += 1
  }
  return false
}

/** Recalcula left_count / right_count em toda a árvore a partir da raiz. */
export async function recalculateEntireTreeCounts(
  supabase: MlmSupabase,
  rootNodeId: string,
): Promise<void> {
  const { data: nodes } = await supabase
    .from('mlm_nodes')
    .select('id, left_child_id, right_child_id')

  if (!nodes?.length) return

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const counts = new Map<string, { left: number; right: number }>()

  function subtreeSize(nodeId: string | null): number {
    if (!nodeId) return 0
    const n = nodeMap.get(nodeId)
    if (!n) return 0
    return 1 + subtreeSize(n.left_child_id) + subtreeSize(n.right_child_id)
  }

  function walk(nodeId: string): void {
    const n = nodeMap.get(nodeId)
    if (!n) return
    const left = subtreeSize(n.left_child_id)
    const right = subtreeSize(n.right_child_id)
    counts.set(nodeId, { left, right })
    if (n.left_child_id) walk(n.left_child_id)
    if (n.right_child_id) walk(n.right_child_id)
  }

  walk(rootNodeId)

  for (const [id, c] of counts.entries()) {
    await supabase
      .from('mlm_nodes')
      .update({
        left_count: c.left,
        right_count: c.right,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }
}
