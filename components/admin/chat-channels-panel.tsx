"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, RefreshCw, ExternalLink, CheckCircle, AlertTriangle, ArrowUp, ArrowDown, Lock, PenLine } from "lucide-react"
import Link from "next/link"
import { DEFAULT_CHAT_CHANNELS } from "@/lib/default-chat-channels"
import { metaDoCanal } from "@/components/mobile/chat-channel-meta"
import { nivelEscrita, nivelLeitura, requiresBrokerUidChannel } from "@/lib/chat-channel-permissions"
import { useToast } from "@/hooks/use-toast"

/**
 * Canais do chat — o que aqui se configura é o que as TRÊS apps mostram e aplicam (app-mobile/
 * Android pela web, iOS nativo por /api/chat/canais e pela RLS): nome, descrição, ordem, escondido,
 * ícone, cor, etiqueta, regras e quem lê / quem escreve. Campos vazios = a regra de sempre.
 */
interface ChatChannelRow {
  id?: string
  slug: string
  name: string
  description: string | null
  parent_slug: string | null
  position: number
  /** Escondido nas apps — mantém o histórico, sai da lista. */
  hidden?: boolean
  icone?: string | null
  cor?: string | null
  etiqueta?: string | null
  regras?: string[] | null
  leitura?: string | null
  escrita?: string | null
  exige_uid_corretora?: boolean | null
}

interface Rascunho {
  name: string
  description: string
  icone: string
  cor: string
  etiqueta: string
  regras: string
  leitura: string
  escrita: string
  uid: "" | "sim" | "nao"
  position: string
}

const LEITURA_ROTULO: Record<string, string> = { membros: "Membros", premium: "Premium/VIP", admin: "Só admin" }
const ESCRITA_ROTULO: Record<string, string> = { membros: "Membros", vip: "VIP e admin", ninguem: "Só o sistema" }

function rascunhoDe(c: ChatChannelRow): Rascunho {
  return {
    name: c.name,
    description: c.description ?? "",
    icone: c.icone ?? "",
    cor: c.cor ?? "",
    etiqueta: c.etiqueta ?? "",
    regras: (c.regras ?? []).join("\n"),
    leitura: c.leitura ?? "",
    escrita: c.escrita ?? "",
    uid: c.exige_uid_corretora === true ? "sim" : c.exige_uid_corretora === false ? "nao" : "",
    position: String(c.position ?? 0),
  }
}

