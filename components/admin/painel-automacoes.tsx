"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Plus, Trash2, Zap, MessageCircle, Send, Instagram, Sparkles, Clock, X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

/**
 * As automações — o que substituiu o ManyChat (retirado a 04/10/2026).
 *
 * Três coisas foram tiradas do `insta-p8` (ver a memória `referencias-manychat-funis`) porque
 * resolvem problemas reais que a nossa primeira versão não resolvia:
 *
 *  · as palavras-gatilho são ETIQUETAS, não um campo de texto. Uma regra costuma responder a
 *    "app", "APP" e "quero a app" — obrigar a criar três regras é obrigar a mantê-las três vezes;
 *  · as respostas públicas RODAM. Responder a cinquenta comentários com a mesma frase faz a
 *    conta parecer um robô, e é o próprio Instagram a despromover conteúdo com respostas
 *    repetidas;
 *  · o SEGUIMENTO tem espera. É no segundo toque que a maior parte da conversão acontece, e era
 *    exactamente o que não existia.
 *
 * As regras nascem desligadas. Uma automação que começa a responder no instante em que é criada
 * não dá a ninguém a hipótese de a ler primeiro.
 */

interface Passo {
  esperaMin: number
  texto: string
}

interface Automacao {
  id: string
  nome: string
  canal: "instagram_comentario" | "instagram_dm" | "telegram" | "email"
  gatilho: "palavra" | "qualquer" | "comando" | "entrada"
  valor: string | null
  respostaTipo: "texto" | "ia" | "fluxo"
  resposta: { texto?: string; instrucao?: string; url?: string; publicas?: string[] } | null
  seguimento: Passo[] | null
  ativa: boolean
  disparos: number
  ultimoDisparo: string | null
}

const CANAIS = [
  { id: "telegram", rotulo: "Telegram", Icone: Send, nota: "A funcionar — é o nosso bot." },
  { id: "instagram_comentario", rotulo: "Comentários IG", Icone: MessageCircle, nota: "Precisa da permissão instagram_manage_comments." },
  { id: "instagram_dm", rotulo: "DM do Instagram", Icone: Instagram, nota: "Precisa de instagram_manage_messages — a Meta só a dá a apps revistas." },
] as const

