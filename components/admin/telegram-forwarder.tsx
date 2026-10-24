'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { Aviso, Botao, Campo, Faixa, Painel, Pilula, Vazio, fmtQuando, pedirPalavra } from '@/components/admin/centro/ui'
import { DESTINO_PREMIUM, FILTROS, NOME_FILTRO, PALAVRA_PREMIUM, type Filtro, type RotaGuardada } from '@/lib/telegram/rotas'
import type { GrupoClassificado } from '@/lib/prospecao/dialogos'

/**
 * GESTÃO → TELEGRAM → FORWARDER: as rotas do gmi-relay (fonte → destino), editáveis aqui.
 * O relay da VPS relê-as de 2 em 2 minutos. Ver `app/api/admin/backoffice/telegram/rotas/route.ts`.
 */
const API = '/api/admin/backoffice/telegram/rotas'
const VAZIA = { nome: '', fonte: '', destino: '', filtro: 'gold' as Filtro, cabecalho: '' }
const entrada = 'w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none'

export default function TelegramForwarder({ grupos }: { grupos: GrupoClassificado[] }) {
  const [rotas, setRotas] = useState<RotaGuardada[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [nova, setNova] = useState<typeof VAZIA | null>(null)

  const titulo = useMemo(() => new Map(grupos.map((g) => [String(g.chatId), g.titulo])), [grupos])
  const nossos = useMemo(() => grupos.filter((g) => g.papel === 'nosso'), [grupos])
  const nomeDe = (id: string) => (id === DESTINO_PREMIUM ? 'Premium' : titulo.get(id) ?? id)

  const ler = useCallback(async () => {
    const r = await fetch(API, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setRotas(d.rotas ?? []); setErro(null) } else setErro(d.error ?? 'Não consegui ler as rotas.')
  }, [])
  useEffect(() => { void ler() }, [ler])

  /** Mexer na Premium pede a palavra; o servidor volta a exigi-la. */
  const palavraSe = (destino: string, texto: string): string | undefined | false => {
    if (destino !== DESTINO_PREMIUM) return undefined
    return pedirPalavra(`${texto}\n\nEsta rota publica na Premium, que EXECUTA nas contas dos clientes.`, PALAVRA_PREMIUM) ?? false
  }

  const pedir = async (metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: Record<string, unknown>, query = '') => {
    setAGravar(true)
    setErro(null)
    try {
      const r = await fetch(API + query, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.error ?? 'Falhou.'); return false }
      await ler()
      return true
    } finally {
      setAGravar(false)
    }
  }

  const alternar = async (r: RotaGuardada) => {
    const palavra = palavraSe(r.destino, `${r.activa ? 'Pausar' : 'Ligar'} a rota ${r.nome}.`)
    if (palavra === false) return
    await pedir('PATCH', { id: r.id, activa: !r.activa, palavra })
  }

  const apagar = async (r: RotaGuardada) => {
    const palavra = palavraSe(r.destino, `Apagar a rota ${r.nome}.`)
    if (palavra === false) return
    if (palavra === undefined && !window.confirm(`Apagar a rota ${r.nome}? O relay deixa de a correr em até 2 minutos.`)) return
    await pedir('DELETE', undefined, `?id=${encodeURIComponent(r.id)}${palavra ? `&palavra=${palavra}` : ''}`)
  }

  const criar = async () => {
    if (!nova) return
    const palavra = palavraSe(nova.destino, `Criar a rota ${nova.nome}.`)
    if (palavra === false) return
    if (await pedir('POST', { ...nova, palavra })) setNova(null)
  }

  return (
    <Painel
      titulo="Forwarder"
      icone={<ArrowRightLeft className="h-3.5 w-3.5 text-[#D2A63C]" />}
      sub="Lê a fonte com a tua conta e republica no destino pelo bot. O relay apanha as mudanças em até 2 minutos."
      accao={!nova && <Botao tom="ouro" onClick={() => setNova({ ...VAZIA })}><Plus className="h-3 w-3" /> Nova rota</Botao>}
    >
      {erro && <div className="mb-3"><Aviso tom="grave">{erro}</Aviso></div>}

      {nova && (
        <div className="mb-3 rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/[0.03] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <input className={entrada} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="ex.: ouro-londres" />
            </Campo>
            <Campo rotulo="Filtro">
              <select className={entrada} value={nova.filtro} onChange={(e) => setNova({ ...nova, filtro: e.target.value as Filtro })}>
                {FILTROS.map((f) => <option key={f} value={f}>{NOME_FILTRO[f]}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Fonte (canal que lês)">
              <input className={entrada} list="tg-fontes" value={nova.fonte} onChange={(e) => setNova({ ...nova, fonte: e.target.value })} placeholder="-100… ou @canal" />
              <datalist id="tg-fontes">
                {grupos.map((g) => <option key={g.chatId} value={g.chatId}>{g.titulo}</option>)}
              </datalist>
            </Campo>
            <Campo rotulo="Destino (chat MTM onde o bot publica)">
              <select className={entrada} value={nova.destino} onChange={(e) => setNova({ ...nova, destino: e.target.value })}>
                <option value="">Escolhe…</option>
                <option value={DESTINO_PREMIUM}>Premium (executa nas contas dos clientes)</option>
                {nossos.filter((g) => String(g.chatId) !== DESTINO_PREMIUM).map((g) => (
                  <option key={g.chatId} value={g.chatId}>{g.titulo}{g.botPresente ? '' : ' (sem o bot)'}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Cabeçalho (opcional)">
              <input className={entrada} value={nova.cabecalho} onChange={(e) => setNova({ ...nova, cabecalho: e.target.value })} placeholder="ex.: 🏦 MTM Premium" />
            </Campo>
          </div>
          {nova.destino && titulo.has(nova.destino) && !nossos.find((g) => String(g.chatId) === nova.destino)?.botPresente && nova.destino !== DESTINO_PREMIUM && (
            <div className="mt-3"><Aviso>O bot não está neste grupo, por isso não vai conseguir publicar. Põe-no lá primeiro.</Aviso></div>
          )}
          <p className="mt-3 text-[11px] text-zinc-500">A rota começa na mensagem mais recente da fonte. Não republica o que já lá estava.</p>
          <div className="mt-3 flex gap-2">
            <Botao tom="ouro" onClick={() => void criar()} disabled={aGravar || !nova.nome || !nova.fonte || !nova.destino}>Criar rota</Botao>
            <Botao onClick={() => setNova(null)}><X className="h-3 w-3" /> Cancelar</Botao>
          </div>
        </div>
      )}

      {rotas == null ? (
        <Vazio>{erro ? 'Sem rotas para mostrar.' : 'A ler…'}</Vazio>
      ) : rotas.length === 0 ? (
        <Vazio>Nenhuma rota. O relay não está a republicar nada.</Vazio>
      ) : (
        <div className="space-y-1.5">
          {rotas.map((r) => (
            <Faixa key={r.id} tom={r.activa ? 'ok' : 'neutro'}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-medium text-zinc-100">{r.nome}</span>
                {r.destino === DESTINO_PREMIUM && <Pilula tom="ouro">premium</Pilula>}
                {!r.activa && <Pilula tom="neutro">pausada</Pilula>}
                <span className="text-[10.5px] text-zinc-500">{NOME_FILTRO[r.filtro]}</span>
                <span className="ml-auto flex gap-1.5">
                  <Botao onClick={() => void alternar(r)} disabled={aGravar} title={r.activa ? 'Pausar' : 'Ligar'}>
                    {r.activa ? <><Pause className="h-3 w-3" /> Pausar</> : <><Play className="h-3 w-3" /> Ligar</>}
                  </Botao>
                  <Botao tom="perigo" onClick={() => void apagar(r)} disabled={aGravar} title="Apagar"><Trash2 className="h-3 w-3" /></Botao>
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-zinc-300">
                {nomeDe(r.fonte)} <span className="text-zinc-600">→</span> <span className="text-[#E9C46A]">{nomeDe(r.destino)}</span>
              </p>
              <p className="mt-0.5 text-[10.5px] text-zinc-500">mudou {fmtQuando(r.actualizado_em)}{r.notas ? ` · ${r.notas}` : ''}</p>
            </Faixa>
          ))}
        </div>
      )}
    </Painel>
  )
}
