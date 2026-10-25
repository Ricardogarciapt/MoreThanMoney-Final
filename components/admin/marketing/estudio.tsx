'use client'

import { useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { GERADORES, GRUPOS_ESTUDIO, type Gerador, type Variacao } from '@/lib/marketing/geradores'
import { Aviso, Chip, Painel, pedirCentro } from '@/components/admin/centro/ui'
import { Alertas, BotaoCopiar, entrada } from './comum'

type VariacaoVista = Variacao & { excessos: string[]; alertas: string[] }
type Resposta = { variacoes: VariacaoVista[]; notas: string; fornecedor?: string }

/**
 * ESTÚDIO — os geradores e optimizadores do OpenAdKit (MIT) com a marca e as regras da casa.
 * Um ecrã para todos: escolhe-se a ferramenta, preenche-se o formulário que ela pede, e as
 * variações voltam com os excessos de caracteres e os alertas da peneira. Copia-se campo a campo.
 */
export default function MarketingEstudio() {
  const [grupo, setGrupo] = useState<(typeof GRUPOS_ESTUDIO)[number]>('Meta')
  const [id, setId] = useState<string>(GERADORES.find((g) => g.grupo === 'Meta')!.id)
  const g = GERADORES.find((x) => x.id === id) as Gerador
  const [valores, setValores] = useState<Record<string, string>>({})
  const [aGerar, setAGerar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<Resposta | null>(null)

  const doGrupo = useMemo(() => GERADORES.filter((x) => x.grupo === grupo), [grupo])
  const falta = g.entradas.some((c) => c.obrigatorio && !valores[c.id]?.trim())

  const gerar = async () => {
    setAGerar(true); setErro(null); setRes(null)
    const r = await pedirCentro<Resposta>('/api/admin/marketing/gerar', { method: 'POST', body: { gerador: g.id, entradas: valores } })
    setAGerar(false)
    if (r.success && r.data) setRes(r.data)
    else setErro(r.error ?? 'Não consegui gerar.')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {GRUPOS_ESTUDIO.map((gr) => (
          <Chip key={gr} activo={gr === grupo} onClick={() => { setGrupo(gr); setId(GERADORES.find((x) => x.grupo === gr)!.id); setRes(null) }}>{gr}</Chip>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1">
          {doGrupo.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => { setId(x.id); setRes(null); setErro(null) }}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${x.id === id ? 'border-[#D2A63C]/50 bg-[#D2A63C]/10' : 'border-white/[0.06] hover:border-white/20'}`}
            >
              <p className={`text-xs font-medium ${x.id === id ? 'text-[#E9C46A]' : 'text-zinc-200'}`}>{x.nome}</p>
              <p className="mt-0.5 line-clamp-2 text-[10.5px] text-zinc-500">{x.descricao}</p>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <Painel titulo={g.nome} icone={<Sparkles className="h-4 w-4 text-[#D2A63C]" />} sub={g.descricao}>
            <div className="grid gap-2 md:grid-cols-2">
              {g.entradas.map((c) => (
                <label key={c.id} className={`block space-y-1 ${c.tipo === 'area' ? 'md:col-span-2' : ''}`}>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{c.rotulo}{c.obrigatorio ? ' *' : ''}</span>
                  {c.tipo === 'area' ? (
                    <textarea rows={4} value={valores[c.id] ?? ''} placeholder={c.exemplo} onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })} className={entrada} />
                  ) : c.tipo === 'escolha' ? (
                    <select value={valores[c.id] ?? ''} onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })} className={entrada}>
                      <option value="">—</option>
                      {c.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={valores[c.id] ?? ''} placeholder={c.exemplo} onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })} className={entrada} />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" disabled={falta || aGerar} onClick={() => void gerar()} className="inline-flex items-center gap-1.5 rounded-md bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
                {aGerar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar
              </button>
              <p className="text-[10.5px] text-zinc-500">Usa a marca de Marketing → Marca. Sem números inventados, com o aviso educativo.</p>
            </div>
          </Painel>

          {erro && <Aviso tom="grave">{erro}</Aviso>}
          {res && (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                {res.variacoes.map((v, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-3">
                    <p className="text-xs font-semibold text-[#E9C46A]">{v.titulo}</p>
                    <Alertas alertas={v.alertas} excessos={v.excessos} />
                    {g.saida.map((s) => {
                      const val = v.campos[s.rotulo]
                      const texto = Array.isArray(val) ? val.join('\n') : val ?? ''
                      if (!texto) return null
                      return (
                        <div key={s.rotulo}>
                          <div className="flex items-center justify-between">
                            <p className="text-[9.5px] uppercase tracking-widest text-zinc-500">{s.rotulo}{s.limite ? ` · máx. ${s.limite}` : ''}</p>
                            <BotaoCopiar texto={texto} />
                          </div>
                          {Array.isArray(val) ? (
                            <ul className="mt-0.5 space-y-0.5">{val.map((l, j) => <li key={j} className="text-xs text-zinc-200">· {l}</li>)}</ul>
                          ) : (
                            <p className="whitespace-pre-wrap text-xs text-zinc-200">{val}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {res.notas && <p className="text-[11px] text-zinc-400">{res.notas}</p>}
              {res.fornecedor && <p className="text-[10px] text-zinc-600">Escrito por {res.fornecedor}.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
