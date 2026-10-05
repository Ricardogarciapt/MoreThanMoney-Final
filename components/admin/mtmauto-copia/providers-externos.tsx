"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Aviso, Etiqueta, pedirAdmin, useDadosAdmin } from "./comum"

/**
 * NOVA ESTRATÉGIA (provider externo) — o MESMO modelo e a MESMA API do admin da MTM Auto
 * (/api/admin/mtmauto-copia/providers, acao 'criar'): metaapi (id colado), telegram (chat id + bot),
 * mt5 (conta directa, password cifrada). Nasce em SOMBRA: mestre SIM + mestres_estrategias + rotas +
 * canal de chat. Ligar live é o dono, no Motor das mestres.
 */
type Tipo = "metaapi" | "telegram" | "mt5"

interface Resposta { ok?: boolean; error?: string; aviso?: string | null; erro?: string; providerId?: string; mestre?: { contaMestreId: string; criada: boolean; modo: string }; rotas?: { criadas: number; actualizadas: number; retiradas: number }; canal?: { slug: string; criado: boolean } }

const CAMPO = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400"

export default function ProvidersExternos({ aoCriar }: { aoCriar?: () => void }) {
  const equipas = useDadosAdmin<{ equipas: Array<{ providers?: Array<{ id: string; slug: string; nome: string; tipo: string; canal_chat?: string | null; mt5_estado?: string | null; fonte_desligada_em?: string | null }> }> }>("/api/admin/mtmauto-copia/providers")
  const [f, setF] = useState({ slug: "", nome: "", tipo: "metaapi" as Tipo, metaapi_account_id: "", telegram_chat_id: "", telegram_chat_titulo: "", telegram_bot_id: "", login: "", servidor: "", password: "", plataforma: "mt5", canal_chat: "" })
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [registando, setRegistando] = useState<string | null>(null)

  const criar = async () => {
    setOcupado(true)
    const resp = await pedirAdmin<Resposta>("/api/admin/mtmauto-copia/providers", { method: "POST", body: { acao: "criar", ...f } })
    setOcupado(false)
    const r = resp?.data
    if (!resp?.success || !r || r.error) { setMsg({ ok: false, texto: resp?.error ?? r?.error ?? "não respondeu" }); return }
    const partes = [
      r.mestre ? `mestre ${r.mestre.contaMestreId.slice(0, 8)} (${r.mestre.criada ? "criada" : "existente"}, ${r.mestre.modo})` : null,
      r.rotas ? `rotas +${r.rotas.criadas}/~${r.rotas.actualizadas}/−${r.rotas.retiradas}` : null,
      r.canal ? `canal ${r.canal.slug}${r.canal.criado ? " (criado)" : ""}` : null,
      r.aviso ?? null, r.erro ?? null,
    ].filter(Boolean)
    setMsg({ ok: r.ok !== false, texto: partes.join(" · ") })
    setF({ ...f, slug: "", nome: "", metaapi_account_id: "", telegram_chat_id: "", telegram_chat_titulo: "", login: "", servidor: "", password: "" })
    equipas.recarregar()
    aoCriar?.()
  }
  const registar = async (id: string) => {
    setRegistando(id)
    const resp = await pedirAdmin<Resposta>("/api/admin/mtmauto-copia/providers", { method: "POST", body: { acao: "registar", providerId: id } })
    setRegistando(null)
    const r = resp?.data
    setMsg({ ok: Boolean(resp?.success && r?.ok), texto: resp?.error ?? r?.error ?? r?.erro ?? (r?.rotas ? `rotas +${r.rotas.criadas}/~${r.rotas.actualizadas}/−${r.rotas.retiradas} · canal ${r.canal?.slug ?? "—"}` : "ok") })
    equipas.recarregar()
  }

  const c = (k: keyof typeof f, rotulo: string, tipo = "text", nota?: string) => (
    <label className="block">
      <span className="text-[11px] text-zinc-400">{rotulo}</span>
      <input type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={CAMPO} autoComplete="off" />
      {nota && <span className="block text-[10px] text-zinc-500">{nota}</span>}
    </label>
  )

  return (
    <div className="space-y-3">
      <Aviso tom="info">Tudo o que se cria aqui nasce em <b>sombra</b> (mestre SIM, rotas, canal de chat). Ligar live é no «Motor das mestres», com a palavra de confirmação. A MetaApi só se usa para entregar aos clientes — uma fonte MetaApi é lida pelo streaming que já existe.</Aviso>
      <div className="grid gap-2 md:grid-cols-3">
        {c("slug", "Slug")}
        {c("nome", "Nome")}
        <label className="block">
          <span className="text-[11px] text-zinc-400">Tipo</span>
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Tipo })} className={CAMPO}>
            <option value="metaapi">Conta MetaApi (id colado)</option>
            <option value="telegram">Canal de Telegram (chat id)</option>
            <option value="mt5">Conta MT5 directa (sem MetaApi)</option>
          </select>
        </label>
        {f.tipo === "metaapi" && c("metaapi_account_id", "Id da conta MetaApi (36 caracteres)", "text", "Validado só em leitura (accountInformation) com a chave da casa.")}
        {f.tipo === "telegram" && (<>
          {c("telegram_chat_id", "Chat id (numérico, ex.: -1001234567890)")}
          {c("telegram_chat_titulo", "Título do chat")}
          {c("telegram_bot_id", "Bot que escuta (id em mtmauto_telegram_bots)", "text", "Vazio = nada escuta até um bot da casa entrar no chat.")}
        </>)}
        {f.tipo === "mt5" && (<>
          {c("login", "Login")}
          {c("servidor", "Servidor")}
          {c("password", "Password de trading", "password", "Guardada cifrada (AES-256-GCM). Nunca mostrada.")}
        </>)}
        {c("canal_chat", "Canal de chat (opcional)", "text", "Vazio = derivado: canal da fonte MTM, senão sinais-<slug>.")}
      </div>
      {f.tipo === "mt5" && <Aviso tom="aviso">A casa ainda não tem caminho de produção para ler uma conta MT5 sem MetaApi: a estratégia fica «por ligar» até o dono decidir o conector. Nada é lido nem executado.</Aviso>}
      <div className="flex items-center gap-2">
        <button onClick={criar} disabled={ocupado || !f.slug || !f.nome} className="rounded-md bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-40">
          {ocupado ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Criar em sombra"}
        </button>
        {msg && <span className={`text-[12px] ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.texto}</span>}
      </div>
      {equipas.dados && (
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500">Providers existentes — «registar» mete na cadeia os que ainda não têm mestre/rotas/canal (idempotente).</p>
          {equipas.dados.equipas.flatMap((e) => e.providers ?? []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-zinc-100">{p.nome}</span>
              <span className="text-zinc-500">{p.slug} · {p.tipo}</span>
              {p.canal_chat && <Etiqueta tom="info">{p.canal_chat}</Etiqueta>}
              {p.mt5_estado === "por_ligar" && <Etiqueta tom="aviso">MT5 por ligar</Etiqueta>}
              {p.fonte_desligada_em && <Etiqueta tom="grave">fonte desligada</Etiqueta>}
              <button onClick={() => registar(p.id)} disabled={registando === p.id} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 disabled:opacity-40">{registando === p.id ? "…" : "registar na cadeia"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
