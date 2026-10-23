'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { EstadoPulso, RotaObservada } from '@/lib/telegram/painel-logica'
import type { GrupoClassificado } from '@/lib/prospecao/dialogos'

/**
 * GESTÃO → TELEGRAM — os bots MTProto da VPS (relays de sinais e o mapa dos grupos) vistos do
 * backoffice. Só leitura: as rotas vivem no .env da VPS, e a sessão é a conta pessoal do dono.
 * Ver `app/api/admin/backoffice/telegram/route.ts`.
 */
type Relay = { relay: string; nome: string; estado: EstadoPulso; em: string | null; versao: string | null; erro: string | null; rotas: Array<{ nome: string; lastId: number; publicadas: number; erro: string | null; activa: boolean }> }
type Dados = {
  relays: Relay[]
  rotas: RotaObservada[]
  grupos:
    | { ok: true; resumo: { nossos: number; terceiros: number; nossosSemBot: number; nossosParados: number; alcanceTerceiros: number }; lista: GrupoClassificado[] }
    | { ok: false; motivo: string }
  erros: string[]
}

const TOM_PULSO: Record<EstadoPulso, { rotulo: string; cls: string }> = {
  vivo: { rotulo: 'Vivo', cls: 'bg-emerald-500/15 text-emerald-300' },
  atrasado: { rotulo: 'Sem pulso recente', cls: 'bg-rose-500/15 text-rose-300' },
  'sem-pulso': { rotulo: 'Sem pulso', cls: 'bg-zinc-700/40 text-zinc-400' },
}

const quando = (iso: string | null) => {
  if (!iso) return '—'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`
  return `há ${Math.round(min / 1440)} dias`
}
const n0 = (v: number) => v.toLocaleString('pt-PT')

function Azulejo({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-zinc-100">{valor}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-zinc-500">{sub}</p>}
    </div>
  )
}

export default function TelegramPainel() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const ler = useCallback(async () => {
    setALer(true)
    setErro(null)
    try {
      const r = await fetch('/api/admin/backoffice/telegram', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) setErro(d?.message ?? d?.error ?? 'Não consegui ler.')
      else setDados(d)
    } catch {
      setErro('Sem ligação.')
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { void ler() }, [ler])

  if (!dados && !erro) {
    return <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
  }

  const semPulso = dados?.relays.every((r) => r.estado === 'sem-pulso')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <p className="text-xs text-zinc-500">Os bots da VPS correm com a tua sessão de Telegram. Aqui vês se estão vivos, o que publicaram e onde estás sem o bot.</p>
        <button type="button" onClick={() => void ler()} className="ml-auto rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:text-zinc-200" aria-label="Actualizar">
          {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
      {erro && <p className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{erro}</p>}

      {dados && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Relays</h2>
            {semPulso && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs text-amber-200">
                Os relays ainda não mandam pulso. Fica activo quando a versão nova do relay.py for instalada na VPS. Até lá, a actividade lê-se nas rotas abaixo.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {dados.relays.map((r) => (
                <div key={r.relay} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-100">{r.nome}</p>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${TOM_PULSO[r.estado].cls}`}>{TOM_PULSO[r.estado].rotulo}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{r.relay} · {quando(r.em)}{r.versao ? ` · ${r.versao}` : ''}</p>
                  {r.erro && <p className="mt-1 text-[11px] text-rose-300">{r.erro}</p>}
                  {r.rotas.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-400">
                      {r.rotas.map((x) => (
                        <li key={x.nome} className={x.activa ? '' : 'opacity-50'}>
                          {x.nome} · {n0(x.publicadas)} publicadas{x.erro ? <span className="text-rose-300"> · {x.erro}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Rotas (30 dias)</h2>
            {dados.rotas.length === 0 ? (
              <p className="text-xs text-zinc-500">Nada publicado nos últimos 30 dias.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr><th className="px-3 py-2">Fonte → destino</th><th className="px-3 py-2 text-right">24 h</th><th className="px-3 py-2 text-right">7 dias</th><th className="px-3 py-2 text-right">Falhas 7 d</th><th className="px-3 py-2">Última</th></tr>
                  </thead>
                  <tbody>
                    {dados.rotas.map((r) => (
                      <tr key={`${r.fonte}-${r.destino}`} className="border-t border-zinc-800/70">
                        <td className="px-3 py-2 text-zinc-200">
                          {r.fonteNome ?? r.fonte} <span className="text-zinc-500">→</span> {r.destinoNome ?? r.destino}
                          {r.ultimoErro && <p className="text-[10.5px] text-rose-300">{r.ultimoErro}</p>}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-300">{n0(r.publicadas24h)}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{n0(r.publicadas7d)}</td>
                        <td className={`px-3 py-2 text-right ${r.falhas7d ? 'text-rose-300' : 'text-zinc-500'}`}>{n0(r.falhas7d)}</td>
                        <td className={`px-3 py-2 ${(r.diasParada ?? 0) >= 3 ? 'text-amber-300' : 'text-zinc-400'}`}>{quando(r.ultimaIso)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Os teus grupos</h2>
            {!dados.grupos.ok ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">{dados.grupos.motivo}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Azulejo rotulo="Grupos nossos" valor={n0(dados.grupos.resumo.nossos)} />
                  <Azulejo rotulo="Nossos sem o bot" valor={n0(dados.grupos.resumo.nossosSemBot)} sub="sem boas-vindas nem leads" />
                  <Azulejo rotulo="Nossos parados" valor={n0(dados.grupos.resumo.nossosParados)} sub="mais de 7 dias sem tráfego" />
                  <Azulejo rotulo="Alcance em terceiros" valor={n0(dados.grupos.resumo.alcanceTerceiros)} sub={`${n0(dados.grupos.resumo.terceiros)} grupos`} />
                </div>
                <ul className="divide-y divide-zinc-800/70 rounded-xl border border-zinc-800">
                  {dados.grupos.lista.map((g) => (
                    <li key={g.chatId} className="px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-zinc-100">{g.titulo}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${g.papel === 'nosso' ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'bg-zinc-800 text-zinc-400'}`}>{g.papel === 'nosso' ? 'nosso' : 'terceiros'}</span>
                        {!g.botPresente && g.papel === 'nosso' && <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">sem bot</span>}
                        <span className="ml-auto text-[10.5px] text-zinc-500">{g.membros != null ? `${n0(g.membros)} membros` : ''}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{g.oQueFazer}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {dados.erros.length > 0 && <p className="text-[11px] text-zinc-500">Leituras com erro: {dados.erros.join(' · ')}</p>}
        </>
      )}
    </div>
  )
}
