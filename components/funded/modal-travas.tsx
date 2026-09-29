"use client"

/**
 * AS TRAVAS DA CONTA, À VISTA — e a reposição, com o nome de quem a fez.
 *
 * Pedido do dono (2026-09-29): «Para o user, no seu WebTrader, um modal onde é informado e pode fazer
 * reset, analisando a sua equity. Deve mostrar dados de saldos.»
 *
 * O que este modal faz, por ordem de importância:
 *
 *  1. DIZ ONDE ESTÁ. Perda do dia contra os 3 % e perda acumulada contra os 6 % (ou 30 % numa conta
 *     real), em dinheiro e em percentagem, com a base contra que se mede cada uma. As duas bases são
 *     diferentes de propósito — a do dia é a equity com que o dia abriu, a global é a base da conta —
 *     e o modal escreve-as, porque «perdi 3 % de quê?» é a primeira pergunta de quem olha.
 *  2. MOSTRA OS SALDOS: saldo, flutuante, equity, margem livre e a linha de água da conta. Os números
 *     vêm do SERVIDOR (`estadoCompleto().travas`) e não se recalculam aqui: o número que o trader vê
 *     tem de ser o que o motor usa para lhe recusar a entrada.
 *  3. NÃO PROMETE O QUE NÃO EXISTE. Conta sem travas deste tipo (desafio, torneio, conta de análise)
 *     → diz-se, com o motivo. Auditoria por ligar (migração 156) → a reposição aparece marcada como
 *     indisponível, nunca como um botão que gravaria nada.
 *  4. A REPOSIÇÃO NUNCA É SILENCIOSA. Cada reposição fica registada com quem e quando, e a lista está
 *     aqui, no ecrã do próprio: «esta conta já foi reposta 2 vezes» é precisamente o que se perderia
 *     se o contador se pudesse repor sem rasto.
 *
 * O botão do LIMITE GLOBAL é de admin, e o modal explica porquê em vez de o esconder: os 6 % são a
 * linha de morte da conta, e se quem está a ser medido pode mover a própria linha, deixa de haver
 * linha. A diária o próprio repõe — abaixo dela continua a global a apanhá-lo.
 */
import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react"
import { textoDaFolga, ROTULO_TIPO, type Medida, type VeredictoTipo } from "@/lib/travas-por-tipo-de-conta"
import { pedir, usd } from "./api"

type Veredicto = VeredictoTipo & { foraDoAmbito?: boolean }

interface Reposicao {
  id: string
  ambito: "diaria" | "global"
  papel: string
  feito_por_email: string | null
  em: string
  equity_no_momento: number | null
  base_antes: number | null
  base_depois: number | null
  perda_diaria_pct: number | null
  perda_global_pct: number | null
  motivo: string | null
}

const data = (iso: string) => new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })

