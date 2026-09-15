"use client"

import { useCallback, useSyncExternalStore } from "react"
import { LayoutDashboard, Smartphone } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

/**
 * SIMPLE | PRO — o interruptor global do WebTrader.
 *
 *  · SIMPLE (telemóvel primeiro): gráfico em ecrã inteiro, ticket numa folha que sobe de baixo,
 *    separadores deslizáveis de Posições/Ordens/Histórico. Nada mais à vista.
 *  · PRO (secretária): painéis redimensionáveis — lista, 1/2/4 gráficos, ticket, e em baixo
 *    Posições | Ordens | Histórico | Estatísticas | Diário | Alertas | Conta — com atalhos de teclado.
 *
 * A escolha fica no dispositivo, POR UTILIZADOR (quem partilha o tablet não herda o modo do outro).
 * Sem escolha guardada: SIMPLE abaixo de 768 px, PRO acima.
 * Um só estado para a página inteira (useSyncExternalStore): o interruptor no cabeçalho e o trader
 * lá dentro mudam juntos sem passar props.
 */

export type ModoWebtrader = "simples" | "pro"

const chave = (userId: string | null | undefined) => `mtmfunded_modo:${userId || "anon"}`
const EVENTO = "mtmfunded-modo"

function lerGuardado(userId: string | null | undefined): ModoWebtrader | null {
  try {
    const v = localStorage.getItem(chave(userId))
    return v === "simples" || v === "pro" ? v : null
  } catch { return null }
}

function porLargura(): ModoWebtrader {
  try { return window.matchMedia("(min-width: 768px)").matches ? "pro" : "simples" } catch { return "simples" }
}

function subscrever(cb: () => void) {
  window.addEventListener(EVENTO, cb)
  window.addEventListener("storage", cb)
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb) }
}

export function useModoWebtrader(): { modo: ModoWebtrader; definir: (m: ModoWebtrader) => void; escolhido: boolean } {
  const { user } = useAuth()
  const uid = user?.id ?? null
  // No servidor (e no primeiro render) é SIMPLE: é o que não parte num ecrã pequeno.
  const guardado = useSyncExternalStore(subscrever, () => lerGuardado(uid), () => null)
  const largura = useSyncExternalStore(
    (cb) => { try { const mq = window.matchMedia("(min-width: 768px)"); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb) } catch { return () => {} } },
    porLargura,
    () => "simples" as ModoWebtrader,
  )
  const definir = useCallback((m: ModoWebtrader) => {
    try { localStorage.setItem(chave(uid), m) } catch { /* modo privado: vale só nesta página */ }
    window.dispatchEvent(new Event(EVENTO))
  }, [uid])
  return { modo: guardado ?? largura, definir, escolhido: guardado != null }
}

export function InterruptorModo({ compacto }: { compacto?: boolean }) {
  const { modo, definir } = useModoWebtrader()
  const opcoes: Array<[ModoWebtrader, string, typeof Smartphone]> = [["simples", "Simple", Smartphone], ["pro", "PRO", LayoutDashboard]]
  return (
    <div role="radiogroup" aria-label="Modo do WebTrader" className="flex shrink-0 rounded-lg border border-white/10 bg-black/40 p-0.5 text-[11px]">
      {opcoes.map(([m, nome, Icone]) => (
        <button key={m} type="button" role="radio" aria-checked={modo === m} aria-label={`Modo ${nome}`} onClick={() => definir(m)} title={`Modo ${nome} (Alt+M)`}
          className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${modo === m ? "bg-[#D2A63C] text-black" : "text-zinc-400 hover:text-white"}`}>
          <Icone className="h-3.5 w-3.5" />{!compacto && <span className="hidden sm:inline">{nome}</span>}
        </button>
      ))}
    </div>
  )
}
