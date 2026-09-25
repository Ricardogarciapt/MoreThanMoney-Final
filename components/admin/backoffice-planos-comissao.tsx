'use client'

/**
 * PLANOS POR PESSOA — quem mantém os 50 % antigos e quem entra na tabela nova.
 *
 * A tabela `vendas_pessoa_plano` está VAZIA de propósito. A migração 129 não pôs ninguém no plano
 * legado com um `insert ... select` sobre `mlm_nodes` porque essa tabela tem 45 linhas de origens
 * misturadas, patrocinadores que nunca trouxeram ninguém e contas duplicadas da mesma pessoa. Dar
 * 50 % vitalícios a uma linha de dados em vez de a uma pessoa não se desfaz com um `update`.
 *
 * Por isso este ecrã existe e é pessoa a pessoa, com nota. A lista é do Ricardo.
 *
 * QUEM NÃO ESTÁ AQUI está no plano geral («padrão») — não é um estado especial, é o normal, e o ecrã
 * diz isso em vez de deixar o vazio parecer uma configuração em falta.
 */

import { useCallback, useEffect, useState } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import type { CandidatoLider } from '@/components/admin/backoffice-equipas-montar'
import { Loader2, Undo2, Wallet, X } from 'lucide-react'

interface PessoaPlano {
  pessoa_id: string
  plano: string
  desde: string | null
  nota: string | null
  atualizado_em: string | null
  email: string | null
  username: string | null
  full_name: string | null
}

/**
 * Os dois planos que existem hoje, com o nome que o Ricardo usa e não a chave da base.
 *
 * A lista NÃO é fechada do lado do servidor (a rota aceita qualquer plano que tenha regras), mas é
 * fechada aqui: escrever a chave à mão num campo livre é como se cria `afiliado_legado50` sem
 * underscore e se passa uma tarde a perguntar porque é que a pessoa recebe 30 %.
 */
const PLANOS = [
  {
    chave: 'padrao',
    nome: 'Tabela nova (padrão)',
    desc: '30 % na 1.ª mensalidade + 10 % por renovação. É o que vale para quem entra de agora em diante.',
  },
  {
    chave: 'afiliado_legado_50',
    nome: 'Legado 50 %',
    desc: '50 % sobre tudo, primeira e renovações. Salvaguarda de quem já era afiliado antes de 25/09/2026.',
  },
] as const

function nomeDe(p: { full_name: string | null; username: string | null; email: string | null; pessoa_id: string }) {
  return p.full_name || p.username || p.email || p.pessoa_id.slice(0, 8)
}

