"use client"

/**
 * O ORÇAMENTO DOS AGENTES — dar saldo, registar despesa, tetos por dia e por mês, e o livro.
 *
 * Os números e o motivo do bloqueio vêm do servidor (`lib/agentes/orcamento-agente.ts`), a mesma
 * conta que o motor do AIOS faz antes de acordar um agente. Aqui só se mostra e se pede.
 */

import { useState } from "react"
import { Wallet } from "lucide-react"
import {
  Aviso, Azulejo, Botao, BotaoLer, Faixa, Gaveta, Painel, Pilula, Tabela, Vazio,
  fmtNum, fmtQuando, pedirCentro, td, th, useCentro,
} from "@/components/admin/centro/ui"

type Agente = {
  id: string; nome: string; pilar: string; estado: string; pausado: boolean
  orcamento: number; gasto: number; saldo: number; gasto_dia: number; gasto_mes: number
  teto_dia: number | null; teto_mes: number | null; bloqueado: string | null
}
type Movimento = { id: string; agente_id: string; tipo: string; valor: number | null; detalhe: string | null; criado_em: string }
type Dados = {
  ok: boolean; semTetos: boolean; agentes: Agente[]; livro: Movimento[]
  totais: { saldo: number; gasto_dia: number; gasto_mes: number; bloqueados: number }
}
type Accao = "carregar" | "despesa" | "tetos"

const din = (v: number | null | undefined) => fmtNum(v ?? 0, 2)
const ROTULO: Record<string, string> = { credito: "saldo dado", gastou: "despesa", teto: "tetos" }

