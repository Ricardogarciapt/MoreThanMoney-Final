"use client"

/**
 * AS CAIXAS DE CORREIO DO DOMÍNIO.
 *
 * Um ecrã para três perguntas que até aqui não tinham sítio: que endereços `@morethanmoney.pt`
 * existem, de quem são, e para onde vai o correio de cada um quando a pessoa não usa a caixa da
 * casa.
 *
 * A decisão do que pode e não pode vem SEMPRE do servidor — o ciclo de reencaminhamento, os nomes
 * de sistema, as licenças. Aqui só se mostra, incluindo o motivo por escrito quando algo é
 * recusado. Uma segunda cópia da regra no browser discordaria da do servidor exactamente no caso
 * difícil, que é o único em que a regra importa.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Forward, Loader2, Mail, Plus, RefreshCw, UserPlus } from "lucide-react"

type Caixa = {
  id: string; endereco: string; tipo: "caixa" | "alias"; estado: string
  user_id: string | null; educador_id: string | null
  reencaminhar_para: string | null; reencaminhar_ativo: boolean
  ultimo_erro: string | null; notas: string | null
}
type Falta = { id: string; nome: string; email: string | null; papel: string; sugestao: string; jaTemDoDominio: boolean }
type Dados = {
  dominio: string
  caixas: Caixa[]
  zoho: { ligado: boolean; porque: string; contas: number; enderecos: string[] }
  faltam: Falta[]
}

const CAMPO =
  "rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[12.5px] text-white outline-none focus:border-[#D2A63C]/60"

export default function CorreioCaixas() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [novo, setNovo] = useState({ local: "", tipo: "alias" as "alias" | "caixa", password: "", nome: "" })

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch("/api/admin/correio").then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setErro(r?.erro ?? "Não foi possível ler as caixas."); return }
    setD(r)
  }, [])
  useEffect(() => { void ler() }, [ler])

  const agir = async (corpo: Record<string, unknown>, chave: string) => {
    setOcupado(chave); setErro(null); setNota(null)
    const r = await fetch("/api/admin/correio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null)
    setOcupado(null)
    if (!r?.ok) { setErro(r?.porque ?? r?.erro ?? "Não foi possível."); return }
    if (r.porque) setNota(r.porque)
    await ler()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <Mail className="h-4 w-4 text-[#D2A63C]" /> Caixas de correio
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Os endereços de {d?.dominio ?? "morethanmoney.pt"}, de quem são, e para onde vai o correio de cada um.
          </p>
        </div>
        <button onClick={() => void ler()} className="flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-zinc-300 hover:border-[#D2A63C]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {/* O estado da ligação ao Zoho aparece SEMPRE. Sem ele, uma lista vazia parece «não há
          caixas» quando o que há é uma variável em falta. */}
      {d && !d.zoho.ligado && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Sem ligação à API do Zoho — criar caixas por aqui não funciona.</div>
            <div className="mt-0.5 text-amber-200/80">{d.zoho.porque}</div>
            <div className="mt-1 text-amber-200/70">
              As chaves geram-se em api-console.zoho.eu (Self Client) e guardam-se na Vercel. Ver docs/correio-dominio.md.
            </div>
          </div>
        </div>
      )}
      {d?.zoho.ligado && (
        <p className="text-[12px] text-zinc-500">Zoho ligado — {d.zoho.contas} conta(s) na organização.</p>
      )}

      {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">{erro}</div>}
      {nota && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">{nota}</div>}

      {/* Criar */}
      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-zinc-300">
          <Plus className="h-3.5 w-3.5 text-[#D2A63C]" /> Endereço novo
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <input value={novo.local} onChange={(e) => setNovo({ ...novo, local: e.target.value })}
              placeholder="nome" className={`${CAMPO} w-36 rounded-r-none`} />
            <span className="rounded-r-md border border-l-0 border-white/12 bg-black/60 px-2 py-1 text-[12.5px] text-zinc-500">
              @{d?.dominio ?? "morethanmoney.pt"}
            </span>
          </div>
          <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as "alias" | "caixa" })} className={CAMPO}>
            <option value="alias">Alias (cai no geral@, não gasta licença)</option>
            <option value="caixa">Caixa própria (login e inbox, gasta licença)</option>
          </select>
          {novo.tipo === "caixa" && (
            <>
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome a mostrar" className={`${CAMPO} w-40`} />
              <input value={novo.password} onChange={(e) => setNovo({ ...novo, password: e.target.value })}
                type="password" placeholder="Password (12+)" className={`${CAMPO} w-40`} />
            </>
          )}
          <button
            onClick={() => void agir({ acao: "criar", local: novo.local, tipo: novo.tipo, password: novo.password, nome: novo.nome }, "criar")}
            disabled={!novo.local.trim() || ocupado === "criar"}
            className="flex items-center gap-1.5 rounded-md border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2.5 py-1.5 text-[12px] text-[#D2A63C] disabled:opacity-40"
          >
            {ocupado === "criar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar
          </button>
        </div>
        {novo.tipo === "caixa" && (
          <p className="mt-2 text-[11.5px] text-zinc-500">
            A password não fica guardada aqui — entrega-a à pessoa e ela muda-a no primeiro acesso.
          </p>
        )}
      </div>

      {/* A lista */}
      <div className="space-y-2">
        {(d?.caixas ?? []).length === 0 && (
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-5 text-center text-[12.5px] text-zinc-400">
            Ainda não há endereços registados aqui. Os que já existem no Zoho — geral@ e os oito aliases — entram à medida que os criares por este ecrã, ou podes registá-los à mão.
          </div>
        )}
        {(d?.caixas ?? []).map((c) => (
          <LinhaCaixa key={c.id} c={c} ocupado={ocupado} agir={agir} />
        ))}
      </div>

      {/* Quem ainda não tem endereço */}
      {(d?.faltam ?? []).length > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-zinc-300">
            <UserPlus className="h-3.5 w-3.5 text-[#D2A63C]" /> Pessoas sem endereço ligado
          </div>
          <div className="space-y-1.5">
            {(d?.faltam ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-white">{p.nome}</span>
                <span className="text-[11px] text-zinc-500">{p.papel}</span>
                <span className="text-[11px] text-zinc-500">{p.email ?? "sem email"}</span>
                {/* O caso que se descobriu a 30/09 e que ninguém via. */}
                {p.jaTemDoDominio && (
                  <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10.5px] text-amber-300">
                    usa endereço da casa que pode nunca ter existido no servidor
                  </span>
                )}
                {p.sugestao && (
                  <button
                    onClick={() => setNovo({ ...novo, local: p.sugestao, nome: p.nome })}
                    className="rounded border border-white/12 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-[#D2A63C]/50"
                  >
                    propor {p.sugestao}@
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LinhaCaixa({ c, ocupado, agir }: {
  c: Caixa
  ocupado: string | null
  agir: (corpo: Record<string, unknown>, chave: string) => Promise<void>
}) {
  const [para, setPara] = useState(c.reencaminhar_para ?? "")
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-white">{c.endereco}</span>
        <span className="rounded border border-white/12 px-1.5 py-0.5 text-[10.5px] text-zinc-400">{c.tipo}</span>
        {c.estado !== "ativa" && (
          <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10.5px] text-amber-300">{c.estado}</span>
        )}
        {c.reencaminhar_para && (
          <span className="flex items-center gap-1 text-[11.5px] text-zinc-400">
            <Forward className="h-3 w-3" /> {c.reencaminhar_para}
            {/* Só diz «a entregar» quando o destino está confirmado. O Zoho exige um código, e
                dizer «ligado» antes disso é mentir a quem confia no ecrã. */}
            <span className={c.reencaminhar_ativo ? "text-emerald-400" : "text-amber-300"}>
              {c.reencaminhar_ativo ? "a entregar" : "por confirmar no Zoho"}
            </span>
          </span>
        )}
      </div>

      {c.ultimo_erro && <p className="mt-1 text-[11.5px] text-red-300">{c.ultimo_erro}</p>}
      {c.notas && <p className="mt-1 text-[11.5px] text-zinc-500">{c.notas}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="reencaminhar para (email de fora)" className={`${CAMPO} w-64`} />
        <button
          onClick={() => void agir({ acao: "reencaminhar", endereco: c.endereco, para, ativo: true }, c.endereco)}
          disabled={!para.trim() || ocupado === c.endereco}
          className="rounded-md border border-white/12 px-2 py-1 text-[11.5px] text-zinc-300 hover:border-[#D2A63C]/50 disabled:opacity-40"
        >
          {ocupado === c.endereco ? "…" : "Reencaminhar"}
        </button>
        {c.reencaminhar_para && (
          <button
            onClick={() => void agir({ acao: "reencaminhar", endereco: c.endereco, ativo: false }, c.endereco)}
            className="rounded-md border border-white/12 px-2 py-1 text-[11.5px] text-zinc-400 hover:border-red-500/50"
          >
            Parar
          </button>
        )}
      </div>
    </div>
  )
}
