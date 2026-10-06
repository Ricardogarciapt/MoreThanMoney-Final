"use client"

/**
 * ENVIOS POR APROVAR — a bancada onde as mensagens que a máquina quer mandar por iniciativa
 * própria esperam por uma pessoa (06/10, conformidade).
 *
 * Aprovar FAZ SAIR a mensagem. Por isso o botão diz «Aprovar e enviar» e não «OK»: quem carrega
 * tem de saber que é o último passo. Ver lib/envios-aprovacao.ts (a regra) e lib/envios-fila.ts.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface EnvioFila {
  id: string
  title: string
  details: string | null
  kind: string
  created_at: string
}
interface EnvioIg {
  comment_id: string
  commenter: string | null
  comment_text: string | null
  texto_publico: string | null
  texto_dm: string | null
  dm_possivel: boolean
  dm_motivo: string | null
  publica_enviada_em: string | null
  criado_em: string
}

const ROTULO: Record<string, string> = {
  "envio:telegram_followup": "Telegram · follow-up",
  "envio:email_recuperacao_checkout": "Email · recuperação de checkout",
}

export function EnviosPorAprovar() {
  const [fila, setFila] = useState<EnvioFila[]>([])
  const [ig, setIg] = useState<EnvioIg[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aDecidir, setADecidir] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch("/api/admin/envios", { cache: "no-store" })
      const j = await r.json()
      setFila(j.fila ?? [])
      setIg(j.instagram ?? [])
    } catch {
      setAviso("Não consegui ler a fila.")
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function decidir(id: string, acao: "aprovar" | "rejeitar") {
    setADecidir(id)
    setAviso(null)
    try {
      const r = await fetch("/api/admin/envios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao, id }),
      })
      const j = await r.json()
      if (!j.ok) setAviso(`Não ficou: ${j.erro ?? "erro"}`)
      else if (acao === "aprovar") setAviso(j.enviado ? "Aprovado e enviado." : `Aprovado, mas não saiu: ${j.erro ?? j.estado}`)
      else setAviso("Rejeitado — não sai.")
    } finally {
      setADecidir(null)
      carregar()
    }
  }

  const total = fila.length + ig.length

  return (
    <div className="mb-6 rounded-xl border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Envios por aprovar ({total})</h2>
        <span className="text-[11.5px] text-neutral-500">
          Respostas a quem escreveu saem sozinhas. O que a máquina inicia espera aqui.
        </span>
      </div>
      {aviso && <p className="mb-2 rounded-lg bg-neutral-100 px-3 py-2 text-[12px] text-neutral-600">{aviso}</p>}
      {aCarregar ? (
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      ) : total === 0 ? (
        <p className="text-[12px] text-neutral-400">Nada por decidir.</p>
      ) : (
        <div className="space-y-2">
          {ig.map((s) => (
            <div key={s.comment_id} className="rounded-lg border p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="rounded bg-neutral-100 px-1.5 text-neutral-500">Instagram · setter</span>
                <span className="font-semibold text-neutral-100">@{s.commenter ?? "?"}</span>
                {!s.dm_possivel && <span className="text-amber-400">sem DM: {s.dm_motivo ?? "?"}</span>}
                {s.publica_enviada_em && <span className="text-emerald-400">pública já saiu</span>}
              </div>
              <p className="text-[12px] italic text-neutral-400">“{s.comment_text}”</p>
              {s.texto_publico && !s.publica_enviada_em && (
                <p className="mt-1 text-[12.5px] text-neutral-200"><span className="text-neutral-500">público → </span>{s.texto_publico}</p>
              )}
              {s.texto_dm && s.dm_possivel && (
                <p className="mt-1 whitespace-pre-line text-[12.5px] text-neutral-200"><span className="text-neutral-500">DM → </span>{s.texto_dm}</p>
              )}
              <Botoes id={s.comment_id} aDecidir={aDecidir} decidir={decidir} />
            </div>
          ))}
          {fila.map((f) => (
            <div key={f.id} className="rounded-lg border p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="rounded bg-neutral-100 px-1.5 text-neutral-500">{ROTULO[f.kind] ?? f.kind}</span>
                <span className="font-semibold text-neutral-100">{f.title}</span>
              </div>
              {f.details && <p className="whitespace-pre-line text-[12.5px] text-neutral-200">{f.details}</p>}
              <Botoes id={f.id} aDecidir={aDecidir} decidir={decidir} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Botoes({
  id,
  aDecidir,
  decidir,
}: {
  id: string
  aDecidir: string | null
  decidir: (id: string, acao: "aprovar" | "rejeitar") => void
}) {
  return (
    <div className="mt-2 flex gap-2">
      <Button size="sm" onClick={() => decidir(id, "aprovar")} disabled={aDecidir !== null}>
        {aDecidir === id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        Aprovar e enviar
      </Button>
      <Button size="sm" variant="outline" onClick={() => decidir(id, "rejeitar")} disabled={aDecidir !== null}>
        Rejeitar
      </Button>
    </div>
  )
}
