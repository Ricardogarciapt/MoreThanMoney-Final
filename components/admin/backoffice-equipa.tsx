'use client'

/**
 * EQUIPA & ACESSOS — o painel onde o Ricardo dá papéis, monta as equipas, escolhe o plano de
 * comissão de cada pessoa, mexe nas percentagens e decide o que cada um vê no site.
 *
 * Componente novo em vez de mais um separador dentro do `mlm-manager.tsx` (1259 linhas): o MLM
 * binário que já PAGA hoje não se toca. O que se acrescenta fica ao lado, e uma avaria aqui não põe
 * em causa a árvore nem as comissões que já correm.
 *
 * TUDO O QUE É «quem é da equipa e quanto recebe» VIVE AQUI, em separadores deste mesmo painel — e
 * não em ecrãs novos espalhados pelo admin. Dois sítios para a mesma definição é como se perde uma
 * definição: muda-se num, lê-se do outro, e ninguém percebe porque é que não fez efeito.
 *
 * Nada aqui é uma fechadura. Todas as operações passam por `/api/admin/backoffice/*`, que exigem
 * admin do lado do servidor — esconder um botão nunca protegeu nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import { PAPEIS, PAPEL_NOME, type Papel } from '@/lib/backoffice-papeis'
import { AREAS_SITE, AREA_NOME, type AreaSite } from '@/lib/backoffice-acessos-site'
import BackofficeEquipasMontar, { type CandidatoLider } from '@/components/admin/backoffice-equipas-montar'
import BackofficePlanosComissao from '@/components/admin/backoffice-planos-comissao'
import BackofficeRegrasComissao from '@/components/admin/backoffice-regras-comissao'
import { Loader2, Percent, ShieldCheck, UserPlus, Users, UserCog, Wallet, X } from 'lucide-react'

/** Os separadores do painel. O primeiro é o de sempre, para quem já conhece o ecrã não se perder. */
const ABAS = [
  { id: 'papeis', label: 'Papéis & Acessos', icon: UserCog },
  { id: 'equipas', label: 'Equipas', icon: Users },
  { id: 'planos', label: 'Planos por pessoa', icon: Wallet },
  { id: 'percentagens', label: 'Percentagens', icon: Percent },
] as const
type Aba = (typeof ABAS)[number]['id']

interface PapelLinha {
  id: string
  papel: Papel
  rank_key: string | null
  atribuido_at: string | null
  retirado_at: string | null
}

interface Pessoa {
  user_id: string
  email: string | null
  username: string | null
  full_name: string | null
  user_type: string | null
  is_active: boolean
  so_backoffice: boolean
  areas_restritas: AreaSite[]
  papeis: PapelLinha[]
}

