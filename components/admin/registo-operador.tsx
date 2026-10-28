"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Loader2, Play, RefreshCw, Undo2 } from "lucide-react"

/**
 * O registo do agente operador (AG-OPERADOR) e do agente do Mac: o que fizeram por ti no social,
 * na máquina de vendas e no radar. Tu auditas aqui e desfazes o que não quiseres.
 * Ver lib/operador/regras.ts.
 */

interface Linha {
  id: string
  criado_em: string
  agente: string
  area: "posts" | "envios" | "comentarios"
  acao: string
  resumo: string
  motivo: string | null
  modo: "ensaio" | "feito"
  desfeito_em: string | null
}
interface Config {
  modo: "ensaio" | "ligado" | "desligado"
  posts: boolean
  envios: boolean
  comentarios: boolean
}

const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"

const AREA: Record<Linha["area"], string> = { posts: "Posts", envios: "Mensagens", comentarios: "Comentários" }
const MODO: Record<Config["modo"], string> = {
  ensaio: "Em ensaio: escreve o que faria, não muda nada",
  ligado: "Ligado: faz sozinho e regista aqui",
  desligado: "Desligado",
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })

export function RegistoOperador({ compacto = false }: { compacto?: boolean }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [cfg, setCfg] = useState<Config | null>(null)
  const [aLer, setALer] = useState(true)
  const [aCorrer, setACorrer] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<"todas" | Linha["area"]>("todas")

  const buscar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/operador", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setLinhas(j.linhas as Linha[])
        setCfg(j.config as Config)
      }
    } catch { /* fica como está */ }
    setALer(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  const pedir = async (corpo: Record<string, unknown>) => {
    const r = await fetch("/api/admin/operador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
    return r.json().catch(() => ({ ok: false }))
  }

  const mudarModo = async (modo: Config["modo"]) => {
    const j = await pedir({ acao: "config", modo })
    if (j.ok) setCfg(j.config)
  }

  const visiveis = linhas.filter((l) => filtro === "todas" || l.area === filtro).slice(0, compacto ? 8 : 60)

  return (
    <section
      aria-labelledby="operador-titulo"
      className="rounded-xl border p-4"
      style={{ borderColor: `${OURO}55`, background: "linear-gradient(180deg, #17140c 0%, #0f0f0f 100%)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="operador-titulo" className="flex items-center gap-2 text-sm font-semibold" style={{ color: OURO_CLARO }}>
            <Bot className="h-4 w-4" aria-hidden="true" /> O que os agentes fizeram por ti
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-neutral-400">
            De meia em meia hora, das 8h às 22h, o AG-OPERADOR aprova os posts do @morethanmoney.pt que
            passam nas regras da casa, deixa sair as mensagens por aprovar depois de 3 h à tua espera e
            tira da fila os comentários velhos. O agente do Mac publica os comentários. Nunca toca no
            @ricardogarciapt. Lê, e carrega em «Desfazer» no que não quiseres.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setACorrer(true)
              const j = await pedir({ acao: "correr" })
              setAviso(j.ok ? `Passagem feita: ${j.posts} posts, ${j.envios} mensagens, ${j.comentarios} comentários.` : "A passagem falhou.")
              await buscar()
              setACorrer(false)
            }}
            disabled={aCorrer}
            className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 px-3 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
          >
            {aCorrer ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            Correr agora
          </button>
          <button
            onClick={() => void buscar()}
            disabled={aLer}
            aria-label="Actualizar o registo"
            className="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            {aLer ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {cfg && (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Modo do agente">
          {(["ensaio", "ligado", "desligado"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={cfg.modo === m}
              onClick={() => void mudarModo(m)}
              className="min-h-[32px] cursor-pointer rounded-full border px-3 text-[12px] transition-colors"
              style={
                cfg.modo === m
                  ? { background: OURO, borderColor: OURO, color: "#000" }
                  : { borderColor: "#404040", color: "#d4d4d4" }
              }
            >
              {m === "ensaio" ? "Ensaio" : m === "ligado" ? "Ligado" : "Desligado"}
            </button>
          ))}
          <span className="text-[12px] text-neutral-400">{MODO[cfg.modo]}</span>
        </div>
      )}

      {!compacto && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["todas", "posts", "envios", "comentarios"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`cursor-pointer rounded px-2 py-0.5 text-[11px] ${filtro === f ? "bg-neutral-700 text-neutral-100" : "text-neutral-400 hover:bg-neutral-800"}`}
            >
              {f === "todas" ? "Tudo" : AREA[f]}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-2 divide-y divide-neutral-800" aria-live="polite">
        {!aLer && visiveis.length === 0 && (
          <li className="py-4 text-center text-sm text-neutral-400">Ainda nada. A primeira passagem escreve aqui.</li>
        )}
        {visiveis.map((l) => (
          <li key={l.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1 py-2 ${l.desfeito_em ? "opacity-50" : ""}`}>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-neutral-500">{hora(l.criado_em)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-100">
                {l.modo === "ensaio" && <span className="mr-1.5 rounded bg-neutral-800 px-1.5 text-[10.5px] text-neutral-300">faria</span>}
                {l.resumo}
              </p>
              <p className="text-[11px] text-neutral-500">
                {AREA[l.area]} · {l.agente}
                {l.motivo ? ` · ${l.motivo}` : ""}
                {l.desfeito_em ? ` · desfeito ${hora(l.desfeito_em)}` : ""}
              </p>
            </div>
            {l.modo === "feito" && !l.desfeito_em && l.area !== "envios" && (l.acao === "aprovar" || l.acao === "saltar") && (
              <button
                onClick={async () => {
                  const j = await pedir({ acao: "desfazer", id: l.id })
                  setAviso(j.ok ? "Desfeito." : j.erro ?? "Não deu para desfazer.")
                  await buscar()
                }}
                className="flex min-h-[32px] cursor-pointer items-center gap-1 rounded-lg border border-neutral-700 px-2.5 text-[11.5px] text-neutral-200 hover:bg-neutral-800"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Desfazer
              </button>
            )}
          </li>
        ))}
      </ul>

      {aviso && (
        <p role="status" className="mt-2 text-[12px]" style={{ color: OURO_CLARO }}>
          {aviso}
        </p>
      )}
    </section>
  )
}
