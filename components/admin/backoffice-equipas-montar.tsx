'use client'

/**
 * MONTAR AS EQUIPAS — quem lidera quem.
 *
 * Este ecrã dá acesso a dinheiro. Cada pessoa que entra numa equipa passa a ser visível ao líder
 * dela: extracto, leads, pipeline e tarefas. Por isso o ecrã diz sempre o que está a fazer, em
 * português, antes de o fazer — e pede confirmação nas duas operações que mexem em acessos de
 * terceiros (mover alguém de equipa, e arquivar uma equipa).
 *
 * Nada aqui é uma fechadura: tudo passa por `/api/admin/backoffice/equipas*`, que exigem admin do
 * lado do servidor. Esconder um botão nunca protegeu nada.
 */

import { useCallback, useEffect, useState } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import { PAPEL_NOME } from '@/lib/backoffice-papeis'
import { Archive, Loader2, Plus, RotateCcw, UserMinus, Users, X } from 'lucide-react'

interface PessoaRef {
  user_id: string
  email: string | null
  username: string | null
  full_name: string | null
}

interface MembroRef {
  id: string
  desde: string | null
  ate: string | null
  nota: string | null
  pessoa: PessoaRef
}

interface Equipa {
  id: string
  nome: string
  lider: PessoaRef
  criada_em: string | null
  arquivada_em: string | null
  nota: string | null
  membros: MembroRef[]
}

/** Quem pode ser líder — o painel mostra-os primeiro, mas não recusa os outros (ver a rota). */
export interface CandidatoLider {
  user_id: string
  nome: string
  email: string | null
  tem_papel_lider: boolean
}

function nomeDe(p: PessoaRef | null | undefined): string {
  if (!p) return '(sem nome)'
  return p.full_name || p.username || p.email || p.user_id.slice(0, 8)
}

