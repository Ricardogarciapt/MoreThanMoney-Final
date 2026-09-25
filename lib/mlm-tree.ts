import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyTeamRankUp } from '@/lib/notifications-sales'

type MlmSupabase = SupabaseClient

export async function upsertSponsorNode(
  supabase: MlmSupabase,
  sponsorId: string,
  commissionAmount: number
) {
  const { data: sNode } = await supabase
    .from('mlm_nodes')
    .select('id, pending_commissions')
    .eq('user_id', sponsorId)
    .maybeSingle()

  if (sNode) {
    await supabase
      .from('mlm_nodes')
      .update({
        pending_commissions: (Number(sNode.pending_commissions) || 0) + commissionAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', sponsorId)
  } else {
    await supabase
      .from('mlm_nodes')
      .insert({ user_id: sponsorId, pending_commissions: commissionAmount })
      .then(undefined, () => {})
  }
}

export async function placeBuyerInMlmTree(
  supabase: MlmSupabase,
  buyerId: string,
  sponsorId: string,
  commissionAmount: number,
  options?: { skipPendingIncrement?: boolean }
) {
  const { data: existingBuyerNode } = await supabase
    .from('mlm_nodes')
    .select('id')
    .eq('user_id', buyerId)
    .maybeSingle()
  if (existingBuyerNode) return

  let { data: sponsorNode } = await supabase
    .from('mlm_nodes')
    .select('id, left_child_id, right_child_id, left_count, right_count, pending_commissions')
    .eq('user_id', sponsorId)
    .maybeSingle()

  if (!sponsorNode) {
    const { data: newNode } = await supabase
      .from('mlm_nodes')
      .insert({ user_id: sponsorId })
      .select('id, left_child_id, right_child_id, left_count, right_count, pending_commissions')
      .single()
    sponsorNode = newNode
  }
  if (!sponsorNode) return

  if (!options?.skipPendingIncrement) {
    await supabase
      .from('mlm_nodes')
      .update({
        pending_commissions: (Number(sponsorNode.pending_commissions) || 0) + commissionAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', sponsorId)
  }

  const slot = await findNextSlot(supabase, sponsorNode.id)
  if (!slot) return

  const { data: buyerNode } = await supabase
    .from('mlm_nodes')
    .insert({
      user_id: buyerId,
      sponsor_id: sponsorId,
      parent_node_id: slot.parentId,
      position: slot.position,
    })
    .select('id')
    .single()

  if (!buyerNode) return

  const childField = slot.position === 'left' ? 'left_child_id' : 'right_child_id'
  await supabase
    .from('mlm_nodes')
    .update({ [childField]: buyerNode.id, updated_at: new Date().toISOString() })
    .eq('id', slot.parentId)

  await propagateCounts(supabase, slot.parentId, slot.position)
  await recalculateRanksUpwards(supabase, slot.parentId)
}

async function findNextSlot(
  supabase: MlmSupabase,
  rootNodeId: string
): Promise<{ parentId: string; position: 'left' | 'right' } | null> {
  const queue: string[] = [rootNodeId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, left_child_id, right_child_id, left_count, right_count')
      .eq('id', nodeId)
      .single()

    if (!node) continue
    if (!node.left_child_id) return { parentId: nodeId, position: 'left' }
    if (!node.right_child_id) return { parentId: nodeId, position: 'right' }

    if ((node.left_count || 0) <= (node.right_count || 0)) {
      queue.push(node.left_child_id)
    } else {
      queue.push(node.right_child_id)
    }

    if (visited.size > 127) break
  }
  return null
}

async function propagateCounts(
  supabase: MlmSupabase,
  nodeId: string,
  childPosition: 'left' | 'right'
) {
  let currentId: string | null = nodeId
  let position = childPosition
  let depth = 0

  while (currentId && depth < 20) {
    depth++
    // Anotacao explicita: sem ela o TS entra em inferencia circular (TS7022) —
    // o tipo da linha vem da query, e a query depende de `currentId`, que e
    // atribuido a partir da propria linha.
    const { data: node }: {
      data: {
        id: string
        parent_node_id: string | null
        position: string | null
        left_count: number | null
        right_count: number | null
      } | null
    } = await supabase
      .from('mlm_nodes')
      .select('id, parent_node_id, position, left_count, right_count')
      .eq('id', currentId)
      .single()

    if (!node) break

    const field = position === 'left' ? 'left_count' : 'right_count'
    const newCount = ((node[field] as number) || 0) + 1
    await supabase
      .from('mlm_nodes')
      .update({ [field]: newCount, updated_at: new Date().toISOString() })
      .eq('id', currentId)

    if (!node.parent_node_id) break
    position = node.position as 'left' | 'right'
    currentId = node.parent_node_id
  }
}

async function recalculateRanksUpwards(supabase: MlmSupabase, nodeId: string) {
  const { data: allRanks } = await supabase
    .from('mlm_ranks')
    .select('id, left_requirement, right_requirement, direct_requirement, sort_order, name')
    .order('sort_order', { ascending: false })

  if (!allRanks?.length) return

  let currentId: string | null = nodeId
  let depth = 0

  while (currentId && depth < 20) {
    depth++
    // Idem: anotacao explicita para quebrar a inferencia circular (TS7022).
    const { data: node }: {
      data: {
        id: string
        user_id: string
        parent_node_id: string | null
        left_count: number | null
        right_count: number | null
        total_direct: number | null
        rank_id: number | null
      } | null
    } = await supabase
      .from('mlm_nodes')
      .select('id, user_id, parent_node_id, left_count, right_count, total_direct, rank_id')
      .eq('id', currentId)
      .single()

    if (!node) break

    const newRankId = calculateRank(
      node.left_count || 0,
      node.right_count || 0,
      node.total_direct || 0,
      allRanks
    )

    if (newRankId !== node.rank_id && newRankId > (node.rank_id || 0)) {
      await supabase
        .from('mlm_nodes')
        .update({ rank_id: newRankId, updated_at: new Date().toISOString() })
        .eq('id', currentId)

      await supabase
        .from('profiles')
        .update({ mlm_rank_id: newRankId })
        .eq('id', node.user_id)
        .then(undefined, () => {})

      const rankName = allRanks.find((r) => r.id === newRankId)?.name || `Rank ${newRankId}`
      const { data: memberProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', node.user_id)
        .maybeSingle()

      if (memberProfile?.username) {
        void notifyTeamRankUp({
          memberUserId: node.user_id,
          username: memberProfile.username,
          rankName,
          eventId: `rankup_${node.user_id}_${newRankId}`,
        })
      }
    }

    if (!node.parent_node_id) break
    currentId = node.parent_node_id
  }
}

function calculateRank(
  leftCount: number,
  rightCount: number,
  totalDirect: number,
  ranks: Array<{
    id: number
    left_requirement: number
    right_requirement: number
    direct_requirement: number
    sort_order: number
  }>
): number {
  for (const rank of ranks) {
    const okLeft = leftCount >= (rank.left_requirement || 0)
    const okRight = rightCount >= (rank.right_requirement || 0)
    const okDirect = totalDirect >= (rank.direct_requirement || 0)
    if (okLeft && okRight && okDirect) return rank.id
  }
  return ranks[ranks.length - 1]?.id ?? 0
}
