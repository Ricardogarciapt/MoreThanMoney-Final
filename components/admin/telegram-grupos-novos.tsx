'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Copy, Plus, Trash2, Users, X } from 'lucide-react'
import { Aviso, Botao, Campo, Faixa, Painel, Pilula, Vazio, fmtQuando } from '@/components/admin/centro/ui'
import { BOT_DA_CASA, type EstadoPedido, type PedidoGrupo, type TipoGrupo } from '@/lib/telegram/grupos-novos'

/**
 * GESTÃO → TELEGRAM → GRUPOS E BOTS NOVOS: pedir grupos e canais (o gmi-relay cria-os com a tua
 * conta em até 2 min, no máximo 3 por dia) e registar bots feitos no @BotFather.
 * APIs: app/api/admin/backoffice/telegram/{grupos-novos,bots}/route.ts.
 */
const API_GRUPOS = '/api/admin/backoffice/telegram/grupos-novos'
const API_BOTS = '/api/admin/backoffice/telegram/bots'
const entrada = 'w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none'
const VAZIO = { tipo: 'grupo' as TipoGrupo, titulo: '', descricao: '', bot: BOT_DA_CASA }

type BotRegistado = { id: string; bot_id: number; username: string; nome: string; notas: string | null; criado_em: string }

const ESTADO: Record<EstadoPedido, { texto: string; tom: 'ok' | 'aviso' | 'grave' | 'neutro' | 'ouro' }> = {
  pendente: { texto: 'à espera do relay', tom: 'aviso' },
  a_criar: { texto: 'a criar', tom: 'ouro' },
  criado: { texto: 'criado', tom: 'ok' },
  falhou: { texto: 'falhou', tom: 'grave' },
  cancelado: { texto: 'cancelado', tom: 'neutro' },
}

