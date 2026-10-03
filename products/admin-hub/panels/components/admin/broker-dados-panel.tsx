"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Painel DADOS DA CORRETORA (/admin/sales-machine).
 *
 * A rota da corretora é o gargalo número um do negócio e estava a zero — não por falta de gente,
 * mas porque o sistema não conseguia ver quem tinha depositado: 58 dos 59 clientes com depósito a
 * zero e um export de 66 dias. Enquanto a PU Prime não der API de depósitos/saldo (a API de IB dá
 * UIDs e contas, não dinheiro), a atualização depende de alguém arrastar um ficheiro para aqui.
 * Este painel existe para isso custar 30 segundos e não uma tarde.
 *
 * Duas coisas estão à vista de propósito:
 *  - a IDADE dos dados, porque aos 40 dias o gate deixa de decidir por mérito;
 *  - QUEM fica diferente por causa do ficheiro, antes de se gravar. Do outro lado desses nomes há
 *    pessoas com acesso a grupos pagos: a decisão é de quem está a olhar, não do importador.
 */

type Frescura = { estado: string; dias: number | null; mensagem: string; aviso: number; limite: number; ultimo: string | null }
type Orfao = { chat_id: string; broker_uid: string | null; quem: string; stage: string | null; aviso: string }
type Estado = {
  frescura: Frescura
  clientes: { total: number; comDeposito: number; cumpremORegra: number }
  minimo: number
  leadsSemCorrespondencia: Orfao[]
}
type Impacto = {
  passamASerRevogaveis: { quem: string; uid: string; saldo: number }[]
  passamAValidar: { quem: string; uid: string; deposito: number; saldo: number }[]
  continuamSemCorrespondencia: { quem: string; uid: string }[]
}
type Resultado = {
  ok: boolean
  error?: string
  simulado?: boolean
  cabecalhos?: string[]
  mapeamento?: Record<string, string>
  lidas?: number
  novos?: number
  alterados?: number
  iguais?: number
  gravadas?: number
  naoVeioNoFicheiro?: number
  duplicados?: string[]
  ignoradas?: { linha: number; motivo: string; amostra: string }[]
  exemplosAlterados?: { uid: string; alteracoes: string[] }[]
  impacto?: Impacto
}

const card = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40"

const CORES: Record<string, string> = {
  fresco: "text-emerald-400",
  a_envelhecer: "text-amber-400",
  velho: "text-red-400",
  sem_dados: "text-red-400",
}

