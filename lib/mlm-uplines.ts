/**
 * Resolução da organização ascendente (sponsor chain + árvore binária MLM).
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabase = getSupabaseAdmin()

/** Cadeia de patrocinadores directos (mlm_sponsor_username). */
export async function getSponsorChainUserIds(
  memberUserId: string,
  maxDepth = 20,
): Promise<string[]> {
  const ids: string[] = []
  let currentId: string | null = memberUserId
  const visited = new Set<string>()
  let depth = 0

  while (currentId && depth < maxDepth) {
    depth++
    // Anotacao explicita: sem ela o TS entra em inferencia circular (TS7022) —
    // o tipo da linha vem da query, e a query depende de `currentId`, que acaba
    // por ser atribuido a partir dela.
    const { data: profile }: { data: { mlm_sponsor_username: string | null } | null } = await supabase
      .from('profiles')
      .select('mlm_sponsor_username')
      .eq('id', currentId)
      .maybeSingle()

    const sponsorUsername: string | undefined = profile?.mlm_sponsor_username?.trim()
    if (!sponsorUsername) break

    const { data: sponsor }: { data: { id: string } | null } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', sponsorUsername)
      .maybeSingle()

    if (!sponsor?.id || visited.has(sponsor.id)) break
    visited.add(sponsor.id)
    ids.push(sponsor.id)
    currentId = sponsor.id
  }

  return ids
}

/** Uplines na árvore binária (parent_node_id). */
export async function getBinaryUplineUserIds(
  memberUserId: string,
  maxDepth = 20,
): Promise<string[]> {
  const ids: string[] = []
  const visited = new Set<string>()

  const { data: startNode } = await supabase
    .from('mlm_nodes')
    .select('id, parent_node_id')
    .eq('user_id', memberUserId)
    .maybeSingle()

  if (!startNode?.parent_node_id) return ids

  let currentParentId: string | null = startNode.parent_node_id
  let depth = 0

  while (currentParentId && depth < maxDepth) {
    depth++
    if (visited.has(currentParentId)) break
    visited.add(currentParentId)

    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, user_id, parent_node_id')
      .eq('id', currentParentId)
      .maybeSingle()

    if (!node?.user_id) break
    ids.push(node.user_id)
    currentParentId = node.parent_node_id
  }

  return ids
}

/** Organização ascendente unificada (sponsor + binário), sem o próprio membro. */
export async function getOrganizationUplineUserIds(
  memberUserId: string,
  excludeIds: string[] = [],
): Promise<string[]> {
  const [sponsorChain, binaryUplines] = await Promise.all([
    getSponsorChainUserIds(memberUserId),
    getBinaryUplineUserIds(memberUserId),
  ])

  const exclude = new Set([memberUserId, ...excludeIds])
  return [...new Set([...sponsorChain, ...binaryUplines])].filter((id) => !exclude.has(id))
}
