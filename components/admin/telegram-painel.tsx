'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Radio, Route, Send, Users } from 'lucide-react'
import { Aviso, Azulejo, BotaoLer, Chip, Faixa, Filtros, Painel, Pilula, Sparkline, Vazio, fmtNum, fmtQuando } from '@/components/admin/centro/ui'
import type { EstadoPulso, RotaObservada } from '@/lib/telegram/painel-logica'
import type { GrupoClassificado } from '@/lib/prospecao/dialogos'
import TelegramForwarder from '@/components/admin/telegram-forwarder'
import TelegramMenuBot from '@/components/admin/telegram-menu-bot'

/**
 * GESTÃO → TELEGRAM — os bots MTProto da VPS (relays de sinais e o mapa dos grupos) vistos do
 * backoffice. Só leitura: as rotas vivem no .env da VPS, e a sessão é a conta pessoal do dono.
 * Ver `app/api/admin/backoffice/telegram/route.ts`. As peças são as do Centro (`centro/ui.tsx`).
 */
type Relay = { relay: string; nome: string; parado: string | null; estado: EstadoPulso; em: string | null; versao: string | null; erro: string | null; rotas: Array<{ nome: string; lastId: number; publicadas: number; erro: string | null; activa: boolean }> }
type Dados = {
  relays: Relay[]
  rotas: RotaObservada[]
  grupos:
    | { ok: true; resumo: { nossos: number; terceiros: number; nossosSemBot: number; nossosParados: number; alcanceTerceiros: number }; lista: GrupoClassificado[] }
    | { ok: false; motivo: string }
  erros: string[]
}

const PULSO: Record<EstadoPulso, { rotulo: string; tom: 'ok' | 'grave' | 'neutro' }> = {
  vivo: { rotulo: 'vivo', tom: 'ok' },
  atrasado: { rotulo: 'sem pulso recente', tom: 'grave' },
  'sem-pulso': { rotulo: 'sem pulso', tom: 'neutro' },
}

type FiltroGrupos = 'todos' | 'nossos' | 'sem-bot' | 'parados' | 'terceiros'
const FILTROS: Array<[FiltroGrupos, string]> = [['todos', 'Todos'], ['nossos', 'Nossos'], ['sem-bot', 'Sem o bot'], ['parados', 'Parados'], ['terceiros', 'Terceiros']]
const PASSO = 25

const LINK_BOT = 'https://t.me/morethanmoneypt_bot?startgroup=true'
/** O conselho do classificador traz o link do bot no meio do texto; aqui sai do texto e vira botão. */
const pedeBot = (t: string) => t.includes('t.me/morethanmoneypt_bot')
const semLinkDoBot = (t: string) => t.replace(/\s*\(t\.me\/morethanmoneypt_bot\?startgroup=true\)/, '')
const membros = (v: number | null) => (v == null ? '' : v === 1 ? '1 membro' : `${fmtNum(v)} membros`)

const tomDaRota = (r: RotaObservada) => (r.falhas7d > 0 ? 'grave' : (r.diasParada ?? 99) >= 3 ? 'aviso' : 'ok')
const nomeChat = (nome: string | null, id: string) => nome ?? id