/** A barra de uma trava. `null` = não se mede — e aí não se desenha barra nenhuma. */
function Barra({ nome, m }: { nome: string; m: Medida | null }) {
  if (!m) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
        <p className="text-[11px] text-zinc-400">{nome}</p>
        <p className="mt-1 text-[11px] text-zinc-500">sem regra nesta conta</p>
      </div>
    )
  }
  const usadoDoLimite = Math.max(0, Math.min(100, (m.usado / m.permitido) * 100))
  const cor = m.excedido ? "#f43f5e" : usadoDoLimite >= 80 ? "#f59e0b" : "#10b981"
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] text-zinc-400">{nome} <span className="text-zinc-500">({m.limitePct} %)</span></p>
        <p className="font-mono text-[12px]" style={{ color: cor }}>{m.usadoPct.toFixed(2)} %</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${usadoDoLimite}%`, background: cor }} />
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">{textoDaFolga(m)}</p>
      {/* A base é a pergunta seguinte de quem lê a percentagem: «3 % de quê?» */}
      <p className="text-[10.5px] text-zinc-600">medido contra {usd(m.base)} USD</p>
    </div>
  )
}

export default function ModalTravas({ accountId, veredicto, saldos, onFechar }: {
  accountId: string
  veredicto: Veredicto
  /** Os saldos do ecrã (preços ao vivo) — os mesmos que a barra da conta mostra. */
  saldos: { saldo: number; equity: number; flutuante: number; margemLivre: number }
  onFechar: () => void
}) {
  const [v, setV] = useState<Veredicto>(veredicto)
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([])
  const [auditoria, setAuditoria] = useState<boolean | null>(null)
  const [aRepor, setARepor] = useState<"diaria" | "global" | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<{ veredicto: Veredicto; auditoria: boolean; reposicoes: Reposicao[] }>(
        `/api/mtmfunded/travas/reset?accountId=${accountId}`, {}, accountId,
      )
      setV(d.veredicto)
      setAuditoria(d.auditoria)
      setReposicoes(d.reposicoes ?? [])
    } catch (e) {
      // O veredicto que veio por prop continua válido: só a lista de reposições é que falta.
      setErro((e as Error).message)
    }
  }, [accountId])

  useEffect(() => { void carregar() }, [carregar])

  const repor = async (ambito: "diaria" | "global") => {
    setErro(null)
    setARepor(ambito)
    try {
      const r = await pedir<{ veredicto: Veredicto }>("/api/mtmfunded/travas/reset", {
        method: "POST", body: JSON.stringify({ accountId, ambito }),
      }, accountId)
      setV(r.veredicto)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setARepor(null)
    }
  }

  const travada = !v.podeAbrir
  const contaDiarias = reposicoes.filter((r) => r.ambito === "diaria").length
  const contaGlobais = reposicoes.filter((r) => r.ambito === "global").length

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Travas da conta">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#131722] text-white sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 flex items-center gap-2 border-b border-white/10 bg-[#131722] px-3 py-2.5">
          {travada ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
          <p className="min-w-0 flex-1 text-[13px] font-semibold">
            Travas da {ROTULO_TIPO[v.tipo]}
            {travada && <span className="ml-1.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-300">entradas travadas</span>}
          </p>
          <button type="button" onClick={onFechar} aria-label="fechar" className="grid h-8 w-8 place-items-center text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-2.5 p-3 text-[12px]">
          {/* Porque é que está travada — a frase do motor, não uma reescrita dela. */}
          {travada && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-200">
              {v.motivos.map((m) => <p key={m}>{m}</p>)}
              <p className="mt-1.5 text-rose-300/80">
                As saídas continuam a funcionar: fechar, parciais, break-even e trailing das posições abertas passam sempre.
              </p>
            </div>
          )}

          {!v.temTrava && (
            <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5 text-[11.5px] text-zinc-400">
              Esta conta não tem travas deste tipo.
              {v.foraDoAmbito
                ? " É uma conta de análise ou de auditoria da casa: as regras não se lhe aplicam, de propósito — travá-la parava a medição do desempenho."
                : " Um desafio ou um torneio é governado pelas regras do programa (perda diária, perda máxima e consistência), não por estas."}
            </div>
          )}

          {/* ── os saldos ── */}
          <div className="grid grid-cols-2 gap-2">
            {([
              ["Saldo", usd(saldos.saldo)],
              ["Equity", usd(saldos.equity)],
              ["Flutuante", usd(saldos.flutuante)],
              ["Margem livre", usd(saldos.margemLivre)],
            ] as const).map(([nome, valor]) => (
              <div key={nome} className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
                <p className="text-[10.5px] uppercase tracking-wide text-zinc-500">{nome}</p>
                <p className="mt-0.5 font-mono text-[14px]">{valor} <span className="text-[10.5px] text-zinc-500">USD</span></p>
              </div>
            ))}
          </div>

          {/* A linha de água, com a proveniência declarada — nunca um número sem dizer de onde vem. */}
          <p className="text-[11px] text-zinc-400">
            Desde o início da conta:{" "}
            <span className={v.linha.acima === false ? "text-rose-300" : "text-emerald-300"}>
              {v.linha.pct == null ? "—" : `${v.linha.pct >= 0 ? "+" : "−"}${Math.abs(v.linha.pct).toFixed(2)} %`}
            </span>
            {v.linha.proveniencia === "simulado" && <span className="text-zinc-500"> · conta simulada</span>}
          </p>

          {/* ── as travas ── */}
          <Barra nome="Perda do dia" m={v.diaria} />
          <Barra nome="Perda acumulada" m={v.global} />
          {v.limites.slMaxPctDaBanca != null && (
            <p className="text-[11px] text-zinc-400">
              O stop de cada entrada não pode arriscar mais de {v.limites.slMaxPctDaBanca} % da banca — uma ordem acima disso é recusada no ticket.
            </p>
          )}

          {/* ── a reposição ── */}
          {v.temTrava && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
              <p className="text-[11px] font-semibold text-zinc-300">Repor contadores</p>
              {auditoria === false ? (
                <p className="text-[11px] text-amber-300">
                  A auditoria das reposições ainda não está ligada nesta base (migração 156). Enquanto não estiver, não se repõe
                  nada — um contador reposto sem registo de quem o repôs apaga a única informação que a trava produziu.
                </p>
              ) : (
                <>
                  {v.diaria && (
                    <button
                      type="button"
                      onClick={() => void repor("diaria")}
                      disabled={aRepor != null}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                    >
                      {aRepor === "diaria" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Repor a perda do dia
                    </button>
                  )}
                  <p className="text-[10.5px] text-zinc-500">
                    Repor o dia volta a contar a partir da equity de agora, e fica registado com o teu nome e a hora. O limite
                    acumulado continua de pé — é ele que protege o capital.
                  </p>
                  {v.global && (
                    <>
                      <button
                        type="button"
                        onClick={() => void repor("global")}
                        disabled={aRepor != null}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300 disabled:opacity-50"
                      >
                        {aRepor === "global" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Repor o limite acumulado ({v.global.limitePct} %) — admin
                      </button>
                      <p className="text-[10.5px] text-zinc-500">
                        Esta é de admin, e é de propósito: os {v.global.limitePct} % são a linha de morte da conta. Se quem está a
                        ser medido pudesse mover a própria linha, deixava de haver linha — e o que uma conta financiada tem de
                        poder dizer é quem rebentou o quê, e quantas vezes.
                      </p>
                    </>
                  )}
                </>
              )}
              {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
            </div>
          )}

          {/* ── o histórico, à vista ── */}
          {(contaDiarias > 0 || contaGlobais > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] font-semibold text-amber-200">
                Esta conta já foi reposta {reposicoes.length} {reposicoes.length === 1 ? "vez" : "vezes"}
                {contaGlobais > 0 && ` (${contaGlobais} no limite acumulado)`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {reposicoes.map((r) => (
                  <li key={r.id} className="text-[10.5px] text-zinc-400">
                    {data(r.em)} · {r.ambito === "diaria" ? "dia" : "acumulado"} · {r.papel}
                    {r.feito_por_email ? ` (${r.feito_por_email})` : ""} · equity {usd(r.equity_no_momento)} ·{" "}
                    {r.ambito === "diaria" ? `perda do dia ${r.perda_diaria_pct ?? "—"} %` : `perda acumulada ${r.perda_global_pct ?? "—"} %`}
                    {r.base_antes != null && r.base_depois != null ? ` · base ${usd(r.base_antes)} → ${usd(r.base_depois)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
