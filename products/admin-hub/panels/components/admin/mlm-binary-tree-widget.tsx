'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { adminApiCall } from '@/lib/admin-helpers'
import { Button } from '@/components/ui/button'
import { Loader2, Network, RefreshCw, GitBranch, ZoomIn, ZoomOut } from 'lucide-react'

export type MlmTreeNodeData = {
  node_id: string
  user_id: string
  username: string | null
  email: string | null
  position: 'left' | 'right' | null
  rank_id: number
  rank_name: string | null
  rank_color: string | null
  rank_icon: string | null
  left_count: number
  right_count: number
  left: MlmTreeNodeData | null
  right: MlmTreeNodeData | null
}

function NodeCard({
  node,
  isRoot,
  highlighted,
  onSelect,
}: {
  node: MlmTreeNodeData
  isRoot?: boolean
  highlighted?: boolean
  onSelect?: (node: MlmTreeNodeData) => void
}) {
  const accent = node.rank_color || '#D2A63C'
  return (
    <button
      type="button"
      onClick={() => onSelect?.(node)}
      className={`flex flex-col items-center min-w-[88px] max-w-[120px] px-2 py-2 rounded-xl border transition-all text-center ${
        highlighted
          ? 'ring-2 ring-[#D2A63C] border-[#D2A63C]/50 bg-[#D2A63C]/10'
          : 'border-gray-700/80 bg-gray-800/80 hover:border-gray-600'
      } ${isRoot ? 'border-[#D2A63C]/40 bg-[#D2A63C]/5' : ''}`}
    >
      {node.rank_icon && node.rank_name ? (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full mb-1 truncate max-w-full"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {node.rank_icon} {node.rank_name}
        </span>
      ) : null}
      <span className="text-white text-xs font-semibold truncate w-full">{node.username ?? '—'}</span>
      <span className="text-[10px] text-gray-500 mt-0.5">
        L{node.left_count} · R{node.right_count}
      </span>
      {node.position && !isRoot && (
        <span className="text-[9px] uppercase text-gray-600 mt-0.5">
          {node.position === 'left' ? 'Esq' : 'Dir'}
        </span>
      )}
    </button>
  )
}

function TreeLevel({
  node,
  depth,
  maxDepth,
  focusId,
  onSelect,
}: {
  node: MlmTreeNodeData
  depth: number
  maxDepth: number
  focusId: string | null
  onSelect: (n: MlmTreeNodeData) => void
}) {
  const hasChildren = (node.left || node.right) && depth < maxDepth
  const isRoot = depth === 0

  return (
    <div className="flex flex-col items-center">
      <NodeCard
        node={node}
        isRoot={isRoot}
        highlighted={focusId === node.node_id}
        onSelect={onSelect}
      />
      {hasChildren && (
        <>
          <div className="h-4 w-px bg-gray-600" />
          <div className="relative flex justify-center gap-4 md:gap-8">
            {(node.left || node.right) && (
              <div
                className="absolute top-0 left-[25%] right-[25%] h-px bg-gray-600"
                aria-hidden
              />
            )}
            <div className="flex flex-col items-center min-w-[100px]">
              {node.left ? (
                <>
                  <div className="h-3 w-px bg-gray-600" />
                  <TreeLevel
                    node={node.left}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    focusId={focusId}
                    onSelect={onSelect}
                  />
                </>
              ) : (
                <div className="h-8 w-[88px] border border-dashed border-gray-800 rounded-lg flex items-center justify-center text-[10px] text-gray-600">
                  vazio
                </div>
              )}
            </div>
            <div className="flex flex-col items-center min-w-[100px]">
              {node.right ? (
                <>
                  <div className="h-3 w-px bg-gray-600" />
                  <TreeLevel
                    node={node.right}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    focusId={focusId}
                    onSelect={onSelect}
                  />
                </>
              ) : (
                <div className="h-8 w-[88px] border border-dashed border-gray-800 rounded-lg flex items-center justify-center text-[10px] text-gray-600">
                  vazio
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {depth >= maxDepth && (node.left || node.right) && (
        <p className="text-[10px] text-gray-500 mt-2">+ sub-árvore (clica no nó)</p>
      )}
    </div>
  )
}

type Props = {
  compact?: boolean
  className?: string
  onOpenEditor?: () => void
}

export default function MlmBinaryTreeWidget({ compact, className, onOpenEditor }: Props) {
  const [tree, setTree] = useState<MlmTreeNodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [maxDepth, setMaxDepth] = useState(compact ? 3 : 4)
  const [focusNode, setFocusNode] = useState<MlmTreeNodeData | null>(null)
  const [subtree, setSubtree] = useState<MlmTreeNodeData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApiCall<{ tree: MlmTreeNodeData | null }>('/api/admin/mlm/tree')
      const root = res.data?.tree ?? null
      setTree(root)
      if (!focusNode) setSubtree(root)
    } finally {
      setLoading(false)
    }
  }, [focusNode])

  useEffect(() => {
    void load()
  }, [load])

  const displayRoot = subtree ?? tree

  const handleSelect = (node: MlmTreeNodeData) => {
    setFocusNode(node)
    if (node.left || node.right) {
      setSubtree(node)
      setMaxDepth(compact ? 3 : 4)
    }
  }

  const resetToRoot = () => {
    setFocusNode(null)
    setSubtree(tree)
  }

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden ${className ?? ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[#D2A63C]" />
          <span className="text-white text-sm font-medium">Árvore Binária</span>
          {focusNode && (
            <span className="text-xs text-gray-500">
              foco: <span className="text-[#D2A63C]">{focusNode.username}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-gray-400 hover:text-white"
            onClick={() => setMaxDepth((d) => Math.max(2, d - 1))}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-gray-500 w-8 text-center">{maxDepth}L</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-gray-400 hover:text-white"
            onClick={() => setMaxDepth((d) => Math.min(6, d + 1))}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          {focusNode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-gray-700 text-xs text-gray-300"
              onClick={resetToRoot}
            >
              Raiz MTM
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-8 text-gray-400" onClick={() => void load()}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {onOpenEditor && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-[#D2A63C] text-xs"
              onClick={onOpenEditor}
            >
              <GitBranch className="w-3.5 h-3.5 mr-1" />
              Editor
            </Button>
          )}
        </div>
      </div>

      <div className={`overflow-auto ${compact ? 'max-h-[360px] p-4' : 'max-h-[520px] p-6'}`}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : displayRoot ? (
          <div className="min-w-max mx-auto">
            <TreeLevel
              node={displayRoot}
              depth={0}
              maxDepth={maxDepth}
              focusId={focusNode?.node_id ?? null}
              onSelect={handleSelect}
            />
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 text-sm">Árvore vazia.</div>
        )}
      </div>

      {focusNode && (
        <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex flex-wrap gap-3">
          <span>Rede: L{focusNode.left_count} / R{focusNode.right_count}</span>
          {focusNode.email && <span>{focusNode.email}</span>}
          <Link
            href={`/admin?tab=users&highlight=${focusNode.user_id}`}
            className="text-[#D2A63C] hover:underline"
          >
            Gerir utilizador
          </Link>
        </div>
      )}
    </div>
  )
}