export default function ChatChannelsPanel() {
  const { toast } = useToast()
  const [channels, setChannels] = useState<ChatChannelRow[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [aEditar, setAEditar] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/sync-chat-channels")
      const data = await res.json()
      if (data.success) {
        setChannels(data.channels || [])
        setMissing(data.missing || [])
        setSynced(data.synced ?? false)
      }
    } catch {
      toast({ title: "Erro ao carregar canais", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/sync-chat-channels", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Canais sincronizados", description: data.message })
        await load()
      } else {
        toast({ title: "Erro", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erro ao sincronizar", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  const leafChannels = DEFAULT_CHAT_CHANNELS.filter((c) => c.parent_slug !== null)

  /**
   * A lista é a da BASE DE DADOS, não a das constantes — mais o que devia existir e falta.
   * Ordenada como as apps a mostram (grupo, posição, nome).
   */
  const ordemDoGrupo = (slug: string | null) => channels.find((p) => p.slug === slug)?.position ?? 0
  const existentes = channels
    .filter((c) => c.parent_slug !== null)
    .sort(
      (a, b) =>
        ordemDoGrupo(a.parent_slug) - ordemDoGrupo(b.parent_slug) ||
        a.position - b.position ||
        a.name.localeCompare(b.name, "pt"),
    )
  const emFalta = leafChannels.filter((e) => !channels.some((c) => c.slug === e.slug))

  const guardar = async (slug: string, patch: Record<string, unknown>, silencioso = false) => {
    setAGuardar(slug)
    try {
      const res = await fetch("/api/admin/sync-chat-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...patch }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "não guardou")
      await load()
      if (!silencioso) toast({ title: "Canal atualizado" })
      return true
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao guardar", variant: "destructive" })
      return false
    } finally {
      setAGuardar(null)
    }
  }

  /** Troca a posição com o vizinho do mesmo grupo (as apps ordenam por posição). */
  const mover = async (c: ChatChannelRow, delta: -1 | 1) => {
    const irmaos = existentes.filter((x) => x.parent_slug === c.parent_slug)
    const i = irmaos.findIndex((x) => x.slug === c.slug)
    const outro = irmaos[i + delta]
    if (!outro) return
    const a = c.position
    const b = outro.position === a ? a + delta : outro.position
    await guardar(c.slug, { position: b }, true)
    await guardar(outro.slug, { position: a }, true)
  }

  const guardarRascunho = async (slug: string) => {
    if (!rascunho) return
    const ok = await guardar(slug, {
      name: rascunho.name,
      description: rascunho.description,
      icone: rascunho.icone,
      cor: rascunho.cor,
      etiqueta: rascunho.etiqueta,
      regras: rascunho.regras.split("\n").map((r) => r.trim()).filter(Boolean),
      leitura: rascunho.leitura,
      escrita: rascunho.escrita,
      exige_uid_corretora: rascunho.uid === "" ? null : rascunho.uid === "sim",
      position: Number(rascunho.position) || 0,
    })
    if (ok) {
      setAEditar(null)
      setRascunho(null)
    }
  }

  const campo = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {synced ? (
            <Badge className="bg-green-500/20 text-green-400">
              <CheckCircle className="w-3 h-3 mr-1" />
              Todos os canais existem
            </Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {missing.length > 0 ? `Faltam ${missing.length} canais` : "Verificar"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/app-mobile?tab=chat" target="_blank">
            <Button size="sm" variant="outline" className="border-[#D2A63C]/40">
              <ExternalLink className="w-3 h-3 mr-1" />
              Ver na app
            </Button>
          </Link>
          <Button size="sm" onClick={handleSync} disabled={syncing} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
            {syncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
            Criar canais em falta
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-[#D2A63C]" />
        </div>
      ) : (
        <div className="space-y-2">
          {existentes.map((c, idx) => {
            const meta = metaDoCanal(c)
            const emEdicao = aEditar === c.slug && rascunho
            const leitura = nivelLeitura(c.slug, c)
            const escrita = nivelEscrita(c.slug, c)
            const uid = requiresBrokerUidChannel(c.slug, c)
            const grupoAnterior = idx > 0 ? existentes[idx - 1]!.parent_slug : null
            return (
              <div key={c.slug}>
                {grupoAnterior !== c.parent_slug && (
                  <p className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {channels.find((p) => p.slug === c.parent_slug)?.name ?? c.parent_slug}
                  </p>
                )}
                <div
                  className={`rounded-lg border p-3 ${
                    c.hidden ? "border-gray-700/50 bg-gray-900/40 opacity-70" : "border-gray-700/50 bg-gray-800/30"
                  }`}
                >
                  {emEdicao ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[64px_1fr] gap-2">
                        <input value={rascunho.icone} onChange={(e) => setRascunho({ ...rascunho, icone: e.target.value })} placeholder={meta.emoji} className={`${campo} text-center text-lg`} aria-label="Ícone" />
                        <input value={rascunho.name} onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} placeholder="Nome do canal" className={campo} />
                      </div>
                      <input value={rascunho.description} onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })} placeholder="Descrição (o que se lê por baixo do nome, na app)" className={campo} />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={rascunho.etiqueta} onChange={(e) => setRascunho({ ...rascunho, etiqueta: e.target.value })} placeholder={meta.tag ?? "Etiqueta"} className={campo} aria-label="Etiqueta" />
                        <div className="flex items-center gap-2">
                          <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(rascunho.cor) ? rascunho.cor : meta.accent} onChange={(e) => setRascunho({ ...rascunho, cor: e.target.value })} className="h-9 w-10 rounded border border-gray-700 bg-gray-950" aria-label="Cor" />
                          <input value={rascunho.cor} onChange={(e) => setRascunho({ ...rascunho, cor: e.target.value })} placeholder={meta.accent} className={campo} />
                        </div>
                        <input type="number" value={rascunho.position} onChange={(e) => setRascunho({ ...rascunho, position: e.target.value })} className={campo} aria-label="Ordem" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[11px] text-gray-400">
                          Quem lê
                          <select value={rascunho.leitura} onChange={(e) => setRascunho({ ...rascunho, leitura: e.target.value })} className={campo}>
                            <option value="">Regra de sempre ({LEITURA_ROTULO[nivelLeitura(c.slug)]})</option>
                            <option value="membros">Membros</option>
                            <option value="premium">Premium/VIP</option>
                            <option value="admin">Só admin</option>
                          </select>
                        </label>
                        <label className="text-[11px] text-gray-400">
                          Quem publica
                          <select value={rascunho.escrita} onChange={(e) => setRascunho({ ...rascunho, escrita: e.target.value })} className={campo}>
                            <option value="">Regra de sempre ({ESCRITA_ROTULO[nivelEscrita(c.slug)]})</option>
                            <option value="membros">Membros</option>
                            <option value="vip">VIP e admin</option>
                            <option value="ninguem">Só o sistema</option>
                          </select>
                        </label>
                        <label className="text-[11px] text-gray-400">
                          Pede UID corretora
                          <select value={rascunho.uid} onChange={(e) => setRascunho({ ...rascunho, uid: e.target.value as Rascunho["uid"] })} className={campo}>
                            <option value="">Regra de sempre ({requiresBrokerUidChannel(c.slug) ? "sim" : "não"})</option>
                            <option value="sim">Sim</option>
                            <option value="nao">Não</option>
                          </select>
                        </label>
                      </div>
                      <textarea
                        value={rascunho.regras}
                        onChange={(e) => setRascunho({ ...rascunho, regras: e.target.value })}
                        placeholder={meta.rules.join("\n")}
                        rows={3}
                        className={campo}
                        aria-label="Regras (uma por linha)"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-[#D2A63C] text-black hover:bg-[#BB8525]" disabled={aGuardar === c.slug || !rascunho.name.trim()} onClick={() => guardarRascunho(c.slug)}>
                          Guardar
                        </Button>
                        <Button size="sm" variant="outline" className="border-gray-700" onClick={() => { setAEditar(null); setRascunho(null) }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                          style={{ backgroundColor: `${meta.accent}20`, border: `1px solid ${meta.accent}40` }}
                        >
                          {meta.emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">
                            {c.name}
                            <span className="text-gray-500 font-mono text-xs ml-2">#{c.slug}</span>
                            {c.hidden && <span className="ml-2 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">escondido</span>}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {meta.tag ? `${meta.tag} · ` : ""}
                            {c.description ?? "—"}
                          </p>
                          <p className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-gray-400">
                            <span className="inline-flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5"><Lock className="h-3 w-3" />{LEITURA_ROTULO[leitura]}</span>
                            <span className="inline-flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5"><PenLine className="h-3 w-3" />{ESCRITA_ROTULO[escrita]}</span>
                            {uid && <span className="rounded bg-gray-800 px-1.5 py-0.5">UID corretora</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={aGuardar !== null} onClick={() => mover(c, -1)} aria-label="Subir">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={aGuardar !== null} onClick={() => mover(c, 1)} aria-label="Descer">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 border-gray-700 text-xs" onClick={() => { setAEditar(c.slug); setRascunho(rascunhoDe(c)) }}>
                          Editar
                        </Button>
                        {/* Esconder mantém as mensagens: o canal sai das apps, o histórico fica. */}
                        <Button size="sm" variant="outline" className="h-7 border-gray-700 text-xs" disabled={aGuardar === c.slug} onClick={() => guardar(c.slug, { hidden: !c.hidden })}>
                          {c.hidden ? "Mostrar" : "Esconder"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {emFalta.map((e) => (
            <div key={e.slug} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              {e.name} <span className="font-mono text-xs text-amber-400/70">#{e.slug}</span> — em falta (usa «Criar canais em falta»)
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        O que se configura aqui é o que a app-mobile, o Android e o iOS mostram: nome, ícone, cor, etiqueta, ordem,
        descrição, regras, escondido e quem lê / quem publica. Campos vazios usam a regra de sempre. «Criar canais em
        falta» só cria — nunca reescreve o que já foi editado.
      </p>
    </div>
  )
}