export default function AgentesOrcamento() {
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<Dados>("/api/admin/agentes/orcamento", 30_000)
  const [alvo, setAlvo] = useState<{ a: Agente; accao: Accao } | null>(null)
  const [valor, setValor] = useState("")
  const [tetoDia, setTetoDia] = useState("")
  const [tetoMes, setTetoMes] = useState("")
  const [porque, setPorque] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState<{ tom: "info" | "grave"; txt: string } | null>(null)

  const abrir = (a: Agente, accao: Accao) => {
    setAlvo({ a, accao })
    setValor("")
    setPorque("")
    setTetoDia(a.teto_dia != null ? String(a.teto_dia) : "")
    setTetoMes(a.teto_mes != null ? String(a.teto_mes) : "")
  }

  const enviar = async () => {
    if (!alvo) return
    setOcupado(true)
    const corpo = alvo.accao === "tetos"
      ? { acao: "tetos", id: alvo.a.id, teto_dia: tetoDia, teto_mes: tetoMes, porque }
      : { acao: alvo.accao, id: alvo.a.id, valor, porque }
    const r = await pedirCentro<{ ok: boolean; porque?: string }>("/api/admin/agentes/orcamento", { method: "POST", body: corpo })
    setOcupado(false)
    if (!r.success) { setNota({ tom: "grave", txt: r.error ?? "Não foi possível." }); return }
    setNota({ tom: "info", txt: r.data?.porque ?? "Feito." })
    setAlvo(null)
    void recarregar()
  }

  const nomes = new Map((dados?.agentes ?? []).map((a) => [a.id, a.nome]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12px] text-zinc-400">
          O saldo é o que cada agente pode gastar (orçamento menos gasto). Sem saldo, ou com o teto do dia ou do mês
          atingido, o motor não o acorda. Tudo o que dás ou registas fica no livro.
        </p>
        <BotaoLer onClick={() => void recarregar()} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>

      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {nota && <Aviso tom={nota.tom}>{nota.txt}</Aviso>}
      {dados?.semTetos && <Aviso>Os tetos precisam da migração 207. Até lá dá para ver o saldo, mas não para carregar nem pôr tetos.</Aviso>}

      {dados && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Azulejo rotulo="Saldo da equipa" valor={din(dados.totais.saldo)} />
          <Azulejo rotulo="Gasto hoje" valor={din(dados.totais.gasto_dia)} />
          <Azulejo rotulo="Gasto este mês" valor={din(dados.totais.gasto_mes)} />
          <Azulejo rotulo="Bloqueados" valor={dados.totais.bloqueados} tom={dados.totais.bloqueados ? "aviso" : "ok"} sub="sem saldo ou no teto" />
        </div>
      )}

      <Painel titulo="Por agente" icone={<Wallet className="h-3.5 w-3.5 text-[#D2A63C]" />}>
        {!dados ? <Vazio>A ler…</Vazio> : dados.agentes.length === 0 ? <Vazio>Ainda não há agentes.</Vazio> : (
          <Tabela min={820}>
            <thead>
              <tr>
                <th className={th}>Agente</th>
                <th className={th}>Saldo</th>
                <th className={th}>Hoje</th>
                <th className={th}>Mês</th>
                <th className={th}>Estado</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {dados.agentes.map((a) => (
                <tr key={a.id}>
                  <td className={td}>
                    <p className="text-white">{a.nome}</p>
                    <p className="text-[10.5px] text-zinc-500">{a.pilar}{a.pausado ? " · pausado" : ""}</p>
                  </td>
                  <td className={`${td} font-mono`}>
                    <span className={a.saldo > 0 ? "text-white" : "text-rose-300"}>{din(a.saldo)}</span>
                    <span className="text-zinc-600"> / {din(a.orcamento)}</span>
                  </td>
                  <td className={`${td} font-mono`}>
                    {din(a.gasto_dia)}<span className="text-zinc-600"> / {a.teto_dia != null ? din(a.teto_dia) : "∞"}</span>
                  </td>
                  <td className={`${td} font-mono`}>
                    {din(a.gasto_mes)}<span className="text-zinc-600"> / {a.teto_mes != null ? din(a.teto_mes) : "∞"}</span>
                  </td>
                  <td className={td}>
                    {a.bloqueado ? <Pilula tom="aviso" title={a.bloqueado}>bloqueado</Pilula> : <Pilula tom="ok">pode gastar</Pilula>}
                    {a.bloqueado && <p className="mt-1 max-w-[220px] text-[10.5px] text-amber-300/80">{a.bloqueado}</p>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="inline-flex gap-1">
                      <Botao tom="ouro" onClick={() => abrir(a, "carregar")} disabled={dados.semTetos}>Dar saldo</Botao>
                      <Botao onClick={() => abrir(a, "despesa")} disabled={dados.semTetos}>Despesa</Botao>
                      <Botao onClick={() => abrir(a, "tetos")} disabled={dados.semTetos}>Tetos</Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>

      <Painel titulo="Livro do dinheiro" sub="Saldo dado, despesas e mudanças de teto, dos últimos 32 dias.">
        {!dados?.livro.length ? <Vazio>Sem movimentos.</Vazio> : (
          <div className="space-y-1.5">
            {dados.livro.map((m) => (
              <Faixa key={m.id} tom={m.tipo === "credito" ? "ok" : m.tipo === "gastou" ? "aviso" : "info"}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span className="font-mono text-zinc-500">{fmtQuando(m.criado_em)}</span>
                  <span className="text-white">{nomes.get(m.agente_id) ?? "—"}</span>
                  <span className="text-zinc-400">{ROTULO[m.tipo] ?? m.tipo}</span>
                  {m.tipo !== "teto" && m.valor != null && (
                    <span className={`font-mono ${m.tipo === "credito" ? "text-emerald-300" : "text-amber-300"}`}>
                      {m.tipo === "credito" ? "+" : "−"}{din(Number(m.valor))}
                    </span>
                  )}
                  {m.detalhe && <span className="text-zinc-500">{m.detalhe}</span>}
                </div>
              </Faixa>
            ))}
          </div>
        )}
      </Painel>

      <Gaveta
        aberta={!!alvo}
        aoFechar={() => setAlvo(null)}
        largura="max-w-md"
        titulo={alvo ? `${alvo.accao === "carregar" ? "Dar saldo a" : alvo.accao === "despesa" ? "Registar despesa de" : "Tetos de"} ${alvo.a.nome}` : ""}
        sub={alvo ? `Saldo ${din(alvo.a.saldo)} · hoje ${din(alvo.a.gasto_dia)} · mês ${din(alvo.a.gasto_mes)}` : undefined}
      >
        {alvo && (
          <div className="space-y-3">
            {alvo.accao === "tetos" ? (
              <>
                <label className="block text-[11px] text-zinc-400">Teto por dia (vazio = sem teto)
                  <input inputMode="decimal" value={tetoDia} onChange={(e) => setTetoDia(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-white" />
                </label>
                <label className="block text-[11px] text-zinc-400">Teto por mês (vazio = sem teto)
                  <input inputMode="decimal" value={tetoMes} onChange={(e) => setTetoMes(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-white" />
                </label>
              </>
            ) : (
              <label className="block text-[11px] text-zinc-400">Valor
                <input inputMode="decimal" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-white" />
              </label>
            )}
            <label className="block text-[11px] text-zinc-400">
              {alvo.accao === "despesa" ? "Em que se gastou (obrigatório)" : "Porquê (opcional, fica no livro)"}
              <input value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={300} className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white" />
            </label>
            <div className="flex justify-end gap-2">
              <Botao onClick={() => setAlvo(null)}>Cancelar</Botao>
              <Botao tom="ouro" onClick={() => void enviar()} disabled={ocupado}>{ocupado ? "…" : "Gravar"}</Botao>
            </div>
          </div>
        )}
      </Gaveta>
    </div>
  )
}
