'use client'

/**
 * PERCENTAGENS DE COMISSÃO — mudá-las sem deploy, com o passado à vista.
 *
 * A tabela é imutável com vigência: gravar uma percentagem FECHA a que estava em vigor e abre outra.
 * Este ecrã mostra as duas coisas ao mesmo tempo — o que vale hoje e o que valeu antes — porque é
 * essa a única forma de mudar um número com consciência do que ele já pagou.
 *
 * A FRASE QUE O ECRÃ TEM DE DIZER, e diz: mudar hoje NÃO reescreve o que foi calculado ontem. Sem
 * ela, o Ricardo tem de escolher entre acreditar e ir ver a base.
 */

import { useCallback, useEffect, useState } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import { PAPEL_NOME, type Papel } from '@/lib/backoffice-papeis'
import { History, Loader2, Percent, X } from 'lucide-react'

interface Regra {
  id: string
  plano: string
  papel: Papel
  pack: string
  pct: number
  aplica_a: 'primeira' | 'renovacao' | 'ambos'
  valido_de: string
  valido_ate: string | null
  nota: string | null
}

const APLICA_NOME: Record<Regra['aplica_a'], string> = {
  primeira: '1.ª compra',
  renovacao: 'renovações',
  ambos: 'primeira e renovações',
}

/**
 * Os packs que existem hoje na escada, mais o `*`. É uma sugestão e não uma prisão: o campo aceita
 * escrito à mão, porque o dono pode querer a regra de um pack que ainda vai criar e recusar-lha aqui
 * era mandá-lo esperar por um deploy (é também a razão pela qual a rota não valida o pack).
 */
const PACKS_CONHECIDOS = [
  '*',
  'app_member_monthly',
  'app_member_annual',
  'premium_monthly',
  'premium_annual',
  'elite_annual',
  'mtm_scanner_monthly',
  'scanners_monthly',
  'scanners_semestral',
]

const PAPEIS_ORDEM: Papel[] = ['afiliado', 'setter', 'closer', 'prospector', 'team_leader']

function dia(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT')
}

