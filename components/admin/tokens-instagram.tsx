"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

/**
 * Estado dos tokens do Instagram, e onde colar um novo.
 *
 * Vale a pena estar à vista: um token expirado não parte nada com estrondo — a publicação
 * simplesmente não acontece e o painel de conteúdo continua com o mesmo ar de sempre.
 */

interface Conta {
  conta: string
  username: string
  variavel: string
  temToken: boolean
  ok: boolean
  motivo?: string
  expiraEm?: string | null
  diasQueFaltam?: number | null
  permissoes?: string[]
}

/** O que é preciso para o que fazemos: publicar, ler comentários e responder. */
const PERMISSOES_PRECISAS = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "pages_show_list",
]

export function TokensInstagram() {
  const [contas, setContas] = useState<Conta[]>([])
  const [carregar, setCarregar] = useState(true)
  const [novo, setNovo] = useState<Record<string, string>>({})
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregar(true)
    try {
      const r = await fetch("/api/admin/ig-tokens", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) setContas(j.contas as Conta[])
    } catch {
      setErro("Não foi possível ler o estado dos tokens")
    }
    setCarregar(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  const guardar = async (variavel: string) => {
    setAGuardar(variavel)
    setErro(null)
    try {
      const r = await fetch("/api/admin/ig-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variavel, token: novo[variavel] ?? "" }),
      })
      const j = await r.json()
      if (j.ok) {
        setContas(j.contas as Conta[])
        setNovo((n) => ({ ...n, [variavel]: "" }))
      } else {
        setErro(j.erro ?? "Não guardou")
      }
    } catch {
      setErro("Não guardou")
    }
    setAGuardar(null)
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-neutral-100">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Tokens do Instagram</h2>
        <button onClick={() => void buscar()} disabled={carregar} className="rounded-lg bg-neutral-700 p-1.5 hover:bg-neutral-600 disabled:opacity-40">
          {carregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {erro && <p className="mb-2 text-xs text-red-400">{erro}</p>}

      <div className="space-y-3">
        {contas.map((c) => {
          const faltam = c.permissoes?.length ? PERMISSOES_PRECISAS.filter((p) => !c.permissoes?.includes(p)) : []
          return (
            <div key={c.variavel} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">@{c.username}</span>
                {c.ok ? (
                  <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-300">a funcionar</span>
                ) : (
                  <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-[11px] text-red-300">
                    {c.motivo ?? "não funciona"}
                  </span>
                )}
                {c.diasQueFaltam != null && (
                  <span className={`text-[11px] ${c.diasQueFaltam < 10 ? "text-amber-300" : "text-neutral-500"}`}>
                    expira em {c.diasQueFaltam} dias
                  </span>
                )}
                {c.expiraEm === null && c.ok && (
                  <span className="text-[11px] text-neutral-500">não expira</span>
                )}
              </div>

              {faltam.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Faltam permissões: {faltam.join(", ")} — sem elas, essa parte fica calada.
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={novo[c.variavel] ?? ""}
                  onChange={(e) => setNovo((n) => ({ ...n, [c.variavel]: e.target.value }))}
                  placeholder="colar token novo"
                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => void guardar(c.variavel)}
                  disabled={aGuardar === c.variavel}
                  className="rounded-lg bg-amber-500 px-3 py-1 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
                >
                  {aGuardar === c.variavel ? "…" : "Verificar e guardar"}
                </button>
              </div>
            </div>
          )
        })}
        {!carregar && !contas.length && <p className="text-sm text-neutral-500">Sem contas configuradas.</p>}
      </div>

      <p className="mt-3 text-[11px] text-neutral-500">
        O token é verificado contra a Graph API antes de ser guardado — se for de outra conta, é
        recusado. Guardar vazio devolve o comando à variável de ambiente. Onde gerar:{" "}
        <a className="underline" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
          Graph API Explorer
        </a>{" "}
        com a app 1468588267606256 e as permissões acima.
      </p>
    </div>
  )
}