export default function BackofficeEquipa() {
  const [aba, setAba] = useState<Aba>('papeis')
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pesquisa, setPesquisa] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Criar de raiz
  const [novoAberto, setNovoAberto] = useState(false)
  const [novoEmail, setNovoEmail] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoPapeis, setNovoPapeis] = useState<Papel[]>(['afiliado'])
  const [linkPassword, setLinkPassword] = useState<string | null>(null)

  // Dar papel a quem já tem conta
  const [alvoEmail, setAlvoEmail] = useState('')
  const [alvoPapel, setAlvoPapel] = useState<Papel>('afiliado')

  const carregar = useCallback(async () => {
    setACarregar(true)
    const res = await adminApiCall<{ pessoas: Pessoa[] }>('/api/admin/backoffice/papeis')
    if (res.data?.pessoas) {
      setPessoas(res.data.pessoas)
      setErro(null)
    } else {
      // O erro aparece. Uma lista vazia por falha de leitura é indistinguível de «não há ninguém na
      // equipa», e foi assim que se perdeu uma tarde nos Alertas de Trading.
      setErro(res.error || 'Não foi possível ler a equipa')
    }
    setACarregar(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const darPapel = async (userId: string, papel: Papel) => {
    setOcupado(userId + papel)
    const res = await adminApiCall<{ success: boolean }>('/api/admin/backoffice/papeis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, papel }),
    })
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou ao atribuir')
    else await carregar()
  }

  const tirarPapel = async (linha: PapelLinha, nome: string) => {
    // Confirmação antes de tirar: tirar um papel tira o acesso ao dinheiro, e um clique distraído
    // numa lista comprida não pode ter esse efeito.
    if (!confirm(`Tirar o papel de ${PAPEL_NOME[linha.papel]} a ${nome}?\n\nO acesso fecha logo. O histórico fica na base.`)) {
      return
    }
    setOcupado(linha.id)
    const res = await adminApiCall<{ success: boolean }>(`/api/admin/backoffice/papeis?id=${encodeURIComponent(linha.id)}`, {
      method: 'DELETE',
    })
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou ao retirar')
    else await carregar()
  }

  const guardarAreas = async (userId: string, areas: AreaSite[]) => {
    setOcupado(userId + 'areas')
    const res = await adminApiCall<{ success: boolean }>('/api/admin/backoffice/acessos-site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, areas }),
    })
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou ao guardar acessos')
    else await carregar()
  }

  const criarDeRaiz = async () => {
    setOcupado('novo')
    setLinkPassword(null)
    const res = await adminApiCall<{ success: boolean; link_password: string | null; aviso_link: string | null }>(
      '/api/admin/backoffice/afiliado',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: novoEmail, full_name: novoNome, papeis: novoPapeis }),
      },
    )
    setOcupado(null)
    if (!res.success) {
      setErro(res.error || 'Falhou ao criar')
      return
    }
    setLinkPassword(res.data?.link_password ?? null)
    setAviso(res.data?.aviso_link ?? null)
    setNovoEmail('')
    setNovoNome('')
    await carregar()
  }

  const darPapelPorEmail = async () => {
    setOcupado('por-email')
    // Procura-se pela lista já carregada primeiro e, se não estiver lá, pede-se ao servidor: quem
    // ainda não tem papéis não aparece nesta lista, e é justamente essa a pessoa a quem se quer dar
    // o primeiro papel.
    const naLista = pessoas.find((p) => p.email?.toLowerCase() === alvoEmail.trim().toLowerCase())
    if (naLista) {
      await darPapel(naLista.user_id, alvoPapel)
      setOcupado(null)
      setAlvoEmail('')
      return
    }
    // `q` e `data` são os nomes que a rota `/api/admin/users` usa — confirmados, não adivinhados: um
    // nome de campo inventado devolvia «sem conta» a pessoas que existem, e a culpa parecia ser da
    // pesquisa e não deste código.
    const res = await adminApiCall<{ data?: Array<{ id: string; email: string | null }> }>(
      `/api/admin/users?q=${encodeURIComponent(alvoEmail.trim())}&limit=20`,
    )
    const achado = res.data?.data?.find((u) => u.email?.toLowerCase() === alvoEmail.trim().toLowerCase())
    setOcupado(null)
    if (!achado) {
      setErro(`Sem conta para ${alvoEmail.trim()}. Se ainda não é membro, cria-o de raiz aqui ao lado.`)
      return
    }
    setAlvoEmail('')
    await darPapel(achado.id, alvoPapel)
  }

  const filtradas = pessoas.filter((p) => {
    if (!pesquisa) return true
    const q = pesquisa.toLowerCase()
    return [p.email, p.username, p.full_name].some((v) => v?.toLowerCase().includes(q))
  })

  /**
   * Quem pode ser líder de equipa, e quem pode receber um plano de comissão: a mesma lista de
   * pessoas COM PAPÉIS que este painel já carregou. Reaproveitá-la em vez de cada separador ir
   * buscar a sua garante que o Ricardo vê os mesmos nomes em todos — e evita a pergunta «porque é
   * que ela aparece num sítio e não no outro».
   */
  const candidatos = useMemo<CandidatoLider[]>(
    () =>
      pessoas.map((p) => ({
        user_id: p.user_id,
        nome: p.full_name || p.username || p.email || p.user_id.slice(0, 8),
        email: p.email,
        tem_papel_lider: p.papeis.some((l) => l.papel === 'team_leader' && !l.retirado_at),
      })),
    [pessoas],
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-white">Equipa &amp; Acessos</h2>
        <span className="rounded-full border border-[#D2A63C]/30 px-2 py-0.5 text-xs text-[#D2A63C]">
          {pessoas.length} pessoa(s) com papéis
        </span>
      </div>

      {/* Os separadores. Tudo o que é «quem é da equipa e quanto recebe» está aqui dentro. */}
      <div className="flex flex-wrap gap-1 border-b border-gray-800">
        {ABAS.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={
                aba === a.id
                  ? 'flex items-center gap-2 border-b-2 border-[#D2A63C] px-3 py-2 text-sm font-medium text-[#D2A63C]'
                  : 'flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-gray-400 hover:text-white'
              }
            >
              <Icon className="h-4 w-4" />
              {a.label}
            </button>
          )
        })}
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

      {aba === 'equipas' && <BackofficeEquipasMontar candidatos={candidatos} />}
      {aba === 'planos' && <BackofficePlanosComissao candidatos={candidatos} />}
      {aba === 'percentagens' && <BackofficeRegrasComissao />}

      {aba === 'papeis' && (
        <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Procurar por nome ou email"
          className="w-64 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white placeholder:text-gray-600"
        />
        <button
          type="button"
          onClick={() => setNovoAberto((v) => !v)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#D2A63C]/15 px-3 py-1.5 text-sm text-[#D2A63C] ring-1 ring-[#D2A63C]/30"
        >
          <UserPlus className="h-4 w-4" />
          Criar afiliado de raiz
        </button>
      </div>

      {novoAberto && (
        <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <p className="text-sm text-gray-400">
            Cria um <strong className="text-gray-200">login só para o backoffice</strong>. Não é cliente: não abre a
            área de membro, nem os sinais, nem a app. Se um dia pagar um pack, o acesso ao produto vem daí — não daqui.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome completo"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
            />
            <input
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              placeholder="email@exemplo.pt"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {PAPEIS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setNovoPapeis((atual) => (atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p]))
                }
                className={
                  novoPapeis.includes(p)
                    ? 'rounded-full bg-[#D2A63C]/20 px-3 py-1 text-xs text-[#D2A63C] ring-1 ring-[#D2A63C]/40'
                    : 'rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400'
                }
              >
                {PAPEL_NOME[p]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={ocupado === 'novo' || !novoEmail || !novoNome || novoPapeis.length === 0}
            onClick={() => void criarDeRaiz()}
            className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
          >
            {ocupado === 'novo' ? 'A criar…' : 'Criar conta'}
          </button>
          {linkPassword && (
            <div className="space-y-1 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-xs text-green-200">
              <p>Conta criada. Entrega este link à pessoa para ela definir a password:</p>
              {/* Mostra-se em vez de enviar: enviar um email é outra decisão, com outro texto e outro
                  remetente, e não se toma dentro do botão de criar contas. */}
              <code className="block break-all text-green-300">{linkPassword}</code>
            </div>
          )}
        </div>
      )}

      {/* Dar papel a quem já é membro — o caso mais comum. */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900/20 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
            Dar papel a um membro que já existe
          </label>
          <input
            value={alvoEmail}
            onChange={(e) => setAlvoEmail(e.target.value)}
            placeholder="email do membro"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
        </div>
        <select
          value={alvoPapel}
          onChange={(e) => setAlvoPapel(e.target.value as Papel)}
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
        >
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEL_NOME[p]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!alvoEmail || ocupado === 'por-email'}
          onClick={() => void darPapelPorEmail()}
          className="rounded-lg bg-[#D2A63C]/15 px-4 py-2 text-sm text-[#D2A63C] ring-1 ring-[#D2A63C]/30 disabled:opacity-40"
        >
          {ocupado === 'por-email' ? 'A atribuir…' : 'Atribuir'}
        </button>
      </div>

      {aCarregar ? (
        <div className="flex items-center gap-2 p-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> A ler a equipa…
        </div>
      ) : filtradas.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          {pesquisa ? 'Ninguém com esse nome.' : 'Ainda não há ninguém com papéis atribuídos.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtradas.map((p) => (
            <div key={p.user_id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{p.full_name || p.username || p.email}</span>
                <span className="text-xs text-gray-500">{p.email}</span>
                {p.so_backoffice && (
                  <span className="rounded-full border border-blue-500/40 px-2 py-0.5 text-[10px] text-blue-300">
                    só backoffice
                  </span>
                )}
                {!p.is_active && !p.so_backoffice && (
                  <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-300">
                    conta de site inactiva
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {p.papeis.map((linha) => (
                  <span
                    key={linha.id}
                    className="flex items-center gap-1.5 rounded-full bg-[#D2A63C]/15 px-2.5 py-1 text-xs text-[#D2A63C] ring-1 ring-[#D2A63C]/30"
                  >
                    {PAPEL_NOME[linha.papel]}
                    {linha.rank_key && <span className="text-[10px] opacity-70">· {linha.rank_key}</span>}
                    <button
                      type="button"
                      disabled={ocupado === linha.id}
                      onClick={() => void tirarPapel(linha, p.full_name || p.email || 'esta pessoa')}
                      title="Tirar este papel"
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {PAPEIS.filter((x) => !p.papeis.some((l) => l.papel === x)).map((x) => (
                  <button
                    key={x}
                    type="button"
                    disabled={ocupado === p.user_id + x}
                    onClick={() => void darPapel(p.user_id, x)}
                    className="rounded-full border border-dashed border-gray-700 px-2.5 py-1 text-xs text-gray-500 hover:border-[#D2A63C]/40 hover:text-[#D2A63C]"
                  >
                    + {PAPEL_NOME[x]}
                  </button>
                ))}
              </div>

              {/* Acessos ao SITE. O texto diz a verdade: isto aperta, não abre. */}
              <div className="mt-4 border-t border-gray-800 pt-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Partes do site
                  <span className="text-gray-600">
                    {p.areas_restritas.length === 0
                      ? '— sem restrição (vale o acesso normal de membro)'
                      : '— limitado às escolhidas'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AREAS_SITE.map((a) => {
                    const ligada = p.areas_restritas.length === 0 || p.areas_restritas.includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        disabled={ocupado === p.user_id + 'areas'}
                        onClick={() => {
                          // Primeiro clique numa lista «sem restrição» passa a lista a só essa área:
                          // é o que se quer dizer ao desligar uma área a quem tinha tudo.
                          const base = p.areas_restritas.length === 0 ? [...AREAS_SITE] : p.areas_restritas
                          const nova = base.includes(a) ? base.filter((x) => x !== a) : [...base, a]
                          // Todas ligadas = sem restrição, e guarda-se vazio: é a mesma coisa, e a
                          // lista vazia é o estado normal, sem linha a explicar na base.
                          void guardarAreas(p.user_id, nova.length === AREAS_SITE.length ? [] : nova)
                        }}
                        className={
                          ligada
                            ? 'rounded-full bg-green-500/15 px-2.5 py-1 text-xs text-green-300 ring-1 ring-green-500/30'
                            : 'rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-600 line-through'
                        }
                      >
                        {AREA_NOME[a]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