export default function BackofficeRegrasComissao() {
  const [emVigor, setEmVigor] = useState<Regra[]>([])
  const [historico, setHistorico] = useState<Regra[]>([])
  const [planos, setPlanos] = useState<string[]>(['padrao'])
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [verHistorico, setVerHistorico] = useState(false)
  const [planoVisto, setPlanoVisto] = useState('padrao')

  // O formulário
  const [fPapel, setFPapel] = useState<Papel>('afiliado')
  const [fPack, setFPack] = useState('*')
  const [fPct, setFPct] = useState('')
  const [fAplica, setFAplica] = useState<Regra['aplica_a']>('ambos')
  const [fNota, setFNota] = useState('')

  const carregar = useCallback(async () => {
    setACarregar(true)
    const res = await adminApiCall<{ em_vigor: Regra[]; historico: Regra[]; planos: string[] }>(
      '/api/admin/backoffice/regras',
    )
    if (res.data?.em_vigor) {
      setEmVigor(res.data.em_vigor)
      setHistorico(res.data.historico || [])
      setPlanos(res.data.planos?.length ? res.data.planos : ['padrao'])
      setErro(null)
    } else {
      setErro(res.error || 'Não foi possível ler as regras')
    }
    setACarregar(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const gravar = async () => {
    const pct = Number(fPct.replace(',', '.'))
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setErro('A percentagem tem de ser um número entre 0 e 100.')
      return
    }
    const anterior = emVigor.find(
      (r) => r.plano === planoVisto && r.papel === fPapel && r.pack === fPack && r.aplica_a === fAplica,
    )
    if (
      anterior &&
      !confirm(
        `Mudar ${PAPEL_NOME[fPapel]} · ${fPack} · ${APLICA_NOME[fAplica]} de ${anterior.pct}% para ${pct}%?\n\nA regra de ${anterior.pct}% fica fechada com a data de hoje e continua a explicar as comissões já calculadas. As vendas novas passam a usar ${pct}%.`,
      )
    ) {
      return
    }

    setOcupado('gravar')
    setAviso(null)
    const res = await adminApiCall<{ success: boolean; substituiu: string | null }>('/api/admin/backoffice/regras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plano: planoVisto,
        papel: fPapel,
        pack: fPack,
        pct,
        aplica_a: fAplica,
        nota: fNota.trim() || null,
      }),
    })
    setOcupado(null)
    if (!res.success) {
      setErro(res.error || 'Falhou ao gravar')
      return
    }
    setAviso(
      res.data?.substituiu
        ? 'Gravado. A regra anterior ficou fechada com a data de hoje — as comissões já calculadas continuam a apontar para ela.'
        : 'Gravado. É a primeira regra para este caso.',
    )
    setFPct('')
    setFNota('')
    await carregar()
  }

  const revogar = async (r: Regra) => {
    if (
      !confirm(
        `Revogar ${PAPEL_NOME[r.papel]} · ${r.pack} · ${APLICA_NOME[r.aplica_a]} (${r.pct}%)?\n\nA partir de agora este caso deixa de pagar. As comissões já calculadas não mudam.`,
      )
    ) {
      return
    }
    setOcupado(r.id)
    const res = await adminApiCall<{ success: boolean }>(
      `/api/admin/backoffice/regras?id=${encodeURIComponent(r.id)}`,
      { method: 'DELETE' },
    )
    setOcupado(null)
    if (!res.success) setErro(res.error || 'Falhou a revogação')
    else await carregar()
  }

  const doPlano = emVigor.filter((r) => r.plano === planoVisto)
  const histDoPlano = historico.filter((r) => r.plano === planoVisto)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4 text-sm text-gray-300">
        <p className="mb-1 font-semibold text-[#D2A63C]">Mudar hoje não reescreve o que foi calculado ontem.</p>
        <p>
          Cada gravação <strong className="text-gray-100">fecha</strong> a percentagem anterior com a data de hoje e abre
          uma nova. As comissões já feitas continuam a apontar para a regra com que foram feitas — é isso que permite
          responder, um ano depois, a «porque é que recebi 39 € e não 45 €».
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
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">{aviso}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs uppercase tracking-wide text-gray-500">Plano</label>
        <select
          value={planoVisto}
          onChange={(e) => setPlanoVisto(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
        >
          {planos.map((p) => (
            <option key={p} value={p}>
              {p === 'padrao' ? 'Tabela geral (padrão)' : p}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-600">
          {planoVisto === 'padrao'
            ? 'Vale para quem não tem plano próprio.'
            : 'Vale só para quem estiver neste plano no separador «Planos por pessoa».'}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={verHistorico} onChange={(e) => setVerHistorico(e.target.checked)} />
          Ver o histórico ({histDoPlano.length})
        </label>
      </div>

      {/* Definir / mudar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900/30 p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Papel</label>
          <select
            value={fPapel}
            onChange={(e) => setFPapel(e.target.value as Papel)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          >
            {PAPEIS_ORDEM.map((p) => (
              <option key={p} value={p}>
                {PAPEL_NOME[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Pack</label>
          <input
            list="packs-conhecidos"
            value={fPack}
            onChange={(e) => setFPack(e.target.value)}
            className="w-52 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          />
          <datalist id="packs-conhecidos">
            {PACKS_CONHECIDOS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Aplica a</label>
          <select
            value={fAplica}
            onChange={(e) => setFAplica(e.target.value as Regra['aplica_a'])}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          >
            {(['primeira', 'renovacao', 'ambos'] as const).map((a) => (
              <option key={a} value={a}>
                {APLICA_NOME[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">%</label>
          <input
            value={fPct}
            onChange={(e) => setFPct(e.target.value)}
            placeholder="30"
            inputMode="decimal"
            className="w-20 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Porquê</label>
          <input
            value={fNota}
            onChange={(e) => setFNota(e.target.value)}
            placeholder="ex: margem do Premium não fecha a 30 %"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
        </div>
        <button
          type="button"
          disabled={!fPct || ocupado === 'gravar'}
          onClick={() => void gravar()}
          className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
        >
          {ocupado === 'gravar' ? 'A gravar…' : 'Gravar percentagem'}
        </button>
      </div>

      {aCarregar ? (
        <div className="flex items-center gap-2 p-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> A ler as regras…
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60">
                <tr>
                  {['Papel', 'Pack', 'Aplica a', '%', 'Em vigor desde', 'Porquê', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doPlano.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      Sem regras em vigor neste plano. Até haver, este papel não paga nada — e é isso que o cálculo faz.
                    </td>
                  </tr>
                )}
                {doPlano
                  .slice()
                  .sort(
                    (a, b) =>
                      PAPEIS_ORDEM.indexOf(a.papel) - PAPEIS_ORDEM.indexOf(b.papel) || a.pack.localeCompare(b.pack),
                  )
                  .map((r) => (
                    <tr key={r.id} className="border-t border-gray-800/60">
                      <td className="px-4 py-2.5 text-white">{PAPEL_NOME[r.papel]}</td>
                      <td className="px-4 py-2.5 text-gray-300">
                        {r.pack === '*' ? <span className="text-gray-500">todos os packs</span> : r.pack}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{APLICA_NOME[r.aplica_a]}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex w-fit items-center gap-1 font-semibold text-[#D2A63C]">
                          {r.pct}
                          <Percent className="h-3 w-3" />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{dia(r.valido_de)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.nota || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={ocupado === r.id}
                          onClick={() => void revogar(r)}
                          className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:border-red-500/40 hover:text-red-300"
                        >
                          Revogar
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {verHistorico && (
            <div className="overflow-hidden rounded-xl border border-gray-800/60">
              <div className="flex items-center gap-2 bg-gray-900/40 px-4 py-2.5 text-xs text-gray-400">
                <History className="h-3.5 w-3.5" />
                O que já valeu — e continua a explicar as comissões desse período. Não se apaga.
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {histDoPlano.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-gray-600">
                        Sem histórico: nenhuma percentagem deste plano foi mudada ainda.
                      </td>
                    </tr>
                  )}
                  {histDoPlano.map((r) => (
                    <tr key={r.id} className="border-t border-gray-800/40 text-gray-500">
                      <td className="px-4 py-2 text-xs">{PAPEL_NOME[r.papel]}</td>
                      <td className="px-4 py-2 text-xs">{r.pack === '*' ? 'todos' : r.pack}</td>
                      <td className="px-4 py-2 text-xs">{APLICA_NOME[r.aplica_a]}</td>
                      <td className="px-4 py-2 text-xs line-through">{r.pct}%</td>
                      <td className="px-4 py-2 text-xs">
                        {dia(r.valido_de)} → {dia(r.valido_ate)}
                      </td>
                      <td className="px-4 py-2 text-xs">{r.nota || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
