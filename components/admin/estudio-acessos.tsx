"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AREAS_ESTUDIO, NOMES_AREAS, type AreaEstudio } from "@/lib/estudio/acesso"

type Pessoa = { user_id: string; email: string | null; nome: string | null; areas: AreaEstudio[]; atualizado_em: string }

const CURTO: Record<AreaEstudio, string> = { gravar: "Gravar", criar: "Criar", ativos: "Ativos", editor: "Editor", cortes: "Cortes" }

/**
 * Dar a alguém da equipa acesso ao /estudio, separador a separador. Quem tem acesso trabalha na
 * biblioteca da casa (takes, ativos, guiões e projectos são partilhados).
 */
export default function EstudioAcessos() {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [areas, setAreas] = useState<AreaEstudio[]>(["gravar", "editor"])
  const [aGravar, setAGravar] = useState<string | null>(null)

  const ler = useCallback(async () => {
    const r = await fetch("/api/admin/estudio-acessos", { cache: "no-store" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErro(d.error ?? "Não consegui ler os acessos.")
    else { setErro(null); setPessoas(d.pessoas ?? []) }
  }, [])
  useEffect(() => { void ler() }, [ler])

  const gravar = async (corpo: { email?: string; userId?: string; areas: AreaEstudio[] }, chave: string) => {
    setAGravar(chave)
    const r = await fetch("/api/admin/estudio-acessos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    const d = await r.json().catch(() => ({}))
    setAGravar(null)
    if (!r.ok) { setErro(d.error ?? "Não gravou."); return }
    setErro(null)
    if (corpo.email) setEmail("")
    void ler()
  }

  const alternar = (lista: AreaEstudio[], a: AreaEstudio) => (lista.includes(a) ? lista.filter((x) => x !== a) : [...lista, a])

  return (
    <div className="space-y-5 bg-[#07090d] p-4 text-sm text-gray-200">
      <div className="rounded-xl border border-white/[0.07] p-3 text-xs text-gray-400">
        <p className="font-semibold text-[#E9C46A]">Estúdio (/estudio)</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {AREAS_ESTUDIO.map((a) => <li key={a}>{NOMES_AREAS[a]}</li>)}
        </ul>
        <p className="mt-2">Quem tem acesso vê e mexe na biblioteca da casa. Os admins entram em tudo.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/[0.03] p-3"
        onSubmit={(e) => { e.preventDefault(); if (email.trim() && areas.length) void gravar({ email, areas }, "novo") }}
      >
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs text-gray-400">
          Email da pessoa (tem de ter conta no site)
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="nome@exemplo.pt" className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#D2A63C]/60" />
        </label>
        <div className="flex gap-2">
          {AREAS_ESTUDIO.map((a) => (
            <button key={a} type="button" onClick={() => setAreas(alternar(areas, a))} className={`rounded-md border px-3 py-2 text-xs ${areas.includes(a) ? "border-[#D2A63C]/60 bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-gray-400"}`}>
              {CURTO[a]}
            </button>
          ))}
        </div>
        <button type="submit" disabled={!email.trim() || !areas.length || aGravar === "novo"} className="inline-flex items-center gap-2 rounded-md bg-[#D2A63C] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">
          {aGravar === "novo" && <Loader2 className="h-3 w-3 animate-spin" />} Dar acesso
        </button>
      </form>

      {erro && <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{erro}</p>}

      {!pessoas ? (
        <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" />
      ) : pessoas.length === 0 ? (
        <p className="text-xs text-gray-500">Ainda ninguém tem acesso ao estúdio além dos admins.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07]">
          {pessoas.map((p) => (
            <li key={p.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-[200px] flex-1">
                <p className="text-gray-100">{p.nome ?? p.email ?? p.user_id.slice(0, 8)}</p>
                <p className="text-[11px] text-gray-500">{p.email} · desde {new Date(p.atualizado_em).toLocaleDateString("pt-PT")}</p>
              </div>
              {AREAS_ESTUDIO.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={aGravar === p.user_id}
                  onClick={() => void gravar({ userId: p.user_id, areas: alternar(p.areas, a) }, p.user_id)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] ${p.areas.includes(a) ? "border-[#D2A63C]/60 bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-gray-500"}`}
                  title={p.areas.includes(a) ? "Clica para tirar" : "Clica para dar"}
                >
                  {CURTO[a]}
                </button>
              ))}
              <button type="button" disabled={aGravar === p.user_id} onClick={() => { if (window.confirm("Tirar todo o acesso ao estúdio a esta pessoa?")) void gravar({ userId: p.user_id, areas: [] }, p.user_id) }} className="text-[11px] text-rose-300 hover:underline">
                Tirar acesso
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
