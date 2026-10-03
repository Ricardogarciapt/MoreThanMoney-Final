'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Network,
  ChevronDown,
  ChevronRight,
  MoveRight,
  RefreshCw,
  Users,
  AlertCircle,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TreeNode = {
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
  left: TreeNode | null
  right: TreeNode | null
}

type PlacementSlot = {
  node_id: string
  user_id: string
  username: string | null
  open_left: boolean
  open_right: boolean
}

function TreeNodeRow({
  node,
  depth,
  selectedId,
  onSelect,
  defaultOpen,
}: {
  node: TreeNode
  depth: number
  selectedId: string | null
  onSelect: (node: TreeNode) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2)
  const hasChildren = node.left || node.right
  const isSelected = selectedId === node.node_id
  const isLeaf = !node.left_child_id && !node.right_child_id

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-[#D2A63C]/20 ring-1 ring-[#D2A63C]/40' : 'hover:bg-gray-800/60'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 text-gray-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-white text-sm font-medium truncate">{node.username ?? '—'}</span>
        {node.position && (
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
            {node.position === 'left' ? 'Esq' : 'Dir'}
          </span>
        )}
        {isLeaf && (
          <span className="text-[10px] text-emerald-500/80">folha</span>
        )}
        <span className="text-xs text-gray-500 ml-auto shrink-0">
          L{node.left_count} · R{node.right_count}
        </span>
      </div>
      {open && hasChildren && (
        <div>
          {node.left && (
            <TreeNodeRow
              node={node.left}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}
          {node.right && (
            <TreeNodeRow
              node={node.right}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function MlmTreeEditor() {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [slots, setSlots] = useState<PlacementSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [targetParentId, setTargetParentId] = useState('')
  const [targetPosition, setTargetPosition] = useState<'left' | 'right'>('left')

  const loadTree = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [treeRes, slotsRes] = await Promise.all([
        adminApiCall<{ tree: TreeNode | null }>('/api/admin/mlm/tree'),
        adminApiCall<{ slots: PlacementSlot[] }>('/api/admin/mlm/tree?view=slots'),
      ])
      setTree(treeRes.data?.tree ?? null)
      setSlots(slotsRes.data?.slots ?? [])
    } catch {
      setError('Erro ao carregar árvore')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const bootstrap = async () => {
    if (
      !confirm(
        'Colocar todos os membros activos sob MoreThanMoney com distribuição equilibrada? Membros já na árvore serão ignorados.',
      )
    ) {
      return
    }
    setBootstrapping(true)
    setError('')
    setMessage('')
    try {
      const res = await adminApiCall<{
        placed: number
        skipped: number
        sponsor_updated: number
        errors: string[]
      }>('/api/admin/mlm/tree', {
        method: 'POST',
        body: JSON.stringify({ action: 'bootstrap' }),
      })
      const d = res.data
      if (d) {
        setMessage(
          `✓ ${d.placed} colocados · ${d.skipped} ignorados · ${d.sponsor_updated} sponsors actualizados`,
        )
        if (d.errors?.length) setError(d.errors.slice(0, 3).join(' · '))
      }
      await loadTree()
    } finally {
      setBootstrapping(false)
    }
  }

  const moveNode = async () => {
    if (!selected || !targetParentId) return
    setMoving(true)
    setError('')
    setMessage('')
    try {
      const res = await adminApiCall<{ tree: TreeNode }>('/api/admin/mlm/tree', {
        method: 'POST',
        body: JSON.stringify({
          action: 'move',
          node_id: selected.node_id,
          new_parent_node_id: targetParentId,
          position: targetPosition,
        }),
      })
      if (res.data?.tree) setTree(res.data.tree)
      setMessage(`✓ ${selected.username} movido com sucesso`)
      setSelected(null)
      await loadTree()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao mover')
    } finally {
      setMoving(false)
    }
  }

  const slotOptions = slots.flatMap((s) => {
    const opts: { id: string; label: string; position: 'left' | 'right' }[] = []
    if (s.open_left) {
      opts.push({
        id: `${s.node_id}:left`,
        label: `${s.username ?? s.node_id.slice(0, 8)} ← Esquerda`,
        position: 'left',
      })
    }
    if (s.open_right) {
      opts.push({
        id: `${s.node_id}:right`,
        label: `${s.username ?? s.node_id.slice(0, 8)} → Direita`,
        position: 'right',
      })
    }
    return opts
  })

  const selectedSlot = slotOptions.find((o) => o.id === `${targetParentId}:${targetPosition}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            <Network className="w-5 h-5 text-[#D2A63C]" />
            Árvore Binária MLM
          </h3>
          <p className="text-gray-500 text-sm mt-0.5">
            Raiz: <span className="text-[#D2A63C]">MoreThanMoney</span> · distribuição equilibrada esq/dir
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTree()}
            disabled={loading}
            className="border-gray-700 text-gray-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={bootstrap}
            disabled={bootstrapping}
            className="bg-[#D2A63C] text-black hover:bg-[#c49530]"
          >
            {bootstrapping ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Users className="w-3.5 h-3.5 mr-1" />
            )}
            Inicializar todos sob MTM
          </Button>
        </div>
      </div>

      {message && (
        <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2">
          {message}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[420px] max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
            </div>
          ) : tree ? (
            <TreeNodeRow
              node={tree}
              depth={0}
              selectedId={selected?.node_id ?? null}
              onSelect={setSelected}
              defaultOpen
            />
          ) : (
            <div className="text-center py-16 text-gray-500">
              <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Árvore vazia.</p>
              <p className="text-sm mt-1">Clica em &ldquo;Inicializar todos sob MTM&rdquo; para começar.</p>
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <h4 className="text-white font-medium flex items-center gap-2">
            <MoveRight className="w-4 h-4 text-[#D2A63C]" />
            Reposicionar membro
          </h4>
          <p className="text-gray-500 text-xs">
            Selecciona um nó folha na árvore e escolhe o novo pai (slot livre). Só nós sem filhos podem ser movidos.
          </p>

          <div className="rounded-lg bg-gray-800/50 p-3 text-sm">
            <span className="text-gray-500">Seleccionado:</span>
            <p className="text-white font-medium mt-1">
              {selected ? (
                <>
                  {selected.username}
                  {!selected.left_child_id && !selected.right_child_id ? (
                    <span className="text-emerald-400 text-xs ml-2">(folha)</span>
                  ) : (
                    <span className="text-amber-400 text-xs ml-2">(tem filhos — não movível)</span>
                  )}
                </>
              ) : (
                <span className="text-gray-600">Nenhum</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400">Destino (slot livre)</label>
            <Select
              value={selectedSlot?.id ?? ''}
              onValueChange={(v) => {
                const [parentId, pos] = v.split(':')
                setTargetParentId(parentId)
                setTargetPosition(pos as 'left' | 'right')
              }}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Escolher posição..." />
              </SelectTrigger>
              <SelectContent>
                {slotOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full bg-[#D2A63C] text-black hover:bg-[#c49530]"
            disabled={
              moving ||
              !selected ||
              !targetParentId ||
              !!(selected.left_child_id || selected.right_child_id)
            }
            onClick={moveNode}
          >
            {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mover na árvore'}
          </Button>
        </div>
      </div>
    </div>
  )
}