export default function BackofficeEquipasMontar({ candidatos }: { candidatos: CandidatoLider[] }) {
  const [equipas, setEquipas] = useState<Equipa[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [verHistorico, setVerHistorico] = useState(false)

  // Criar equipa
  const [novoNome, setNovoNome] = useState('')
  const [novoLider, setNovoLider] = useState('')

  // Acrescentar membro (por equipa)
  const [alvoEquipa, setAlvoEquipa] = useState<string | null>(null)
  const [alvoEmail, setAlvoEmail] = useState('')

  const carregar = useCallback(async () => {
    setACarregar(true)
    const res = await adminApiCall<{ equipas: Equipa[] }>(
      `/api/admin/backoffice/equipas${verHistorico ? '?historico=1' : ''}`,
    )
    if (res.data?.equipas) {
      setEquipas(res.data.equipas)
      setErro(null)
    } else {
      // Uma lista vazia por falha de leitura é indistinguível de «não há equipas». O erro aparece.
      setErro(res.error || 'Não foi possível ler as equipas')
    }
    setACarregar(false)
  }, [verHistorico])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const criarEquipa = async () => {
    setOcupado('nova')
    const res = await adminApiCall<{ success: boolean }>('/api/admin/backoffice/equipas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome.trim(), lider_id: novoLider }),
    })
    setOcupado(null)
    if (!res.success) {
      setErro(res.error || 'Falhou ao criar a equipa')
      return
    }
    setNovoNome('')
    setNovoLider('')
    await carregar()
  }

  /**
   * Acrescentar uma pessoa. O primeiro pedido vai sem `mover`: se ela já estiver noutra equipa, a
   * rota recusa com `precisa_mover` e só então se pergunta. Tirar uma pessoa a um líder sem ele
   * saber é exactamente o engano que esta ida e volta evita.
   */
  const acrescentar = async (equipaId: string) => {
    const email = alvoEmail.trim()
    if (!email) return
    setOcupado(equipaId + 'add')

    const busca = await adminApiCall<{ data?: Array<{ id: string; email: string | null }> }>(
      `/api/admin/users?q=${encodeURIComponent(email)}&limit=20`,
    )
    const achado = busca.data?.data?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!achado) {
      setOcupado(null)
      setErro(`Sem conta para ${email}. Só quem já tem conta pode entrar numa equipa.`)
      return
    }

    const tentar = async (mover: boolean) =>
      adminApiCall<{ success: boolean; precisa_mover?: boolean }>('/api/admin/backoffice/equipas/membros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipa_id: equipaId, membro_id: achado.id, mover }),
      })

    let res = await tentar(false)
    if (!res.success && res.data?.precisa_mover) {
      const ok = confirm(
        `${email} já está noutra equipa.\n\n${res.error}\n\nMover para esta equipa? O líder anterior deixa de ver o dinheiro dela.`,
      )
      if (!ok) {
        setOcupado(null)
        return
      }
      res = await tentar(true)
    }

    setOcupado(null)
    if (!res.success) {
      setErro(res.error || 'Falhou ao acrescentar')
      return
    }
    setAlvoEmail('')
    setAlvoEquipa(null)
    await carregar()
  }

  const retirar = async (membro: MembroRef, equipaNome: string) => {
    if (
      !confirm(
        `Tirar ${nomeDe(membro.pessoa)} da equipa "${equipaNome}"?\n\nO líder deixa de ver o extracto, as leads e as tarefas dela a partir de agora. O histórico fica na base.`,
      )
    ) {
      return
    }
    setOcupado(membro.id)
    const res = await adminApiCall<{ success: boolean }>(
      `/api/admin/backoffice/equipas/membros?id=${encodeURIComponent(membro.id)}`,
      { method: 'DELETE' },
    )
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou ao retirar')
    else await carregar()
  }

  const arquivar = async (equipa: Equipa, arquivar: boolean) => {
    const pergunta = arquivar
      ? `Arquivar a equipa "${equipa.nome}"?\n\n${nomeDe(equipa.lider)} deixa de ver os ${equipa.membros.length} membro(s) imediatamente. A composição fica guardada — se reabrires, volta como está.`
      : `Reabrir a equipa "${equipa.nome}"?\n\n${nomeDe(equipa.lider)} volta a ver os membros que ela tinha.`
    if (!confirm(pergunta)) return

    setOcupado(equipa.id)
    const res = await adminApiCall<{ success: boolean }>('/api/admin/backoffice/equipas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: equipa.id, arquivar }),
    })
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou')
    else await carregar()
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4 text-sm text-gray-300">
        <p className="mb-1 font-semibold text-[#D2A63C]">Isto dá acesso a dinheiro.</p>
        <p>
          Quem está numa equipa fica visível ao líder dela: extracto, contactos, pipeline e tarefas. Quem não estiver em
          nenhuma equipa <strong className="text-gray-100">só se vê a si</strong> — é o estado normal e é o estado seguro.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Um líder vê os membros <strong>directos</strong> da equipa dele. Se um membro liderar outra equipa, os membros
          dessa <strong>não</strong> sobem — para juntar equipas em cadeia é preciso decidi-lo primeiro.
        </p>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => setErro(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Criar equipa */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900/30 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Nome da equipa</label>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="ex: Closers PT"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Líder</label>
          <select
            value={novoLider}
            onChange={(e) => setNovoLider(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          >
            <option value="">— escolher —</option>
            {/* Quem já tem o papel primeiro: é o caso certo, e aparecer no topo evita escolher o
                homónimo que não tem o papel e depois não entender porque é que não vê nada. */}
            {candidatos
              .slice()
              .sort((a, b) => Number(b.tem_papel_lider) - Number(a.tem_papel_lider) || a.nome.localeCompare(b.nome))
              .map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.nome}
                  {c.tem_papel_lider ? ` · ${PAPEL_NOME.team_leader}` : ' · sem o papel'}
                </option>
              ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!novoNome.trim() || !novoLider || ocupado === 'nova'}
          onClick={() => void criarEquipa()}
          className="flex items-center gap-2 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {ocupado === 'nova' ? 'A criar…' : 'Criar equipa'}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={verHistorico} onChange={(e) => setVerHistorico(e.target.checked)} />
          Ver arquivadas e quem já saiu
        </label>
      </div>

      {novoLider && !candidatos.find((c) => c.user_id === novoLider)?.tem_papel_lider && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Esta pessoa não tem o papel de <strong>Team Leader</strong>. A equipa fica criada, mas ela não vê os membros
          até lhe dares o papel no separador «Papéis &amp; Acessos» — o papel é que manda, a equipa só diz quem.
        </p>
      )}

      {aCarregar ? (
        <div className="flex items-center gap-2 p-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> A ler as equipas…
        </div>
      ) : equipas.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          Ainda não há equipas. Até haver, cada pessoa da equipa de vendas só se vê a si.
        </p>
      ) : (
        <div className="space-y-3">
          {equipas.map((eq) => (
            <div
              key={eq.id}
              className={
                eq.arquivada_em
                  ? 'rounded-xl border border-gray-800 bg-gray-900/20 p-4 opacity-60'
                  : 'rounded-xl border border-gray-800 bg-gray-900/40 p-4'
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Users className="h-4 w-4 text-[#D2A63C]" />
                <span className="font-semibold text-white">{eq.nome}</span>
                <span className="text-xs text-gray-500">
                  líder: <span className="text-gray-300">{nomeDe(eq.lider)}</span>
                </span>
                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                  {eq.membros.filter((m) => !m.ate).length} activo(s)
                </span>
                {eq.arquivada_em && (
                  <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-300">
                    arquivada
                  </span>
                )}
                <button
                  type="button"
                  disabled={ocupado === eq.id}
                  onClick={() => void arquivar(eq, !eq.arquivada_em)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:border-amber-500/40 hover:text-amber-300"
                >
                  {eq.arquivada_em ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                  {eq.arquivada_em ? 'Reabrir' : 'Arquivar'}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {eq.membros.length === 0 && (
                  <span className="text-xs text-gray-600">Equipa vazia — o líder só se vê a si.</span>
                )}
                {eq.membros.map((m) => (
                  <span
                    key={m.id}
                    className={
                      m.ate
                        ? 'flex items-center gap-1.5 rounded-full border border-gray-800 px-2.5 py-1 text-xs text-gray-600 line-through'
                        : 'flex items-center gap-1.5 rounded-full bg-gray-800/60 px-2.5 py-1 text-xs text-gray-200 ring-1 ring-gray-700'
                    }
                    title={m.ate ? `Saiu em ${new Date(m.ate).toLocaleDateString('pt-PT')}` : undefined}
                  >
                    {nomeDe(m.pessoa)}
                    {!m.ate && !eq.arquivada_em && (
                      <button
                        type="button"
                        disabled={ocupado === m.id}
                        onClick={() => void retirar(m, eq.nome)}
                        title="Tirar da equipa"
                        className="opacity-60 hover:opacity-100"
                      >
                        <UserMinus className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {!eq.arquivada_em && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  {alvoEquipa === eq.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        autoFocus
                        value={alvoEmail}
                        onChange={(e) => setAlvoEmail(e.target.value)}
                        placeholder="email de quem entra na equipa"
                        className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white placeholder:text-gray-600"
                      />
                      <button
                        type="button"
                        disabled={!alvoEmail.trim() || ocupado === eq.id + 'add'}
                        onClick={() => void acrescentar(eq.id)}
                        className="rounded-lg bg-[#D2A63C]/15 px-3 py-1.5 text-xs text-[#D2A63C] ring-1 ring-[#D2A63C]/30 disabled:opacity-40"
                      >
                        {ocupado === eq.id + 'add' ? 'A juntar…' : 'Juntar à equipa'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAlvoEquipa(null)
                          setAlvoEmail('')
                        }}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAlvoEquipa(eq.id)
                        setAlvoEmail('')
                      }}
                      className="rounded-full border border-dashed border-gray-700 px-2.5 py-1 text-xs text-gray-500 hover:border-[#D2A63C]/40 hover:text-[#D2A63C]"
                    >
                      + acrescentar pessoa
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
