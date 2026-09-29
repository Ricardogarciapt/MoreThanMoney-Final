"use client"

import { useState } from "react"
import { Network, OctagonX, Power } from "lucide-react"
import type { PainelMestresLido } from "@/lib/mestres/servidor/painel-leitura"
import { palavraDeConfirmacao } from "@/lib/mestres/painel"
import { Aviso, Azulejo, Botao, BotaoLer, Painel, Pilula, Tabela, Vazio, fmtIdade, fmtMs, fmtNum, td, th, useCentro, pedirCentro, pedirPalavra } from "./ui"

/**
 * Cartão «Motor das mestres» do cockpit — o mesmo estado da tab Estratégias de /admin/mtmcopy,
 * resumido: motor ligado/kill, estratégias e contas em live, ordens e falhas das últimas 24 h, alertas.
 * Os modos mudam-se no painel completo; aqui só o kill-switch (parar é sempre permitido).
 */
export default function MotorMestresCentro({ versao }: { versao: number }) {
  const { dados: d, erro, aCarregar, recarregar, lidoEm } = useCentro<PainelMestresLido>(`/api/admin/centro/mestres?v=${versao}`, 20_000)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (erro && !d) return <Aviso tom="aviso">Motor das mestres: {erro}</Aviso>
  if (!d) return null
  if (d.pendente) return <Aviso tom="info">Motor das mestres: migração 116 por aplicar.</Aviso>
  const g = d.global
  const t = d.totais

  const kill = async (valor: boolean) => {
    const palavra = palavraDeConfirmacao({ tipo: "kill", valor })!
    const ok = pedirPalavra(valor
      ? "KILL-SWITCH do motor das mestres: pára TUDO em ≤ 2 s, incluindo as SAÍDAS. As posições abertas nos clientes ficam só com o SL/TP da corretora."
      : "Levantar o kill-switch: o motor retoma (aberturas atrasadas recusadas, saídas da fila seguem).", palavra)
    if (!ok) return
    setOcupado(true)
    const r = await pedirCentro<{ message?: string }>("/api/admin/mtmauto-copia/mestres", { method: "POST", body: { tipo: "kill", valor, confirmacao: ok } })
    setOcupado(false)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    void recarregar()
  }

  return (
    <Painel
      titulo="Motor das mestres"
      icone={<Network className="h-4 w-4" />}
      sub="Mestres SIM da casa → contas dos clientes, sem CopyFactory. Modos por estratégia e por conta em Estratégias (aqui) ou MTM Auto · Cópia › Estratégias."
      accao={<div className="flex items-center gap-2">
        {g.kill
          ? <Botao onClick={() => void kill(false)} disabled={ocupado}><Power className="h-3 w-3" /> Levantar kill</Botao>
          : <Botao tom="perigo" onClick={() => void kill(true)} disabled={ocupado}><OctagonX className="h-3 w-3" /> Kill-switch</Botao>}
        <BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pilula tom={g.estado === "kill" || g.estado === "sem-pulso" ? "grave" : g.estado === "live" ? "ok" : g.estado === "sombra" ? "info" : "neutro"} vivo={g.pulsoVivo}>
          {g.estado === "kill" ? "KILL" : g.estado === "sem-pulso" ? "sem batimento" : g.estado === "live" ? "live" : g.estado === "sombra" ? "só sombra" : "desligado"}
        </Pilula>
        <Pilula tom={g.ligado ? "ok" : "neutro"}>motor {g.ligado ? "ligado" : "desligado"}</Pilula>
        <Pilula tom={g.liveDesbloqueado ? "aviso" : "neutro"}>live {g.liveDesbloqueado ? "desbloqueado" : "bloqueado"}</Pilula>
        <Pilula tom={g.escritaVps ? "aviso" : "neutro"}>escrita VPS {g.escritaVps == null ? "?" : g.escritaVps ? "sim" : "não"}</Pilula>
        <Pilula tom={g.pulsoVivo ? "ok" : "grave"}>batimento {fmtIdade(g.pulsoIdadeS)}</Pilula>
        <a href="/admin/centro?s=estrategias" className="ml-auto text-[11px] text-[#D2A63C] hover:underline">Painel completo →</a>
      </div>
      {msg && <div className="mb-2"><Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso></div>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Azulejo rotulo="Estratégias live" valor={`${t.estrategiasLive}/${t.estrategias}`} sub={d.estrategias.filter((e) => e.modo === "live" || e.sinalModo === "live").map((e) => e.nome.replace(/^MTM Auto /, "")).join(", ") || "nenhuma"} tom={t.estrategiasLive ? "ok" : "neutro"} />
        <Azulejo rotulo="Contas live" valor={t.contasLive} sub={`${t.rotasLive}/${t.rotas} rotas efectivas em live`} />
        <Azulejo rotulo="Posições live abertas" valor={t.abertasLive} />
        <Azulejo rotulo="Ordens 24 h" valor={fmtNum(t.ordens24h.total)} sub={`${t.ordens24h.ok} ok · ${t.ordens24h.sombra} sombra · ${t.ordens24h.recusado + t.ordens24h.bloqueado} recusadas`} />
        <Azulejo rotulo="Falhas 24 h" valor={t.falhas24h} tom={t.falhas24h ? "grave" : "ok"} sub={`latência p95 ${fmtMs(t.ordens24h.latP95Ms)}`} />
        <Azulejo rotulo="Alertas" valor={t.alertasNovos} sub={`${t.alertas24h} nas últimas 24 h`} tom={t.alertasNovos ? "aviso" : "neutro"} />
      </div>
      <div className="mt-3">
        {d.estrategias.length === 0 ? <Vazio>Nenhuma estratégia no motor.</Vazio> : (
          <Tabela min={720}>
            <thead><tr><th className={th}>Estratégia</th><th className={th}>Executa</th><th className={th}>Propagação · sinal · T2T</th><th className={th}>Mestre SIM</th><th className={th}>Rotas live</th><th className={th}>Ordens 24 h</th></tr></thead>
            <tbody>
              {d.estrategias.map((e) => (
                <tr key={e.slug}>
                  <td className={td}>{e.nome}{e.avisos.length > 0 && <p className="text-[10px] text-amber-300">{e.avisos.length} aviso(s)</p>}</td>
                  <td className={td}><Pilula tom={e.executor === "motor" ? "ok" : e.executor === "copyfactory" ? "aviso" : "neutro"} title={e.executorNota}>{e.executor === "motor" ? "motor" : e.executor === "copyfactory" ? "CopyFactory" : "legado"}</Pilula></td>
                  <td className={`${td} font-mono text-[11px]`}>{e.modo} · {e.sinalModo} · {e.t2tModo}</td>
                  <td className={`${td} font-mono text-[11px]`}>{e.contaMestre?.login ?? "—"}{e.contaMestre?.etiqueta ? ` «${e.contaMestre.etiqueta}»` : ""}</td>
                  <td className={`${td} font-mono`}>{e.nRotasLive}/{e.nRotas} · {e.nContasLive} conta(s)</td>
                  <td className={`${td} font-mono text-[11px]`}>{e.ordens24h.total}{e.ordens24h.erro ? <span className="text-rose-300"> · {e.ordens24h.erro} erro</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </div>
    </Painel>
  )
}
