'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, Loader2, Plus, Radio, RefreshCw, Route as RouteIcon, Users } from 'lucide-react'
import type { EstadoPulso, RotaObservada } from '@/lib/telegram/painel-logica'
import type { GrupoClassificado } from '@/lib/prospecao/dialogos'

/**
 * GESTÃO → TELEGRAM — os bots MTProto da VPS (relays de sinais e o mapa dos grupos) vistos do
 * backoffice. Só leitura: as rotas vivem no .env da VPS, e a sessão é a conta pessoal do dono.
 * Ver `app/api/admin/backoffice/telegram/route.ts`.
 */
/** Uma rota tal como o relay a manda no pulso (services/*-relay/relay.py → def pulso). */
type RotaDoPulso = { nome: string; fonte?: string; destino?: string; last_id?: number; publicadas?: number; erro?: string | null; activa?: boolean }
type Relay = { relay: string; nome: string; parado?: string | null; estado: EstadoPulso; em: string | null; versao: string | null; erro: string | null; rotas: RotaDoPulso[] }
type Dados = {
  relays: Relay[]
  rotas: RotaObservada[]
  grupos:
    | { ok: true; resumo: { nossos: number; terceiros: number; nossosSemBot: number; nossosParados: number; alcanceTerceiros: number }; lista: GrupoClassificado[] }
    | { ok: false; motivo: string }
  erros: string[]
}

type Filtro = 'nossos' | 'terceiros' | 'todos'

const LINK_BOT = 'https://t.me/morethanmoneypt_bot?startgroup=true'

const TOM_PULSO: Record<EstadoPulso | 'parado', { rotulo: string; ponto: string; texto: string }> = {
  vivo: { rotulo: 'Vivo', ponto: 'bg-emerald-400', texto: 'text-emerald-300' },
  atrasado: { rotulo: 'Pulso atrasado', ponto: 'bg-rose-400', texto: 'text-rose-300' },
  'sem-pulso': { rotulo: 'Sem pulso', ponto: 'bg-zinc-600', texto: 'text-zinc-400' },
  parado: { rotulo: 'Parado', ponto: 'bg-zinc-700', texto: 'text-zinc-500' },
}

const quando = (iso: string | null) => {
  if (!iso) return '—'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`
  return `há ${Math.round(min / 1440)} dias`
}
const n0 = (v: number) => v.toLocaleString('pt-PT')
const membros = (v: number | null) => (v == null ? null : v === 1 ? '1 membro' : `${n0(v)} membros`)

/** O conselho do classificador traz o link do bot no meio do texto; aqui sai do texto e vira botão. */
const pedeBot = (t: string) => t.includes('t.me/morethanmoneypt_bot')
const semLinkDoBot = (t: string) => t.replace(/\s*\(t\.me\/morethanmoneypt_bot\?startgroup=true\)/, '')

function Numero({ rotulo, valor, nota, alerta, activo, onClick }: { rotulo: string; valor: string; nota?: string; alerta?: boolean; activo?: boolean; onClick?: () => void }) {
  const cls = `rounded-xl border p-3 text-left transition-colors ${
    activo ? 'border-[#D2A63C]/50 bg-[#D2A63C]/[0.06]' : alerta ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'
  }`
  const corpo = (
    <>
      <p className="text-[11px] text-zinc-400">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${alerta ? 'text-amber-300' : 'text-[#E9C46A]'}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[10.5px] text-zinc-500">{nota}</p>}
    </>
  )
  if (!onClick) return <div className={cls}>{corpo}</div>
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} className={`${cls} hover:border-[#D2A63C]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/50 active:translate-y-px`}>
      {corpo}
    </button>
  )
}

function Cabecalho({ icone: Icone, titulo, nota, children }: { icone: typeof Radio; titulo: string; nota?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        <Icone className="h-4 w-4 text-[#D2A63C]" aria-hidden />
        <h2 className="text-sm font-semibold text-zinc-100">{titulo}</h2>
      </div>
      {nota && <p className="text-[11px] text-zinc-500">{nota}</p>}
      {children && <div className="ml-auto">{children}</div>}
    </div>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-6 p-4 sm:p-5" aria-busy="true" aria-label="A carregar">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[84px] animate-pulse rounded-xl bg-white/[0.03]" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-white/[0.03]" />)}
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
      <div className="h-48 animate-pulse rounded-xl bg-white/[0.03]" />
    </div>
  )
}