export default function TelegramPainel() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)
  const [lidoEm, setLidoEm] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<FiltroGrupos>('todos')
  const [q, setQ] = useState('')
  const [mostrar, setMostrar] = useState(PASSO)

  const ler = useCallback(async () => {
    setALer(true)
    setErro(null)
    try {
      const r = await fetch('/api/admin/backoffice/telegram', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) setErro(d?.message ?? d?.error ?? 'Não consegui ler.')
      else { setDados(d); setLidoEm(Date.now()) }
    } catch {
      setErro('Sem ligação.')
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { void ler() }, [ler])

  const totais = useMemo(() => {
    const rotas = dados?.rotas ?? []
    const serie = new Array(14).fill(0)
    for (const r of rotas) r.serie14d?.forEach((v, i) => { serie[i] += v })
    const activos = dados?.relays.filter((r) => !r.parado) ?? []
    return {
      vivos: activos.filter((r) => r.estado === 'vivo').length,
      relays: activos.length,
      d24: rotas.reduce((a, r) => a + r.publicadas24h, 0),
      d7: rotas.reduce((a, r) => a + r.publicadas7d, 0),
      falhas: rotas.reduce((a, r) => a + r.falhas7d, 0),
      paradas: rotas.filter((r) => (r.diasParada ?? 99) >= 3).length,
      serie,
    }
  }, [dados])

  const grupos = useMemo(() => {
    if (!dados?.grupos.ok) return { lista: [] as GrupoClassificado[], blocos: [] as Array<{ conselho: string; grupos: GrupoClassificado[] }>, total: 0 }
    const termo = q.trim().toLowerCase()
    const lista = dados.grupos.lista.filter((g) => {
      if (filtro === 'nossos' && g.papel !== 'nosso') return false
      if (filtro === 'terceiros' && g.papel !== 'terceiros') return false
      if (filtro === 'sem-bot' && !(g.papel === 'nosso' && !g.botPresente)) return false
      if (filtro === 'parados' && !(g.papel === 'nosso' && (g.diasParado ?? 0) > 7)) return false
      return !termo || g.titulo.toLowerCase().includes(termo)
    })
    // A lista vem ordenada por prioridade; junta-se por conselho para cada conselho aparecer uma vez.
    const porConselho = new Map<string, GrupoClassificado[]>()
    for (const g of lista) porConselho.set(g.oQueFazer, [...(porConselho.get(g.oQueFazer) ?? []), g])
    const blocos = [...porConselho.entries()].map(([conselho, grupos]) => ({ conselho, grupos }))
    return { lista, blocos, total: dados.grupos.lista.length }
  }, [dados, filtro, q])

  useEffect(() => { setMostrar(PASSO) }, [filtro, q])

  if (!dados && !erro) {
    return <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
  }

  const semPulso = dados?.relays.filter((r) => !r.parado).every((r) => r.estado === 'sem-pulso')
  const resumo = dados?.grupos.ok ? dados.grupos.resumo : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-zinc-500">
          Os bots da VPS correm com a tua sessão de Telegram. Aqui vês se estão vivos, o que publicaram e em que grupos teus o bot ainda não está.
        </p>
        <div className="ml-auto"><BotaoLer onClick={() => void ler()} aCarregar={aLer} lidoEm={lidoEm} /></div>
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Azulejo
              rotulo="Relays vivos"
              valor={semPulso ? '—' : `${totais.vivos}/${totais.relays}`}
              sub={semPulso ? 'à espera do primeiro pulso' : totais.vivos === totais.relays ? 'todos a pulsar' : 'há relays calados'}
              tom={semPulso ? undefined : totais.vivos === totais.relays ? 'ok' : 'grave'}
            />
            <Azulejo rotulo="Publicadas · 24 h" valor={fmtNum(totais.d24)} sub={`${fmtNum(totais.d7)} em 7 dias`} serie={totais.serie} barras />
            <Azulejo
              rotulo="Falhas · 7 dias"
              valor={fmtNum(totais.falhas)}
              sub={totais.paradas ? `${totais.paradas} rota${totais.paradas > 1 ? 's' : ''} parada${totais.paradas > 1 ? 's' : ''} há 3+ dias` : 'nenhuma rota parada'}
              tom={totais.falhas ? 'grave' : totais.paradas ? 'aviso' : 'ok'}
            />
            <Azulejo
              rotulo="Grupos teus sem o bot"
              valor={resumo ? fmtNum(resumo.nossosSemBot) : '—'}
              sub={resumo ? `de ${fmtNum(resumo.nossos)} grupos teus` : 'mapa de grupos indisponível'}
              tom={resumo?.nossosSemBot ? 'aviso' : resumo ? 'ok' : undefined}
              onClick={resumo?.nossosSemBot ? () => setFiltro('sem-bot') : undefined}
            />
          </div>

          <Painel titulo="Relays" icone={<Radio className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="Cada relay manda um pulso de 5 em 5 minutos.">
            {semPulso && (
              <div className="mb-3">
                <Aviso tom="info">Os relays ainda não mandam pulso. O estado aparece aqui uns minutos depois de a versão nova do relay.py ser instalada na VPS. Até lá, a actividade lê-se nas rotas abaixo.</Aviso>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-3">
              {dados.relays.map((r) => {
                const p = r.parado ? { rotulo: 'parado', tom: 'neutro' as const } : PULSO[r.estado]
                return (
                  <div key={r.relay} className={`rounded-xl border border-white/[0.06] bg-zinc-900/40 p-3 ${r.parado ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{r.nome}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{r.relay}</p>
                      </div>
                      <span className="ml-auto"><Pilula tom={p.tom} vivo={r.estado === 'vivo'}>{p.rotulo}</Pilula></span>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {r.parado ?? (r.em ? `último pulso ${fmtQuando(r.em)}` : 'nunca pulsou')}{r.versao ? ` · versão ${r.versao}` : ''}
                    </p>
                    {r.erro && <p className="mt-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">{r.erro}</p>}
                    {r.rotas.length > 0 && (
                      <ul className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2">
                        {r.rotas.map((x) => (
                          <li key={x.nome} className={`flex items-center gap-2 text-[11px] ${x.activa ? 'text-zinc-300' : 'text-zinc-600'}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.erro ? 'bg-rose-500' : x.activa ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                            <span className="truncate">{x.nome}</span>
                            <span className="ml-auto font-mono tabular-nums text-zinc-500">{fmtNum(x.publicadas)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </Painel>

          <TelegramForwarder grupos={dados.grupos.ok ? dados.grupos.lista : []} />

          <TelegramMenuBot />

          <Painel titulo="Rotas" icone={<Route className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="O que cada fonte publicou no destino, nos últimos 30 dias. O gráfico mostra 14 dias.">
            {dados.rotas.length === 0 ? (
              <Vazio>Nada publicado nos últimos 30 dias.</Vazio>
            ) : (
              <div className="space-y-1.5">
                {dados.rotas.map((r) => (
                  <Faixa key={`${r.fonte}-${r.destino}`} tom={tomDaRota(r)}>
                    <div className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-zinc-100">
                          <span className="truncate">{nomeChat(r.fonteNome, r.fonte)}</span>
                          <Send className="h-3 w-3 shrink-0 text-zinc-600" />
                          <span className="truncate text-[#E9C46A]">{nomeChat(r.destinoNome, r.destino)}</span>
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-zinc-500">
                          última {fmtQuando(r.ultimaIso)}
                          {(r.diasParada ?? 0) >= 3 && <span className="text-amber-300"> · parada há {r.diasParada} dias</span>}
                        </p>
                        {r.ultimoErro && <p className="mt-0.5 truncate text-[10.5px] text-rose-300" title={r.ultimoErro}>{r.ultimoErro}</p>}
                      </div>
                      <div className="hidden sm:block"><Sparkline serie={r.serie14d ?? []} tom={tomDaRota(r)} barras /></div>
                      <div className="flex gap-4 text-right font-mono text-[11px] tabular-nums">
                        <div><p className="text-[9.5px] uppercase tracking-wider text-zinc-600">24 h</p><p className="text-zinc-200">{fmtNum(r.publicadas24h)}</p></div>
                        <div><p className="text-[9.5px] uppercase tracking-wider text-zinc-600">7 d</p><p className="text-zinc-200">{fmtNum(r.publicadas7d)}</p></div>
                        <div><p className="text-[9.5px] uppercase tracking-wider text-zinc-600">falhas</p><p className={r.falhas7d ? 'text-rose-300' : 'text-zinc-600'}>{fmtNum(r.falhas7d)}</p></div>
                      </div>
                    </div>
                  </Faixa>
                ))}
              </div>
            )}
          </Painel>

          <Painel
            titulo="Os teus grupos"
            icone={<Users className="h-3.5 w-3.5 text-[#D2A63C]" />}
            sub={resumo ? `${fmtNum(resumo.nossos)} teus · ${fmtNum(resumo.terceiros)} de terceiros, com ${fmtNum(resumo.alcanceTerceiros)} pessoas ao todo` : undefined}
          >
            {!dados.grupos.ok ? (
              <Vazio>{dados.grupos.motivo}</Vazio>
            ) : (
              <>
                <Filtros q={q} aoMudarQ={setQ} exemplo="Procurar grupo…" contagem={grupos.lista.length} total={grupos.total}>
                  {FILTROS.map(([k, rotulo]) => (
                    <Chip key={k} activo={filtro === k} onClick={() => setFiltro(k)}>
                      {rotulo}
                      {k === 'sem-bot' && resumo?.nossosSemBot ? ` · ${resumo.nossosSemBot}` : k === 'parados' && resumo?.nossosParados ? ` · ${resumo.nossosParados}` : ''}
                    </Chip>
                  ))}
                </Filtros>
                {grupos.lista.length === 0 ? (
                  <Vazio>Nada com estes filtros.</Vazio>
                ) : (
                  <div className="space-y-3">
                    {grupos.blocos.map(({ conselho, grupos: gs }) => {
                      const bot = pedeBot(conselho)
                      const aberto = mostrar > PASSO || gs.length <= 8
                      return (
                        <div key={conselho} className={`rounded-xl border p-3 ${bot ? 'border-amber-500/25 bg-amber-500/[0.03]' : 'border-white/[0.06] bg-zinc-900/30'}`}>
                          <div className="flex flex-wrap items-start gap-2">
                            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-zinc-200">{semLinkDoBot(conselho)}</p>
                            <Pilula tom={bot ? 'aviso' : 'neutro'}>{gs.length} grupo{gs.length > 1 ? 's' : ''}</Pilula>
                            {bot && (
                              <a href={LINK_BOT} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[#D2A63C]/50 bg-[#D2A63C]/10 px-2.5 py-1 text-[11px] font-medium text-[#E9C46A] hover:bg-[#D2A63C]/20">
                                <Plus className="h-3 w-3" /> Adicionar o bot
                              </a>
                            )}
                          </div>
                          <ul className="mt-2 space-y-1">
                            {(aberto ? gs : gs.slice(0, 8)).map((g) => (
                              <li key={g.chatId}>
                                <Faixa tom={g.papel === 'nosso' && !g.botPresente ? 'aviso' : g.papel === 'nosso' ? 'ok' : 'neutro'} className="py-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="min-w-0 truncate text-[12px] font-medium text-zinc-100">{g.titulo}</span>
                                    <Pilula tom={g.papel === 'nosso' ? 'ouro' : 'neutro'}>{g.papel === 'nosso' ? 'teu' : 'terceiros'}</Pilula>
                                    {g.papel === 'nosso' && (g.diasParado ?? 0) > 7 && <Pilula tom="neutro">parado {g.diasParado} d</Pilula>}
                                    <span className="ml-auto font-mono text-[10.5px] tabular-nums text-zinc-500">{[g.tipo, membros(g.membros)].filter(Boolean).join(' · ')}</span>
                                  </div>
                                </Faixa>
                              </li>
                            ))}
                          </ul>
                          {!aberto && (
                            <button type="button" onClick={() => setMostrar((m) => m + PASSO)} className="mt-2 w-full rounded-lg border border-dashed border-white/10 py-1.5 text-[11px] text-zinc-400 hover:border-[#D2A63C]/40 hover:text-white">
                              Mostrar os outros {gs.length - 8}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </Painel>

          {dados.erros.length > 0 && <Aviso>Leituras com erro: {dados.erros.join(' · ')}</Aviso>}
        </>
      )}
    </div>
  )
}
