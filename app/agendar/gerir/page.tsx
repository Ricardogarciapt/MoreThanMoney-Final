"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarX, Loader2 } from "lucide-react"

/**
 * CANCELAR UMA CHAMADA — a página do link que vai na confirmação.
 *
 * Existe para não haver aquela conversa: «já não posso, como é que desmarco?» seguida de silêncio e
 * de uma cadeira vazia. Um cancelamento que se faz num clique custa uma marcação; um que obriga a
 * escrever um email custa a hora inteira, porque ninguém escreve.
 *
 * Pede confirmação antes de cancelar — o link chega por email e os clientes de email vão buscar os
 * links para os pré-visualizar. Um GET que cancelasse por si tinha as chamadas todas canceladas
 * pelo Gmail antes de a pessoa sequer abrir a mensagem.
 */
export default function Gerir() {
  const token = useSearchParams()?.get("t") ?? ""
  const [m, setM] = useState<null | { inicio: string; estado: string; tipo: string | null; anfitriao: string | null; inicioAnterior: string | null }>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setErro("Falta a referência da marcação."); return }
    void fetch(`/api/agenda/gerir?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((r) => (r.error ? setErro("Não encontrámos essa marcação.") : setM(r.marcacao)))
      .catch(() => setErro("Não foi possível ler a marcação."))
  }, [token])

  const responder = async (accao: "confirmar" | "cancelar") => {
    setACancelar(true)
    const r = await fetch("/api/agenda/gerir", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(accao === "confirmar" ? { token, accao: "confirmar" } : { token }),
    }).then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Falhou." }))
    setACancelar(false)
    if (r.ok) setFeito(r.mensagem)
    else setErro(r.mensagem ?? "Não foi possível.")
  }

  const cancelar = async () => {
    setACancelar(true)
    const r = await fetch("/api/agenda/gerir", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Falhou." }))
    setACancelar(false)
    if (r.ok) setFeito(r.mensagem)
    else setErro(r.mensagem ?? "Não foi possível cancelar.")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white [background-image:radial-gradient(ellipse_at_top,rgba(210,166,60,0.08),transparent_55%)]">
      <div className="w-full max-w-md text-center">
        {erro && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-200">{erro}</p>}

        {feito ? (
          <>
            <CalendarX className="mx-auto mb-4 h-10 w-10 text-zinc-500" />
            <h1 className="text-xl font-semibold">{feito}</h1>
            <a href="/agendar" className="mt-5 inline-block rounded-lg bg-[#D2A63C] px-4 py-2 text-[14px] font-semibold text-black">Marcar outra</a>
          </>
        ) : !m && !erro ? (
          <p className="flex items-center justify-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> um instante…</p>
        ) : m ? (
          <>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#D2A63C]/85">A tua chamada</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{m.tipo ?? "Chamada"}</h1>
            <p className="mt-3 text-[15px] text-zinc-300">
              {new Date(m.inicio).toLocaleString("pt-PT", { dateStyle: "full", timeStyle: "short" })}
            </p>
            {m.anfitriao && <p className="mt-1 text-[14px] text-zinc-500">com {m.anfitriao}</p>}

            {m.estado === "cancelada" ? (
              <p className="mt-6 text-[14px] text-zinc-400">Esta chamada já está cancelada.</p>
            ) : m.estado === "a_confirmar" ? (
              /*
                A HORA MUDOU E ESPERA RESPOSTA. A hora velha fica riscada por cima da nova: quem
                recebe o email lembra-se da hora que tinha, e ver as duas é o que torna a mudança
                óbvia num relance em vez de obrigar a comparar com a memória.
              */
              <>
                {m.inicioAnterior && (
                  <p className="mt-4 text-[13px] text-zinc-500">
                    Era <s>{new Date(m.inicioAnterior).toLocaleString("pt-PT", { dateStyle: "long", timeStyle: "short" })}</s>
                  </p>
                )}
                <p className="mt-4 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-2 text-[13.5px] text-[#E9C46A]">
                  Tivemos de mudar a hora. Serve-te?
                </p>
                <button
                  type="button" onClick={() => void responder("confirmar")} disabled={aCancelar}
                  className="mt-4 w-full rounded-xl bg-[#D2A63C] px-4 py-3 text-[15px] font-semibold text-black disabled:opacity-50"
                >
                  {aCancelar ? "…" : "Confirmo a hora nova"}
                </button>
                <button
                  type="button" onClick={() => void responder("cancelar")} disabled={aCancelar}
                  className="mt-2 w-full rounded-xl border border-white/12 px-4 py-2.5 text-[13.5px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Não me serve — cancelar e escolher outra
                </button>
              </>
            ) : (
              <>
                <button
                  type="button" onClick={() => void cancelar()} disabled={aCancelar}
                  className="mt-7 w-full rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[14.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {aCancelar ? "A cancelar…" : "Cancelar esta chamada"}
                </button>
                <p className="mt-3 text-[12px] text-zinc-500">
                  Precisas só de mudar a hora? Cancela e <a href="/agendar" className="text-[#E9C46A] underline">marca outra</a> — leva trinta segundos.
                </p>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}