function CartaoRelay({ r }: { r: Relay }) {
  const desligado = Boolean(r.parado) && r.estado === 'sem-pulso'
  const tom = TOM_PULSO[desligado ? 'parado' : r.estado]
  return (
    <li className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 ${desligado ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2.5">
        <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
          {r.estado === 'vivo' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${tom.ponto}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-zinc-100">{r.nome}</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{r.relay}{r.versao ? ` · v${r.versao}` : ''}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-[11px] font-medium ${tom.texto}`}>{tom.rotulo}</p>
          <p className="text-[10.5px] text-zinc-500">{desligado ? r.parado : r.em ? `pulso ${quando(r.em)}` : 'ainda não pulsou'}</p>
        </div>
      </div>
      {r.erro && <p className="mt-2 rounded-md bg-rose-500/[0.08] px-2 py-1 text-[11px] text-rose-200">{r.erro}</p>}
      {r.rotas.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-white/[0.05] pt-2.5">
          {r.rotas.map((x) => (
            <li key={x.nome} className={`flex items-center gap-2 text-[11px] ${x.activa === false ? 'opacity-50' : ''}`}>
              <span className="truncate text-zinc-300">{x.nome}</span>
              {x.erro && <span className="truncate text-rose-300">· {x.erro}</span>}
              <span className="ml-auto shrink-0 tabular-nums text-zinc-400">
                {n0(x.publicadas ?? 0)} <span className="text-zinc-600">desde o arranque</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function TelegramPainel() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)
  const [lidoEm, setLidoEm] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('nossos')

  const ler = useCallback(async () => {
    setALer(true)
    setErro(null)
    try {
      const r = await fetch('/api/admin/backoffice/telegram', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) setErro(d?.message ?? d?.error ?? 'Não consegui ler o painel.')
      else {
        setDados(d)
        setLidoEm(new Date().toISOString())
      }
    } catch {
      setErro('Sem ligação ao servidor. Tenta outra vez.')
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { void ler() }, [ler])

  // A lista vem ordenada por prioridade; junta-se por conselho para cada conselho aparecer uma vez.
  const blocos = useMemo(() => {
    if (!dados?.grupos.ok) return []
    const porConselho = new Map<string, GrupoClassificado[]>()
    for (const g of dados.grupos.lista) {
      if (filtro !== 'todos' && (filtro === 'nossos') !== (g.papel === 'nosso')) continue
      const lista = porConselho.get(g.oQueFazer) ?? []
      lista.push(g)
      porConselho.set(g.oQueFazer, lista)
    }
    return [...porConselho.entries()].map(([conselho, grupos]) => ({ conselho, grupos }))
  }, [dados, filtro])

  if (!dados && !erro) return <Esqueleto />

  const relaysActivos = dados?.relays.filter((r) => !r.parado) ?? []
  const vivos = relaysActivos.filter((r) => r.estado === 'vivo').length
  const nenhumPulso = relaysActivos.length > 0 && relaysActivos.every((r) => r.estado === 'sem-pulso')
  const publicadas24h = dados?.rotas.reduce((s, r) => s + r.publicadas24h, 0) ?? 0
  const falhas7d = dados?.rotas.reduce((s, r) => s + r.falhas7d, 0) ?? 0
  const max7d = Math.max(1, ...(dados?.rotas.map((r) => r.publicadas7d) ?? []))
  const resumo = dados?.grupos.ok ? dados.grupos.resumo : null

  return (
    <div className="space-y-7 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-[62ch] text-xs leading-relaxed text-zinc-400">
          Os bots da VPS correm com a tua sessão de Telegram. Aqui vês se estão vivos, o que publicaram e em que grupos ainda falta o bot.
        </p>
        <button
          type="button"
          onClick={() => void ler()}
          disabled={aLer}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-[#D2A63C]/40 hover:text-[#E9C46A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/50 active:translate-y-px disabled:opacity-60"
        >
          {aLer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {lidoEm ? `Lido ${quando(lidoEm)}` : 'Actualizar'}
        </button>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{erro}</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Numero
              rotulo="Relays vivos"
              valor={`${vivos}/${relaysActivos.length}`}
              nota={nenhumPulso ? 'à espera do primeiro pulso' : vivos < relaysActivos.length ? 'há um relay calado' : 'todos a pulsar'}
              alerta={!nenhumPulso && vivos < relaysActivos.length}
            />
            <Numero rotulo="Sinais publicados · 24 h" valor={n0(publicadas24h)} nota={falhas7d ? `${n0(falhas7d)} falhas em 7 dias` : 'sem falhas em 7 dias'} alerta={falhas7d > 0} />
            <Numero
              rotulo="Grupos nossos sem o bot"
              valor={resumo ? n0(resumo.nossosSemBot) : '—'}
              nota="sem boas-vindas nem leads"
              alerta={(resumo?.nossosSemBot ?? 0) > 0}
              onClick={resumo ? () => setFiltro('nossos') : undefined}
            />
            <Numero
              rotulo="Alcance em terceiros"
              valor={resumo ? n0(resumo.alcanceTerceiros) : '—'}
              nota={resumo ? `membros em ${n0(resumo.terceiros)} grupos` : undefined}
              onClick={resumo ? () => setFiltro('terceiros') : undefined}
            />
          </div>

          <section className="space-y-3">
            <Cabecalho icone={Radio} titulo="Relays" nota="cada relay manda um pulso de 5 em 5 min" />
            {nenhumPulso && (
              <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                Ainda não chegou nenhum pulso. O primeiro aparece uns 5 minutos depois de o relay.py com pulso arrancar na VPS. Até lá, o que foi publicado vê-se nas rotas abaixo.
              </p>
            )}
            <ul className="grid gap-3 lg:grid-cols-3">
              {dados.relays.map((r) => <CartaoRelay key={r.relay} r={r} />)}
            </ul>
          </section>

          <section className="space-y-3">
            <Cabecalho icone={RouteIcon} titulo="Rotas" nota="o que o relay-post registou nos últimos 30 dias" />
            {dados.rotas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] p-5 text-center text-xs text-zinc-500">Nada publicado nos últimos 30 dias.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-white/[0.02]">
                {dados.rotas.map((r) => (
                  <li key={`${r.fonte}-${r.destino}`} className="grid gap-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-100">
                        <span className="truncate">{r.fonteNome ?? r.fonte}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#D2A63C]" aria-label="para" />
                        <span className="truncate">{r.destinoNome ?? r.destino}</span>
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <div className="h-full rounded-full bg-[#D2A63C]/70" style={{ width: `${Math.max(2, (r.publicadas7d / max7d) * 100)}%` }} />
                        </div>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-500">{n0(r.publicadas7d)} em 7 dias</span>
                      </div>
                      {r.ultimoErro && <p className="mt-1.5 text-[11px] text-rose-300">{r.ultimoErro}</p>}
                    </div>
                    <dl className="flex gap-6 text-right">
                      <div>
                        <dt className="text-[10px] text-zinc-500">24 h</dt>
                        <dd className="text-lg font-semibold tabular-nums text-[#E9C46A]">{n0(r.publicadas24h)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-zinc-500">Falhas 7 d</dt>
                        <dd className={`text-lg font-semibold tabular-nums ${r.falhas7d ? 'text-rose-300' : 'text-zinc-500'}`}>{n0(r.falhas7d)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-zinc-500">Última</dt>
                        <dd className={`pt-1 text-xs ${(r.diasParada ?? 0) >= 3 ? 'text-amber-300' : 'text-zinc-300'}`}>{quando(r.ultimaIso)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <Cabecalho icone={Users} titulo="Os teus grupos" nota={resumo ? `${n0(resumo.nossos)} nossos · ${n0(resumo.nossosParados)} parados há mais de 7 dias` : undefined}>
              {dados.grupos.ok && (
                <div role="tablist" aria-label="Que grupos mostrar" className="flex gap-1 rounded-lg border border-white/[0.08] p-0.5 text-[11px]">
                  {(['nossos', 'terceiros', 'todos'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={filtro === f}
                      onClick={() => setFiltro(f)}
                      className={`rounded-md px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/50 ${filtro === f ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {f === 'nossos' ? 'Nossos' : f === 'terceiros' ? 'Terceiros' : 'Todos'}
                    </button>
                  ))}
                </div>
              )}
            </Cabecalho>

            {!dados.grupos.ok ? (
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-zinc-400">{dados.grupos.motivo}</p>
            ) : blocos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] p-5 text-center text-xs text-zinc-500">Nenhum grupo nesta vista.</p>
            ) : (
              <div className="space-y-3">
                {blocos.map(({ conselho, grupos }) => {
                  const bot = pedeBot(conselho)
                  return (
                    <div key={conselho} className={`rounded-xl border ${bot ? 'border-amber-400/25 bg-amber-400/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                      <div className="flex flex-wrap items-start gap-3 border-b border-white/[0.05] px-3.5 py-3">
                        <span className={`mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10.5px] font-semibold tabular-nums ${bot ? 'bg-amber-300 text-black' : 'bg-white/[0.06] text-zinc-300'}`}>
                          {grupos.length}
                        </span>
                        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-zinc-200 [text-wrap:pretty]">{semLinkDoBot(conselho)}</p>
                        {bot && (
                          <a
                            href={LINK_BOT}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#D2A63C] px-2.5 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-[#E9C46A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9C46A] active:translate-y-px"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Adicionar o bot
                          </a>
                        )}
                      </div>
                      <ul className="grid gap-x-4 px-3.5 py-2 sm:grid-cols-2 xl:grid-cols-3">
                        {grupos.map((g) => (
                          <li key={g.chatId} className="flex items-center gap-2 py-1.5" title={g.leitura}>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-zinc-100">{g.titulo}</p>
                              <p className="text-[10.5px] text-zinc-500">
                                {g.tipo}
                                {membros(g.membros) ? ` · ${membros(g.membros)}` : ''}
                                {g.diasParado != null && g.diasParado >= 7 ? ` · parado há ${g.diasParado} dias` : ''}
                              </p>
                            </div>
                            {g.papel === 'nosso' && !g.botPresente && !bot && <Bot className="h-3.5 w-3.5 shrink-0 text-amber-300/80" aria-label="sem o bot" />}
                            {filtro === 'todos' && (
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] ${g.papel === 'nosso' ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'bg-white/[0.05] text-zinc-400'}`}>
                                {g.papel === 'nosso' ? 'nosso' : 'terceiros'}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {dados.erros.length > 0 && <p className="text-[11px] text-zinc-500">Leituras com erro: {dados.erros.join(' · ')}</p>}
        </>
      )}
    </div>
  )
}
