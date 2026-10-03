"use client"

import { Cpu } from "lucide-react"
import type { carregarMotorReal } from "@/lib/gestao-real/servidor/painel"
import { Aviso, Azulejo, BotaoLer, Painel, Pilula, Tabela, Vazio, curto, fmtMs, fmtNum, fmtQuando, td, th, useCentro } from "./ui"

type Dados = Awaited<ReturnType<typeof carregarMotorReal>>

/**
 * Cartão «Motor em tempo real» (VPS services/motor-real): está vivo? em sombra ou live? e, nas
 * últimas 24 h, o que decidiu face ao que o monitor actual fez — latência e divergência por regra.
 * Só leitura: passar uma conta a live é a lista `motor_real_contas_live` (ver README do motor).
 */
export default function MotorRealSombra({ versao }: { versao: number }) {
  const { dados: d, erro, aCarregar, recarregar, lidoEm } = useCentro<Dados>(`/api/admin/centro/motor-real?v=${versao}`, 30_000)
  if (erro && !d) return <Aviso tom="aviso">Motor em tempo real: {erro}</Aviso>
  if (!d) return null
  if (d.pendente) return <Aviso tom="info">Motor em tempo real: migração 096 por aplicar.</Aviso>
  const m = d.motor
  const semMonitor = d.porEstado.sem_monitor ?? 0
  const soMonitor = d.porEstado.monitor_sem_sombra ?? 0
  return (
    <Painel
      titulo="Motor em tempo real"
      icone={<Cpu className="h-4 w-4" />}
      sub="Decisões tick a tick com as regras dos monitores. Sombra: regista o que faria e compara com o que o monitor fez."
      accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pilula tom={m.vivo ? "ok" : "grave"} vivo={m.vivo}>{m.vivo ? `vivo · batimento ${fmtMs(m.idadePulsoMs)}` : m.idadePulsoMs == null ? "nunca arrancou" : `calado há ${fmtMs(m.idadePulsoMs)}`}</Pilula>
        <Pilula tom={m.escrita ? "aviso" : "info"}>{m.escrita ? "escrita permitida" : "só sombra"}</Pilula>
        <Pilula tom={m.live.length ? "grave" : "ok"}>{m.live.length ? `LIVE: ${m.live.map((k) => curto(k)).join(", ")}` : "nenhuma conta em live"}</Pilula>
        {d.listaLive.length > 0 && <Pilula tom="aviso">lista live: {d.listaLive.map((e) => `${curto(e.conta)}(${e.tipos.join("+")})`).join(", ")}</Pilula>}
        <Pilula tom="neutro">{m.contas.length} ligação(ões)</Pilula>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Azulejo rotulo="Decisões 24 h" valor={fmtNum(d.total24h)} sub={`${d.porEstado.casada ?? 0} casadas com o monitor`} />
        <Azulejo rotulo="Latência p50" valor={fmtMs(d.latenciaP50Ms)} sub="positivo = motor mais cedo" />
        <Azulejo rotulo="Latência p95" valor={fmtMs(d.latenciaP95Ms)} />
        <Azulejo rotulo="Divergência p95" valor={d.divergenciaP95Pips == null ? "—" : `${fmtNum(d.divergenciaP95Pips, 1)} p`} sub={`máx ${d.divergenciaMaxPips == null ? "—" : fmtNum(d.divergenciaMaxPips, 1)}`} tom={(d.divergenciaP95Pips ?? 0) > 3 ? "aviso" : "neutro"} />
        <Azulejo rotulo="Motor sem monitor" valor={semMonitor} sub="decidiu, o monitor não agiu em 2 min" tom={semMonitor ? "aviso" : "neutro"} />
        <Azulejo rotulo="Monitor sem motor" valor={soMonitor} sub="o monitor agiu, o motor não" tom={soMonitor ? "grave" : "neutro"} />
      </div>
      {d.regras.length > 0 && (
        <div className="mt-3">
          <Tabela min={560}>
            <thead><tr><th className={th}>Regra</th><th className={th}>Decisões</th><th className={th}>Casadas</th><th className={th}>Sem monitor</th><th className={th}>Latência p50</th><th className={th}>Diverg. p95</th></tr></thead>
            <tbody>
              {d.regras.slice(0, 14).map((r) => (
                <tr key={r.regra}><td className={td}>{r.regra}</td><td className={td}>{r.n}</td><td className={td}>{r.casadas}</td><td className={td}>{r.semMonitor}</td><td className={td}>{fmtMs(r.latP50)}</td><td className={td}>{r.divP95 == null ? "—" : fmtNum(r.divP95, 1)}</td></tr>
              ))}
            </tbody>
          </Tabela>
        </div>
      )}
      {d.recentes.length ? (
        <div className="mt-3">
          <Tabela min={760}>
            <thead><tr><th className={th}>Quando</th><th className={th}>Conta</th><th className={th}>Regra</th><th className={th}>Pretendido</th><th className={th}>Monitor</th><th className={th}>Latência</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {d.recentes.map((l, i) => (
                <tr key={i}>
                  <td className={td}>{fmtQuando(l.decidido_em)}</td>
                  <td className={td}>{curto(l.conta)} · {l.simbolo}</td>
                  <td className={td}>{l.regra}</td>
                  <td className={td}>{l.acao === "sl" ? `SL ${l.sl ?? "—"}` : l.acao === "fecho" ? `fecha ${l.volume ?? "tudo"}` : l.acao}</td>
                  <td className={td}>{l.monitor_valor ?? "—"}</td>
                  <td className={td}>{fmtMs(l.latencia_ms)}</td>
                  <td className={td}><Pilula tom={l.estado === "casada" || l.estado === "live_ok" ? "ok" : l.estado === "monitor_sem_sombra" || l.estado === "live_falhou" ? "grave" : l.estado === "sem_monitor" ? "aviso" : "neutro"}>{l.estado}</Pilula></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>
      ) : <Vazio>Sem decisões nas últimas 24 h.</Vazio>}
    </Painel>
  )
}