export function BrokerDadosPanel() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [csv, setCsv] = useState("")
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const inputFicheiro = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/broker-clients/importar", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setEstado(j)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro a carregar")
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const enviar = async (simular: boolean) => {
    if (!csv.trim()) { setErro("cola o CSV ou escolhe o ficheiro primeiro"); return }
    setOcupado(simular ? "simular" : "importar")
    setErro(null)
    try {
      const r = await fetch("/api/admin/broker-clients/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, simular }),
      })
      const j = (await r.json()) as Resultado
      setResultado(j)
      if (!j.ok) setErro(j.error || "o ficheiro não passou")
      else if (!simular) await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou")
    } finally {
      setOcupado(null)
    }
  }

  const escolherFicheiro = async (f: File | null | undefined) => {
    if (!f) return
    setCsv(await f.text())
    setResultado(null)
  }

  const f = estado?.frescura
  const revogaveis = resultado?.impacto?.passamASerRevogaveis ?? []

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-300">🏦 Dados da corretora</h2>
        {f && (
          <span className={`text-sm font-semibold ${CORES[f.estado] ?? "text-neutral-400"}`}>
            {f.estado === "sem_dados" ? "nunca importados" : `${f.dias} dias`}
            {f.estado !== "fresco" && " — o gate deixa de decidir por mérito aos " + f.limite}
          </span>
        )}
      </div>

      {erro && <div className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">{erro}</div>}
      {f && f.estado !== "fresco" && (
        <div className="rounded-lg bg-amber-900/30 px-3 py-2 text-sm text-amber-200">{f.mensagem}</div>
      )}

      {estado && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Num label="Clientes" valor={estado.clientes.total} />
          <Num label="Com depósito lido" valor={estado.clientes.comDeposito} alerta={estado.clientes.comDeposito === 0} />
          <Num label={`Cumprem $${estado.minimo}`} valor={estado.clientes.cumpremORegra} alerta={estado.clientes.cumpremORegra === 0} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-neutral-400">
          Portal de IB da PU Prime → Funds/Rebate Report → exporta CSV (máx. 90 dias por download) e larga-o aqui.
          Os números do portal só sincronizam às 08:00 do servidor, por isso um export a meio do dia
          não bate certo ao cêntimo com a conta do cliente.
        </p>
        <input
          ref={inputFicheiro}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="block w-full text-xs text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-neutral-100"
          onChange={(e) => escolherFicheiro(e.target.files?.[0])}
        />
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setResultado(null) }}
          rows={4}
          placeholder="…ou cola aqui o conteúdo do CSV"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100"
        />
        <div className="flex gap-2">
          <button className={`${btn} bg-neutral-700 hover:bg-neutral-600`} disabled={!!ocupado} onClick={() => enviar(true)}>
            {ocupado === "simular" ? "…" : "Simular"}
          </button>
          <button className={`${btn} bg-amber-500 text-black hover:bg-amber-400`} disabled={!!ocupado} onClick={() => enviar(false)}>
            {ocupado === "importar" ? "…" : "Importar a sério"}
          </button>
          <span className="self-center text-xs text-neutral-500">
            Nunca apaga clientes. Nunca concede nem revoga acesso.
          </span>
        </div>
      </div>

      {resultado?.ok && (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-sm">
          <div className="font-semibold text-neutral-200">
            {resultado.simulado ? "Simulação (nada foi gravado)" : `Importado — ${resultado.gravadas} linha(s) gravadas`}
          </div>
          <div className="text-neutral-300">
            {resultado.lidas} lida(s) · <span className="text-emerald-400">{resultado.novos} nova(s)</span> ·{" "}
            <span className="text-amber-400">{resultado.alterados} alterada(s)</span> · {resultado.iguais} igual(is) ·{" "}
            {resultado.ignoradas?.length ?? 0} ignorada(s)
          </div>
          {!!resultado.naoVeioNoFicheiro && (
            <div className="text-xs text-neutral-400">
              {resultado.naoVeioNoFicheiro} cliente(s) da base não vinham no ficheiro — ficaram como estavam.
            </div>
          )}
          {resultado.mapeamento && (
            <div className="text-xs text-neutral-400">
              Mapeamento:{" "}
              {Object.entries(resultado.mapeamento).map(([k, v]) => (
                <span key={k} className="mr-2 whitespace-nowrap">
                  <code className="text-neutral-300">{v}</code> → {k}
                </span>
              ))}
            </div>
          )}

          {/* O aviso que tem de ser lido antes de se carregar em «Importar a sério». */}
          {revogaveis.length > 0 && (
            <div className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">
              ⚠️ <b>{revogaveis.length} pessoa(s) com acesso passam a ser REVOGÁVEIS</b> pelo cron da
              renovação assim que estes dados ficarem frescos:
              <ul className="mt-1 list-inside list-disc text-xs">
                {revogaveis.map((p) => (
                  <li key={p.uid}>{p.quem} — UID {p.uid}, saldo ${p.saldo}</li>
                ))}
              </ul>
            </div>
          )}
          {!!resultado.impacto?.passamAValidar.length && (
            <div className="rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
              ✅ {resultado.impacto.passamAValidar.length} lead(s) passam a cumprir a regra por mérito:{" "}
              {resultado.impacto.passamAValidar.map((p) => p.quem).join(", ")}
            </div>
          )}
          {!!resultado.duplicados?.length && (
            <div className="text-xs text-amber-300">
              UIDs repetidos no ficheiro (ficou a última linha): {resultado.duplicados.join(", ")}
            </div>
          )}
          {!!resultado.ignoradas?.length && (
            <details className="text-xs text-neutral-400">
              <summary className="cursor-pointer">Ver linhas ignoradas</summary>
              <ul className="mt-1 space-y-0.5">
                {resultado.ignoradas.slice(0, 20).map((i) => (
                  <li key={i.linha}>
                    linha {i.linha}: {i.motivo} — <code>{i.amostra}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {resultado && !resultado.ok && !!resultado.cabecalhos?.length && (
        <div className="rounded-lg bg-neutral-950/60 p-3 text-xs text-neutral-400">
          Colunas encontradas no ficheiro: <code className="text-neutral-300">{resultado.cabecalhos.join(" | ")}</code>
        </div>
      )}

      {/* Leads em grace permanente: UID que não existe em broker_clients. Nem validam nem revogam. */}
      {!!estado?.leadsSemCorrespondencia.length && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
          <div className="text-sm font-semibold text-amber-300">
            🔗 {estado.leadsSemCorrespondencia.length} lead(s) com UID que não casa com nenhum cliente
          </div>
          <p className="mt-1 text-xs text-amber-200/70">
            Ficam em grace para sempre: nunca validam por mérito nem podem ser revogados. Ou os dados
            da corretora estão velhos, ou o UID foi mal escrito.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            {estado.leadsSemCorrespondencia.map((o) => (
              <li key={o.chat_id}>
                <b>{o.quem}</b> — UID <code>{o.broker_uid}</code>{o.stage ? ` · ${o.stage}` : ""} — {o.aviso}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Num({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-950/60 p-2">
      <div className={`text-xl font-bold tabular-nums ${alerta ? "text-red-400" : "text-neutral-100"}`}>{valor}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  )
}