/** Palavras como etiquetas: escreve e Enter. Guardadas como uma lista separada por vírgulas. */
function Etiquetas({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [rascunho, setRascunho] = useState("")
  const lista = valor.split(",").map((x) => x.trim()).filter(Boolean)

  return (
    <div className="mt-1 rounded-md border p-1.5">
      <div className="flex flex-wrap gap-1">
        {lista.map((p) => (
          <span key={p} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11.5px]">
            {p}
            <button onClick={() => aoMudar(lista.filter((x) => x !== p).join(", "))} className="text-neutral-400 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !rascunho.trim()) return
            e.preventDefault()
            // Sem repetidas: a mesma palavra duas vezes não dispara duas, só polui a lista.
            if (!lista.includes(rascunho.trim())) aoMudar([...lista, rascunho.trim()].join(", "))
            setRascunho("")
          }}
          placeholder={lista.length ? "" : "escreve e Enter — ex.: app, quero a app"}
          className="min-w-[140px] flex-1 bg-transparent px-1 text-[12.5px] outline-none"
        />
      </div>
    </div>
  )
}

export function PainelAutomacoes() {
  const { toast } = useToast()
  const [lista, setLista] = useState<Automacao[]>([])
  const [aLer, setALer] = useState(true)
  const [canal, setCanal] = useState<(typeof CANAIS)[number]["id"]>("telegram")
  const [aberta, setAberta] = useState<Automacao | null>(null)
  const [aGravar, setAGravar] = useState(false)

  const chamar = useCallback(async (init?: RequestInit) => {
    const tok = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch("/api/admin/social/automacoes", {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}`, ...(init?.headers ?? {}) },
      cache: "no-store",
    })
    const j = await r.json()
    if (!r.ok || j.error) throw new Error(j.error || "Falhou")
    return j as { automacoes: Automacao[] }
  }, [])

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      setLista((await chamar()).automacoes)
    } catch (e) {
      toast({ title: "Não deu para ler", description: (e as Error).message, variant: "destructive" })
    } finally {
      setALer(false)
    }
  }, [chamar, toast])

  useEffect(() => { carregar() }, [carregar])

  const criar = async () => {
    try {
      const j = await chamar({
        method: "POST",
        body: JSON.stringify({ nome: "Nova regra", canal, gatilho: "palavra", valor: "", respostaTipo: "texto", resposta: { texto: "" } }),
      })
      setLista(j.automacoes)
      setAberta(j.automacoes.find((a) => a.nome === "Nova regra") ?? null)
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    }
  }

  const gravar = async (a: Automacao) => {
    setAGravar(true)
    try {
      setLista((await chamar({ method: "PATCH", body: JSON.stringify(a) })).automacoes)
      toast({ title: "Guardada" })
      setAberta(null)
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGravar(false)
    }
  }

  const alternar = async (a: Automacao) => {
    try {
      setLista((await chamar({ method: "PATCH", body: JSON.stringify({ id: a.id, ativa: !a.ativa }) })).automacoes)
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    }
  }

  /** O DELETE leva o id na query, por isso não passa pelo `chamar` (que só trata do corpo). */
  const apagar = async (id: string) => {
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch(`/api/admin/social/automacoes?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok}` },
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || "Falhou")
      setLista(j.automacoes)
    } catch (e) {
      toast({ title: "Não deu para apagar", description: (e as Error).message, variant: "destructive" })
    }
  }

  const doCanal = lista.filter((a) => a.canal === canal)
  const infoCanal = CANAIS.find((c) => c.id === canal)!

  if (aLer) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {CANAIS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCanal(c.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              canal === c.id ? "bg-neutral-900 text-white" : "border bg-white text-neutral-400"
            }`}
          >
            <c.Icone className="h-3.5 w-3.5" />
            {c.rotulo}
            <span className="opacity-60">{lista.filter((a) => a.canal === c.id).length}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Button size="sm" onClick={criar}><Plus className="mr-1 h-3.5 w-3.5" /> Nova regra</Button>
      </div>

      {/* O que este canal consegue mesmo fazer. Uma automação que parece ligada e não responde é
          pior do que uma que diz que não pode. */}
      <p className="rounded-lg bg-neutral-50 p-2.5 text-[11.5px] text-neutral-400">{infoCanal.nota}</p>

      {doCanal.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 py-12 text-center text-sm text-neutral-400">
          Sem regras neste canal.
        </p>
      ) : (
        <div className="space-y-2">
          {doCanal.map((a) => (
            <div key={a.id} className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setAberta(a)}>
                  <p className="text-sm font-semibold">{a.nome}</p>
                  <p className="mt-0.5 text-[11.5px] text-neutral-400">
                    {a.gatilho === "palavra" ? `palavras: ${a.valor || "—"}` : a.gatilho}
                    {" · "}
                    {a.respostaTipo === "ia" ? "resposta por IA" : "resposta fixa"}
                    {a.seguimento?.length ? ` · ${a.seguimento.length} seguimento(s)` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    {a.disparos} disparo(s)
                    {a.ultimoDisparo ? ` · último ${new Date(a.ultimoDisparo).toLocaleString("pt-PT")}` : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => alternar(a)}
                    title={a.ativa ? "A responder" : "Parada"}
                    className={`h-6 w-11 rounded-full transition-colors ${a.ativa ? "bg-emerald-500" : "bg-neutral-300"}`}
                  >
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${a.ativa ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => apagar(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {aberta && (
        <Editor
          a={aberta}
          aGravar={aGravar}
          aoFechar={() => setAberta(null)}
          aoGuardar={gravar}
        />
      )}
    </div>
  )
}

function Editor({
  a: inicial,
  aGravar,
  aoFechar,
  aoGuardar,
}: {
  a: Automacao
  aGravar: boolean
  aoFechar: () => void
  aoGuardar: (a: Automacao) => void
}) {
  const [a, setA] = useState<Automacao>(inicial)
  const publicas = a.resposta?.publicas ?? []

  const mexer = (patch: Partial<Automacao>) => setA({ ...a, ...patch })
  const mexerResposta = (patch: Partial<NonNullable<Automacao["resposta"]>>) =>
    setA({ ...a, resposta: { ...(a.resposta ?? {}), ...patch } })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-semibold">Regra</p>
          <button onClick={aoFechar} className="text-neutral-400 hover:text-neutral-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-400">Nome</label>
            <Input value={a.nome} onChange={(e) => mexer({ nome: e.target.value })} />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Quando dispara</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {(["palavra", "qualquer", "comando"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => mexer({ gatilho: g })}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] ${a.gatilho === g ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
                >
                  {g === "palavra" ? "Palavra-chave" : g === "qualquer" ? "Qualquer mensagem" : "Comando /"}
                </button>
              ))}
            </div>
          </div>

          {(a.gatilho === "palavra" || a.gatilho === "comando") && (
            <div>
              <label className="text-xs text-neutral-400">
                Palavras que disparam — uma regra costuma responder a várias
              </label>
              <Etiquetas valor={a.valor ?? ""} aoMudar={(v) => mexer({ valor: v })} />
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-400">O que responde</label>
            <div className="mt-1 flex gap-1">
              {(["texto", "ia"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => mexer({ respostaTipo: t })}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] ${a.respostaTipo === t ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
                >
                  {t === "ia" ? <><Sparkles className="h-3 w-3" /> Escrita por IA</> : "Texto fixo"}
                </button>
              ))}
            </div>
          </div>

          {a.respostaTipo === "texto" ? (
            <textarea
              value={a.resposta?.texto ?? ""}
              onChange={(e) => mexerResposta({ texto: e.target.value })}
              rows={5}
              placeholder="A mensagem que sai."
              className="w-full rounded-md border p-2 text-sm"
            />
          ) : (
            <>
              <textarea
                value={a.resposta?.instrucao ?? ""}
                onChange={(e) => mexerResposta({ instrucao: e.target.value })}
                rows={3}
                placeholder="O que a IA deve fazer — ex.: perceber se quer manual ou automático e encaminhar."
                className="w-full rounded-md border p-2 text-sm"
              />
              <p className="text-[11px] text-neutral-400">
                A IA não recebe números de desempenho: não os tem e inventá-los destrói a confiança.
                O texto fixo abaixo é a rede de segurança quando ela não responde.
              </p>
              <textarea
                value={a.resposta?.texto ?? ""}
                onChange={(e) => mexerResposta({ texto: e.target.value })}
                rows={3}
                placeholder="Resposta de reserva."
                className="w-full rounded-md border p-2 text-sm"
              />
            </>
          )}

          {a.canal === "instagram_comentario" && (
            <div>
              <label className="text-xs text-neutral-400">
                Respostas públicas ao comentário — rodam, uma de cada vez
              </label>
              <div className="mt-1 space-y-1">
                {publicas.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <Input
                      value={p}
                      onChange={(e) => {
                        const n = [...publicas]
                        n[i] = e.target.value
                        mexerResposta({ publicas: n })
                      }}
                    />
                    <Button size="icon" variant="ghost" className="text-red-500" onClick={() => mexerResposta({ publicas: publicas.filter((_, j) => j !== i) })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => mexerResposta({ publicas: [...publicas, ""] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Acrescentar
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                Cinquenta comentários com a mesma frase fazem a conta parecer um robô — e o
                Instagram despromove conteúdo com respostas repetidas.
              </p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5" /> Seguimento — é no segundo toque que a conversão acontece
            </label>
            <div className="mt-1 space-y-1.5">
              {(a.seguimento ?? []).map((p, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    type="number"
                    value={p.esperaMin}
                    onChange={(e) => {
                      const n = [...(a.seguimento ?? [])]
                      n[i] = { ...p, esperaMin: Number(e.target.value) }
                      mexer({ seguimento: n })
                    }}
                    className="w-24"
                    title="minutos de espera"
                  />
                  <Input
                    value={p.texto}
                    onChange={(e) => {
                      const n = [...(a.seguimento ?? [])]
                      n[i] = { ...p, texto: e.target.value }
                      mexer({ seguimento: n })
                    }}
                    placeholder="o que se diz a seguir"
                  />
                  <Button size="icon" variant="ghost" className="text-red-500" onClick={() => mexer({ seguimento: (a.seguimento ?? []).filter((_, j) => j !== i) })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => mexer({ seguimento: [...(a.seguimento ?? []), { esperaMin: 60, texto: "" }] })}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Acrescentar passo
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={() => aoGuardar(a)} disabled={aGravar}>
            <Zap className="mr-1 h-3.5 w-3.5" /> {aGravar ? "A guardar…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
