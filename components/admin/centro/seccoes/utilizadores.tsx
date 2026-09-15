"use client"

import { useEffect, useMemo, useState } from "react"
import type { UtilizadorCentro } from "@/lib/admin-centro/servidor/outros"
import { nomeMotivo, type Tom } from "@/lib/admin-centro/regras"
import { useCentroCtx } from "../contexto"
import { Aviso, Azulejo, BotaoLer, Chip, Painel, Pilula, Tabela, Vazio, fmtIdade, fmtNum, idadeDe, td, th, trClic, useCentro } from "../ui"

export type DadosUtilizadores = {
  utilizadores: UtilizadorCentro[]
  matriz: { motivo: string; nome: string; tom: Tom; total: number; comContas: number }[]
  semAcessoComContas: number
  legadoPagantes: number
  acimaDaQuota: number
}

export default function SeccaoUtilizadores() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<DadosUtilizadores>(`/api/admin/centro/utilizadores?v=${ctx.versao}`, 30_000)
  const [q, setQ] = useState("")
  const [motivo, setMotivo] = useState("")
  const [so, setSo] = useState(ctx.filtro.quota === "acima" ? "quota" : "")
  useEffect(() => { if (ctx.filtro.quota === "acima") setSo("quota") }, [ctx.filtro])

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (dados?.utilizadores ?? []).filter((u) => {
      if (motivo && u.motivo !== motivo) return false
      if (so === "contas" && u.contas === 0) return false
      if (so === "semacesso" && !(u.contas > 0 && !u.temMtmAuto)) return false
      if (so === "legado" && !u.legadoMtmCopy.ativo) return false
      if (so === "quota" && !u.quotaAcima) return false
      if (so === "t2t" && u.t2t.ligacoes === 0) return false
      if (t && ![u.email, u.nome, u.id].some((x) => x && x.toLowerCase().includes(t))) return false
      return true
    })
  }, [dados, q, motivo, so])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Azulejo rotulo="Com MTM Auto" valor={fmtNum(dados?.utilizadores.filter((u) => u.temMtmAuto).length)} sub={`de ${fmtNum(dados?.utilizadores.length)} utilizadores`} tom="ok" />
        <Azulejo rotulo="Contas sem direito" valor={dados?.semAcessoComContas ?? "—"} sub="têm contas ligadas mas a cópia automática não corre" tom={dados?.semAcessoComContas ? "aviso" : "ok"} onClick={() => setSo("semacesso")} />
        <Azulejo rotulo="MTM Copy legado (pagantes)" valor={dados?.legadoPagantes ?? "—"} onClick={() => setSo("legado")} />
        <Azulejo rotulo="Acima da quota MetaApi" valor={dados?.acimaDaQuota ?? "—"} tom={dados?.acimaDaQuota ? "aviso" : "neutro"} onClick={() => setSo("quota")} />
      </div>

      <Painel titulo="Matriz de direitos MTM Auto" sub="Regra única decidirDireitoMtmAuto (lib/entitlements.ts): o primeiro motivo que se aplica ganha.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {(dados?.matriz ?? []).map((m) => (
            <button key={m.motivo} type="button" onClick={() => setMotivo(motivo === m.motivo ? "" : m.motivo)} className={`rounded-lg border px-3 py-2 text-left transition-colors ${motivo === m.motivo ? "border-[#D2A63C]/60 bg-[#D2A63C]/10" : "border-white/[0.06] bg-zinc-900/50 hover:border-white/20"}`}>
              <Pilula tom={m.tom}>{m.nome}</Pilula>
              <p className="mt-1.5 font-mono text-lg text-white">{m.total}</p>
              <p className="text-[10px] text-zinc-500">{m.comContas} com contas</p>
            </button>
          ))}
        </div>
      </Painel>

      <Painel titulo="Utilizadores" accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, nome, id…" className="w-56 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white placeholder:text-zinc-600" />
          {[["", "todos"], ["contas", "com contas"], ["semacesso", "contas sem direito"], ["legado", "legado MTM Copy"], ["quota", "acima da quota"], ["t2t", "com T2T"]].map(([id, nome]) => <Chip key={id} activo={so === id} onClick={() => setSo(id)}>{nome}</Chip>)}
          {motivo && <Chip activo onClick={() => setMotivo("")}>{nomeMotivo(motivo)} ✕</Chip>}
          <span className="ml-auto text-[11px] text-zinc-500">{lista.length}</span>
        </div>
        {erro && <Aviso tom="grave">{erro}</Aviso>}
        {!dados ? <Vazio>A ler…</Vazio> : lista.length === 0 ? <Vazio>Ninguém com estes filtros.</Vazio> : (
          <Tabela min={960}>
            <thead><tr><th className={th}>Utilizador</th><th className={th}>Direito</th><th className={th}>MTM Auto</th><th className={th}>Legado</th><th className={th}>Contas · quota</th><th className={th}>T2T</th><th className={th}>Último login</th></tr></thead>
            <tbody>
              {lista.slice(0, 400).map((u) => (
                <tr key={u.id} className={trClic} onClick={() => ctx.abrir({ tipo: "utilizador", id: u.id })}>
                  <td className={td}><p className="text-zinc-100">{u.email ?? u.id.slice(0, 8)}</p><p className="text-[10px] text-zinc-500">{u.nome ?? ""} · {u.tipo ?? "—"}{u.categoria ? `/${u.categoria}` : ""}</p></td>
                  <td className={td}><Pilula tom={u.temMtmAuto ? "ok" : u.motivo === "suspenso" ? "grave" : "neutro"}>{nomeMotivo(u.motivo)}</Pilula></td>
                  <td className={`${td} text-[10.5px] text-zinc-400`}>{u.mtmauto ? [u.mtmauto.subscricao && `stripe ${u.mtmauto.subscricao}`, u.mtmauto.apple && `apple ${u.mtmauto.apple}`, u.mtmauto.manual && "manual", u.mtmauto.isento && "isento", u.mtmauto.suspenso && "suspenso", u.mtmauto.equipa && `equipa ${u.mtmauto.equipa}`].filter(Boolean).join(" · ") || "registado" : "—"}</td>
                  <td className={`${td} text-[10.5px]`}>{u.legadoMtmCopy.ativo ? <span className="text-amber-300">até {u.legadoMtmCopy.expira?.slice(0, 10) ?? "?"}</span> : "—"}</td>
                  <td className={`${td} font-mono`}>{u.contas} · <span className={u.quotaAcima ? "text-amber-300" : ""}>{u.contasMetaApi}/{u.quotaLimite ?? "∞"}</span></td>
                  <td className={`${td} text-[10.5px] text-zinc-400`}>{u.t2t.ligacoes ? `${u.t2t.ligacoes} · ${u.t2t.risco ?? "—"} · ${u.t2t.fontes.slice(0, 3).join(", ")}` : "—"}</td>
                  <td className={`${td} font-mono`}>{u.ultimoLogin ? fmtIdade(idadeDe(u.ultimoLogin)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>
    </div>
  )
}
