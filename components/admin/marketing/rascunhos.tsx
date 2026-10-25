'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Megaphone, Rocket, XCircle } from 'lucide-react'
import { Aviso, Botao, Pilula, Vazio, fmtQuando, pedirCentro, useCentro } from '@/components/admin/centro/ui'

type Rascunho = {
  id: string
  tipo: 'lancamento' | 'campanha_meta'
  titulo: string
  conteudo: Record<string, unknown>
  estado: 'rascunho' | 'aplicado' | 'descartado' | 'falhou'
  resultado: Record<string, unknown> | null
  origem: string | null
  criado_em: string
}

const TOM = { rascunho: 'ouro', aplicado: 'ok', descartado: 'neutro', falhou: 'grave' } as const

function Linha({ r, k }: { r: Record<string, unknown>; k: string }) {
  const v = r[k]
  if (v == null || v === '') return null
  return <p className="text-[11px] text-zinc-300"><span className="text-zinc-500">{k}: </span>{typeof v === 'string' ? v : JSON.stringify(v)}</p>
}

/**
 * RASCUNHOS — o que o Assistente propôs. Aplicar um kit cria o formulário, a automação do
 * Instagram DESLIGADA e o funil no mapa; aplicar uma campanha cria-a na Meta EM PAUSA.
 * Ligar continua a ser um segundo gesto, em Social e em Tráfego.
 */
export default function MarketingRascunhos() {
  const { dados, erro, recarregar } = useCentro<{ rascunhos: Rascunho[] }>('/api/admin/marketing/rascunhos', 60_000)
  const [aDecidir, setADecidir] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tom: 'info' | 'grave'; t: string } | null>(null)

  const decidir = async (id: string, accao: 'aplicar' | 'descartar') => {
    if (accao === 'aplicar' && !confirm('Aplicar este rascunho? Fica tudo desligado/em pausa até o ligares.')) return
    setADecidir(id); setMsg(null)
    const r = await pedirCentro('/api/admin/marketing/rascunhos', { method: 'POST', body: { id, accao } })
    setADecidir(null)
    setMsg(r.success ? { tom: 'info', t: accao === 'aplicar' ? 'Aplicado. Liga a automação em Social e a campanha em Tráfego quando quiseres.' : 'Descartado.' } : { tom: 'grave', t: r.error ?? 'Falhou.' })
    void recarregar()
  }

  if (erro) return <Aviso tom="grave">{erro}</Aviso>
  if (!dados) return <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" />

  return (
    <div className="space-y-3">
      {msg && <Aviso tom={msg.tom}>{msg.t}</Aviso>}
      {!dados.rascunhos.length && <Vazio>Ainda não há rascunhos. Pede ao Assistente um lançamento ou uma campanha.</Vazio>}
      {dados.rascunhos.map((r) => {
        const c = r.conteudo
        const form = (c.formulario ?? {}) as Record<string, unknown>
        return (
          <div key={r.id} className="space-y-2 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {r.tipo === 'lancamento' ? <Rocket className="h-4 w-4 text-[#D2A63C]" /> : <Megaphone className="h-4 w-4 text-[#D2A63C]" />}
              <p className="text-sm font-semibold text-zinc-100">{r.titulo}</p>
              <Pilula tom={TOM[r.estado]}>{r.estado}</Pilula>
              <span className="ml-auto text-[10.5px] text-zinc-500">{fmtQuando(r.criado_em)} · {r.origem ?? '—'}</span>
            </div>
            {r.tipo === 'lancamento' ? (
              <div className="grid gap-1 md:grid-cols-2">
                <Linha r={c} k="palavraChave" />
                <Linha r={{ formulario: `${form.titulo ?? ''} (/${form.slug ?? ''})` }} k="formulario" />
                <Linha r={c} k="respostaPublica" />
                <Linha r={c} k="mensagemPrivada" />
                <Linha r={{ seguimento: (c.seguimento as unknown[] | undefined)?.length ? `${(c.seguimento as unknown[]).length} mensagens` : '' }} k="seguimento" />
                <Linha r={{ etiquetas: ((c.destino as { etiquetas?: string[] })?.etiquetas ?? []).join(', ') }} k="etiquetas" />
              </div>
            ) : (
              <div className="grid gap-1 md:grid-cols-2">
                {['conta', 'orcamentoDiario', 'paises', 'titulo', 'texto', 'link', 'cta'].map((k) => <Linha key={k} r={c} k={k} />)}
              </div>
            )}
            {r.resultado && <p className="text-[11px] text-zinc-500">Resultado: {JSON.stringify(r.resultado)}</p>}
            {r.estado !== 'aplicado' && r.estado !== 'descartado' && (
              <div className="flex gap-2">
                <Botao tom="ouro" disabled={aDecidir === r.id} onClick={() => void decidir(r.id, 'aplicar')}>
                  {aDecidir === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} {r.estado === 'falhou' ? 'Tentar de novo' : 'Aplicar'}
                </Botao>
                <Botao tom="perigo" disabled={aDecidir === r.id} onClick={() => void decidir(r.id, 'descartar')}><XCircle className="h-3 w-3" /> Descartar</Botao>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