export default function TelegramGruposNovos() {
  const [pedidos, setPedidos] = useState<PedidoGrupo[] | null>(null)
  const [usados, setUsados] = useState({ usadosHoje: 0, limite: 3 })
  const [bots, setBots] = useState<BotRegistado[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<typeof VAZIO | null>(null)
  const [token, setToken] = useState('')
  const [aGravar, setAGravar] = useState(false)

  const ler = useCallback(async () => {
    const [g, b] = await Promise.all([fetch(API_GRUPOS, { cache: 'no-store' }), fetch(API_BOTS, { cache: 'no-store' })])
    const dg = await g.json().catch(() => ({}))
    const db = await b.json().catch(() => ({}))
    if (g.ok) { setPedidos(dg.pedidos ?? []); setUsados({ usadosHoje: dg.usadosHoje ?? 0, limite: dg.limite ?? 3 }) } else setErro(dg.error ?? 'Não consegui ler os pedidos.')
    if (b.ok) setBots(db.bots ?? [])
  }, [])
  useEffect(() => { void ler() }, [ler])

  // Enquanto houver um pedido por tratar, relê de 20 em 20 s para o link aparecer sozinho.
  const porTratar = pedidos?.some((p) => p.estado === 'pendente' || p.estado === 'a_criar')
  useEffect(() => {
    if (!porTratar) return
    const t = setInterval(() => void ler(), 20_000)
    return () => clearInterval(t)
  }, [porTratar, ler])

  const pedir = async (url: string, metodo: 'POST' | 'DELETE', corpo?: unknown) => {
    setAGravar(true)
    setErro(null)
    try {
      const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? 'Falhou.'); return false }
      await ler()
      return true
    } finally {
      setAGravar(false)
    }
  }

  const criar = async () => {
    if (!novo) return
    const oQue = novo.tipo === 'canal' ? 'o canal' : 'o grupo'
    if (!window.confirm(`Criar ${oQue} «${novo.titulo}» com a tua conta pessoal?\n\nFica com o teu nome como dono. Conta para o limite de ${usados.limite} por dia.`)) return
    if (await pedir(API_GRUPOS, 'POST', novo)) setNovo(null)
  }

  const esgotado = usados.usadosHoje >= usados.limite
  const botsEscolha = [BOT_DA_CASA, ...bots.map((b) => b.username).filter((u) => u !== BOT_DA_CASA)]

  return (
    <Painel
      titulo="Grupos e bots novos"
      icone={<Users className="h-3.5 w-3.5 text-[#D2A63C]" />}
      sub={`Criados com a tua conta pelo relay, em até 2 minutos · ${usados.usadosHoje}/${usados.limite} nas últimas 24 h`}
      accao={!novo && <Botao tom="ouro" onClick={() => setNovo({ ...VAZIO })} disabled={esgotado}><Plus className="h-3 w-3" /> Grupo ou canal</Botao>}
    >
      {erro && <div className="mb-3"><Aviso tom="grave">{erro}</Aviso></div>}

      {novo && (
        <div className="mb-3 rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/[0.03] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select className={entrada} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoGrupo })}>
                <option value="grupo">Grupo (as pessoas falam)</option>
                <option value="canal">Canal (só nós publicamos)</option>
              </select>
            </Campo>
            <Campo rotulo="Nome">
              <input className={entrada} value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} placeholder="ex.: MTM Bootcamp · Turma de Novembro" />
            </Campo>
            <Campo rotulo="Descrição (opcional)">
              <input className={entrada} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Conteúdo educativo, não constitui consultoria financeira." />
            </Campo>
            <Campo rotulo="Bot administrador">
              <select className={entrada} value={novo.bot} onChange={(e) => setNovo({ ...novo, bot: e.target.value })}>
                {botsEscolha.map((u) => <option key={u} value={u}>@{u}</option>)}
                <option value="">Nenhum</option>
              </select>
            </Campo>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Sem o bot não há boas-vindas, nem radar, nem forwarder para lá. Depois de criado, aparece aqui o link de convite.</p>
          <div className="mt-3 flex gap-2">
            <Botao tom="ouro" onClick={() => void criar()} disabled={aGravar || novo.titulo.trim().length < 3}>Pedir</Botao>
            <Botao onClick={() => setNovo(null)}><X className="h-3 w-3" /> Cancelar</Botao>
          </div>
        </div>
      )}

      {pedidos == null ? (
        <Vazio>{erro ? 'Sem pedidos para mostrar.' : 'A ler…'}</Vazio>
      ) : pedidos.length === 0 ? (
        <Vazio>Ainda não pediste nenhum grupo daqui.</Vazio>
      ) : (
        <div className="space-y-1.5">
          {pedidos.map((p) => (
            <Faixa key={p.id} tom={(() => { const t = ESTADO[p.estado].tom; return t === 'ouro' ? 'aviso' : t })()}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-zinc-100">{p.titulo}</span>
                <span className="text-[10.5px] text-zinc-500">{p.tipo}{p.bot ? ` · @${p.bot}` : ''}</span>
                <Pilula tom={ESTADO[p.estado].tom}>{ESTADO[p.estado].texto}</Pilula>
                <span className="ml-auto flex gap-1.5">
                  {p.convite && (
                    <Botao onClick={() => void navigator.clipboard.writeText(p.convite!)} title="Copiar o link de convite"><Copy className="h-3 w-3" /> Convite</Botao>
                  )}
                  {(p.estado === 'pendente' || p.estado === 'a_criar') && (
                    <Botao tom="perigo" onClick={() => void pedir(`${API_GRUPOS}?id=${p.id}`, 'DELETE')} disabled={aGravar} title="Cancelar"><X className="h-3 w-3" /></Botao>
                  )}
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-zinc-500">
                pedido {fmtQuando(p.criado_em)}{p.chat_id ? ` · ${p.chat_id}` : ''}{p.erro ? ` · ${p.erro}` : ''}
                {p.estado === 'a_criar' && p.tratado_em && Date.now() - Date.parse(p.tratado_em) > 600_000 ? ' · está assim há mais de 10 min: vê no Telegram se ficou criado antes de pedires outra vez' : ''}
              </p>
            </Faixa>
          ))}
        </div>
      )}

      <div className="mb-1.5 mt-5 flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-[#D2A63C]" />
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Bots registados</h4>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">
        A Telegram só deixa criar bots no @BotFather (/newbot). Cola aqui o token: confirmo-o e guardo-o cifrado, e o bot passa a poder ser administrador dos grupos novos. Por agora só o @{BOT_DA_CASA} responde a mensagens.
      </p>
      <div className="flex gap-2">
        <input className={entrada} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" autoComplete="off" />
        <Botao onClick={async () => { if (await pedir(API_BOTS, 'POST', { token })) setToken('') }} disabled={aGravar || !token.trim()}>Registar</Botao>
      </div>
      {bots.length > 0 && (
        <div className="mt-2 space-y-1">
          {bots.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[11.5px] text-zinc-300">
              <span className="font-mono">@{b.username}</span>
              <span className="text-zinc-500">{b.nome} · registado {fmtQuando(b.criado_em)}</span>
              <span className="ml-auto">
                <Botao tom="perigo" disabled={aGravar} title="Esquecer este bot"
                  onClick={() => { if (window.confirm(`Esquecer @${b.username}? O bot continua a existir no Telegram.`)) void pedir(`${API_BOTS}?id=${b.id}`, 'DELETE') }}>
                  <Trash2 className="h-3 w-3" />
                </Botao>
              </span>
            </div>
          ))}
        </div>
      )}
    </Painel>
  )
}