export default function BackofficePlanosComissao({ candidatos }: { candidatos: CandidatoLider[] }) {
  const [linhas, setLinhas] = useState<PessoaPlano[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [alvo, setAlvo] = useState('')
  const [alvoPlano, setAlvoPlano] = useState<string>('afiliado_legado_50')
  const [alvoNota, setAlvoNota] = useState('')

  const carregar = useCallback(async () => {
    setACarregar(true)
    const res = await adminApiCall<{ pessoas: PessoaPlano[] }>('/api/admin/backoffice/planos')
    if (res.data?.pessoas) {
      setLinhas(res.data.pessoas)
      setErro(null)
    } else {
      setErro(res.error || 'Não foi possível ler os planos')
    }
    setACarregar(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const gravar = async () => {
    setOcupado('novo')
    setAviso(null)
    const res = await adminApiCall<{ success: boolean; aviso: string | null }>('/api/admin/backoffice/planos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pessoa_id: alvo, plano: alvoPlano, nota: alvoNota.trim() || null }),
    })
    setOcupado(null)
    if (!res.success) {
      setErro(res.error || 'Falhou ao gravar o plano')
      return
    }
    if (res.data?.aviso) setAviso(res.data.aviso)
    setAlvo('')
    setAlvoNota('')
    await carregar()
  }

  const voltarAoGeral = async (linha: PessoaPlano) => {
    // Tirar o plano legado corta rendimento a alguém. Isso não se faz com um clique distraído numa
    // lista comprida.
    if (
      !confirm(
        `Tirar o plano "${linha.plano}" a ${nomeDe(linha)}?\n\nPassa a ser paga pela tabela geral a partir de agora. As comissões já calculadas não mudam.`,
      )
    ) {
      return
    }
    setOcupado(linha.pessoa_id)
    const res = await adminApiCall<{ success: boolean }>(
      `/api/admin/backoffice/planos?pessoa_id=${encodeURIComponent(linha.pessoa_id)}`,
      { method: 'DELETE' },
    )
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou')
    else await carregar()
  }

  const semPlano = candidatos.filter((c) => !linhas.some((l) => l.pessoa_id === c.user_id))

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4 text-sm text-gray-300">
        <p className="mb-1 font-semibold text-[#D2A63C]">Ninguém entra no legado automaticamente.</p>
        <p>
          A lista é tua, pessoa a pessoa. Não foi semeada de <code className="text-gray-400">mlm_nodes</code> porque lá
          há patrocinadores que nunca trouxeram ninguém e contas duplicadas da mesma pessoa — e 50 % vitalícios dados por
          engano não se desfazem.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Quem não estiver nesta lista é pago pela <strong>tabela geral</strong>. É o estado normal.
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
      {aviso && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{aviso}</div>
      )}

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/30 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Pessoa</label>
            <select
              value={alvo}
              onChange={(e) => setAlvo(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              <option value="">— escolher —</option>
              {semPlano
                .slice()
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.nome}
                    {c.email ? ` · ${c.email}` : ''}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-600">
              Só aparecem pessoas com papéis atribuídos. Quem não tem papel não recebe comissão de papel — dá-lhe o papel
              primeiro no separador «Papéis &amp; Acessos».
            </p>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Plano</label>
            <select
              value={alvoPlano}
              onChange={(e) => setAlvoPlano(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              {PLANOS.map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-600">{PLANOS.find((p) => p.chave === alvoPlano)?.desc}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
              Porquê (fica gravado com o teu nome)
            </label>
            <input
              value={alvoNota}
              onChange={(e) => setAlvoNota(e.target.value)}
              placeholder="ex: afiliado desde 2025, mantém os 50 % combinados"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
            />
          </div>
          <button
            type="button"
            disabled={!alvo || ocupado === 'novo'}
            onClick={() => void gravar()}
            className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
          >
            {ocupado === 'novo' ? 'A gravar…' : 'Pôr neste plano'}
          </button>
        </div>
      </div>

      {aCarregar ? (
        <div className="flex items-center gap-2 p-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> A ler os planos…
        </div>
      ) : linhas.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          Ninguém tem plano próprio. Toda a equipa é paga pela tabela geral.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60">
              <tr>
                {['Pessoa', 'Plano', 'Desde', 'Porquê', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.pessoa_id} className="border-t border-gray-800/60">
                  <td className="px-4 py-2.5">
                    <div className="text-white">{nomeDe(l)}</div>
                    <div className="text-xs text-gray-600">{l.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex w-fit items-center gap-1.5 rounded-full bg-[#D2A63C]/15 px-2.5 py-1 text-xs text-[#D2A63C] ring-1 ring-[#D2A63C]/30">
                      <Wallet className="h-3 w-3" />
                      {PLANOS.find((p) => p.chave === l.plano)?.nome ?? l.plano}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {l.desde ? new Date(l.desde).toLocaleDateString('pt-PT') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.nota || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={ocupado === l.pessoa_id}
                      onClick={() => void voltarAoGeral(l)}
                      title="Voltar à tabela geral"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:border-red-500/40 hover:text-red-300"
                    >
                      <Undo2 className="h-3 w-3" />
                      Tabela geral
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
