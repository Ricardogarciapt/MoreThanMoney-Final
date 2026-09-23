"use client"

import { useEffect, useMemo, useState } from "react"
import type { ContaCentro } from "@/lib/admin-centro/servidor/contas"
import { nomeMotivo } from "@/lib/admin-centro/regras"
import ContasCopia from "@/components/admin/mtmauto-copia/contas"
import MTMcopierManager from "@/components/admin/mtmcopier-manager"

import { useCentroCtx } from "../contexto"
import { Azulejo, BotaoLer, Chip, Filtros, Grupo, Lista, Painel, Pilula, Recolhivel, Tabela, Vazio, fmtIdade, fmtNum, idadeDe, td, th, trClic, useCentro } from "../ui"

export type DadosContas = { contas: ContaCentro[]; avisos: string[]; lidaEm: string }

const PLATAFORMAS = ["mt5", "mt4", "tradelocker", "mtmfunded"] as const
const CATEGORIAS = ["cliente", "casa", "seguidora", "equipa", "mestre"] as const

export function tomEstadoConta(c: ContaCentro) {
  if (c.metaapi.inexistente) return "grave" as const
  if (c.erro && c.erroEstado === "actual") return "grave" as const
  if (/error|erro|breach|quebr/i.test(c.estado)) return "grave" as const
  if (!c.ativa) return "neutro" as const
  if (/pending|a_ligar|deploying/i.test(c.estado)) return "aviso" as const
  return "ok" as const
}

/**
 * Conta que segue o MTM Auto Premium, venha de onde vier: subscrição MTM Auto («MTM Auto Premium»),
 * conta MTM Funded a seguir `premium-ouro`, rota do motor das mestres `premium-ouro`, ou a ligação
 * do site subscrita à estratégia CopyFactory do Premium (MxsR).
 */
export function ehPremium(c: ContaCentro) {
  return [...c.usos, ...c.estrategias].some((x) => /premium-ouro|MTM Auto Premium|\bMxsR\b/i.test(x))
}

const FONTE_SALDO: Record<string, { curto: string; titulo: string }> = {
  atual: { curto: "", titulo: "saldo actual (motor MTM Funded)" },
  referencia: { curto: "ref.", titulo: "saldo de referência guardado ao ligar a conta — não é o actual" },
  maximo: { curto: "máx.", titulo: "o saldo mais alto já visto (MTM Auto) — não é o actual" },
}

export function SaldoCel({ c }: { c: ContaCentro }) {
  if (c.saldo == null) return <span className="text-zinc-600">—</span>
  const f = c.saldoFonte ? FONTE_SALDO[c.saldoFonte] : null
  return <span title={f?.titulo}>{fmtNum(c.saldo, 2)}{f?.curto ? <span className="ml-1 text-[9.5px] text-zinc-500">{f.curto}</span> : null}</span>
}

/** A mesma conta pode vir de duas origens (a linha MTM Auto de uma MTM Funded e a própria MTM Funded). */
function semRepetidas(contas: ContaCentro[]) {
  const vistas = new Map<string, ContaCentro>()
  const peso = (c: ContaCentro) => (c.origem === "funded" ? 3 : c.origem === "site" ? 2 : 1)
  for (const c of contas) {
    const chave = c.login ? `${c.plataforma}:${c.login}` : c.ref
    const ja = vistas.get(chave)
    if (!ja || peso(c) > peso(ja)) vistas.set(chave, c)
  }
  return [...vistas.values()]
}

function SubscritorasPremium({ contas, abrir }: { contas: ContaCentro[]; abrir: (ref: string) => void }) {
  const lista = semRepetidas(contas.filter(ehPremium).filter((c) => c.categoria !== "mestre"))
    .sort((a, b) => (b.saldo ?? -1) - (a.saldo ?? -1))
  const comSaldo = lista.filter((c) => c.saldo != null)
  const total = comSaldo.reduce((s, c) => s + (c.saldo ?? 0), 0)
  const soActual = comSaldo.filter((c) => c.saldoFonte === "atual").length
  const activas = lista.filter((c) => c.ativa).length
  return (
    <Painel titulo="Subscritoras do MTM Premium" sub={`${lista.length} contas · ${activas} activas · saldo somado ${fmtNum(total, 2)} · ${comSaldo.length} com saldo (${soActual} actuais; «ref.» = ao ligar, «máx.» = o mais alto visto)`}>
      {lista.length === 0 ? <Vazio>Nenhuma conta a seguir o Premium.</Vazio> : (
        <Tabela min={760}>
          <thead><tr><th className={th}>Conta</th><th className={th}>Dono</th><th className={th}>Como segue</th><th className={th}>Estado</th><th className={th}>Saldo</th><th className={th}>Equity</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.ref} className={trClic} onClick={() => abrir(c.ref)}>
                <td className={td}>
                  <p className="font-mono text-zinc-100">{c.plataforma.toUpperCase()} {c.login ?? "—"}</p>
                  <p className="text-[10px] text-zinc-500">{c.servidor ?? "—"} · {c.origem} · {c.categoria}{c.demo ? " · demo" : ""}</p>
                </td>
                <td className={td}><p className="text-zinc-200">{c.nome ?? c.email ?? "—"}</p><p className="text-[10px] text-zinc-500">{c.email ?? ""}</p></td>
                <td className={`${td} max-w-[260px] text-[10.5px] text-zinc-400`}>{[...c.usos, ...c.estrategias].filter((x) => /premium|MxsR/i.test(x)).join(" · ")}</td>
                <td className={td}><Pilula tom={tomEstadoConta(c)}>{c.ativa ? c.estado : `${c.estado} · pausada`}</Pilula></td>
                <td className={`${td} font-mono`}><SaldoCel c={c} /></td>
                <td className={`${td} font-mono`}>{c.equity == null ? "—" : fmtNum(c.equity, 2)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Painel>
  )
}

export default function SeccaoContas() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<DadosContas>(`/api/admin/centro/contas?v=${ctx.versao}`, 30_000)
  const [q, setQ] = useState("")
  const [plataforma, setPlataforma] = useState("")
  const [categoria, setCategoria] = useState("")
  const [problema, setProblema] = useState(ctx.filtro.problema ?? "")
  useEffect(() => { setProblema(ctx.filtro.problema ?? "") }, [ctx.filtro])

  const todas = dados?.contas ?? []
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return todas.filter((c) => {
      if (plataforma && c.plataforma !== plataforma) return false
      if (categoria && c.categoria !== categoria) return false
      if (problema === "inexistente" && !c.metaapi.inexistente) return false
      if (problema === "1" && tomEstadoConta(c) !== "grave" && !c.quota.acima) return false
      if (problema === "quota" && !c.quota.acima) return false
      if (t && ![c.email, c.nome, c.login, c.servidor, c.rotulo, c.etiquetaDoDono, c.metaapiAccountId, c.ref].some((x) => x && x.toLowerCase().includes(t))) return false
      return true
    })
  }, [todas, q, plataforma, categoria, problema])

  const graves = todas.filter((c) => tomEstadoConta(c) === "grave").length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Azulejo rotulo="Contas" valor={fmtNum(todas.length)} sub={`${todas.filter((c) => c.ativa).length} activas`} />
        <Azulejo rotulo="MetaApi" valor={todas.filter((c) => c.contaMetaApi).length} sub="contam para a quota" />
        <Azulejo rotulo="Com problema" valor={graves} tom={graves ? "grave" : "ok"} onClick={() => setProblema("1")} />
        <Azulejo rotulo="MetaApi inexistente" valor={todas.filter((c) => c.metaapi.inexistente).length} tom={todas.some((c) => c.metaapi.inexistente) ? "aviso" : "ok"} onClick={() => setProblema("inexistente")} />
        <Azulejo rotulo="Acima da quota" valor={todas.filter((c) => c.quota.acima).length} tom={todas.some((c) => c.quota.acima) ? "aviso" : "neutro"} onClick={() => setProblema("quota")} />
        <Azulejo rotulo="MTM Funded" valor={todas.filter((c) => c.plataforma === "mtmfunded").length} sub={`${todas.filter((c) => c.categoria === "casa").length} da casa · ${todas.filter((c) => c.mestreDe).length} mestres de estratégia`} />
      </div>

      {dados && <SubscritorasPremium contas={todas} abrir={(ref) => ctx.abrir({ tipo: "conta", id: ref })} />}

      <Painel titulo="Todas as contas" sub="T2T/site, MTM Auto, WebTrader e MTM Funded — estado guardado na base, sem chamadas à MetaApi. Clica para abrir a gaveta com acções." accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}>
        <Filtros q={q} aoMudarQ={setQ} exemplo="email, login, servidor, etiqueta, id MetaApi…" contagem={lista.length} total={todas.length}>
          <Chip activo={!plataforma} onClick={() => setPlataforma("")}>todas</Chip>
          {PLATAFORMAS.map((p) => <Chip key={p} activo={plataforma === p} onClick={() => setPlataforma(p)}>{p}</Chip>)}
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          {CATEGORIAS.map((c) => <Chip key={c} activo={categoria === c} onClick={() => setCategoria(categoria === c ? "" : c)}>{c}</Chip>)}
          {problema && <Chip activo onClick={() => setProblema("")}>filtro: {problema === "1" ? "com problema" : problema} ✕</Chip>}
        </Filtros>
        <Lista dados={dados} erro={erro} avisos={dados?.avisos} vazio={todas.length === 0} textoVazio="Nenhuma conta ligada em nenhum produto." filtrada={lista.length === 0}>
          <Tabela min={1100}>
            <thead><tr><th className={th}>Conta</th><th className={th}>Dono · direito</th><th className={th}>Estado</th><th className={th}>MetaApi</th><th className={th}>Quota</th><th className={th}>Usos</th><th className={th}>Saldo</th><th className={th}>Actividade</th></tr></thead>
            <tbody>
              {lista.slice(0, 500).map((c) => (
                <tr key={c.ref} className={trClic} onClick={() => ctx.abrir({ tipo: "conta", id: c.ref })}>
                  <td className={td}>
                    <p className="font-mono text-zinc-100">{c.plataforma.toUpperCase()} {c.login ?? "—"}</p>
                    {c.etiquetaDoDono && <p className="truncate text-[10.5px] text-[#E9C46A]" title="etiqueta do dono">{c.etiquetaDoDono}</p>}
                    <p className="text-[10px] text-zinc-500">{c.servidor ?? "—"}{c.rotulo ? ` · ${c.rotulo}` : ""} · {c.origem} · {c.categoria}{c.demo ? " · demo" : ""}</p>
                  </td>
                  <td className={td}>
                    {c.userId ? (
                      <button type="button" className="text-left hover:text-[#E9C46A]" onClick={(e) => { e.stopPropagation(); ctx.abrir({ tipo: "utilizador", id: c.userId! }) }}>
                        <p className="text-zinc-200">{c.email ?? c.userId.slice(0, 8)}</p>
                        <p className="text-[10px] text-zinc-500">{c.plano} · {nomeMotivo(c.motivoDireito)}</p>
                      </button>
                    ) : "—"}
                  </td>
                  <td className={td}>
                    <Pilula tom={tomEstadoConta(c)}>{c.ativa ? c.estado : `${c.estado} · pausada`}</Pilula>
                    {c.erro && <p className={`mt-1 max-w-[220px] truncate text-[10px] ${c.erroEstado === "actual" ? "text-rose-300" : "text-zinc-600"}`} title={c.erro}>{c.erroEstado === "velho" ? "histórico: " : ""}{c.erro}</p>}
                  </td>
                  <td className={`${td} text-[10.5px]`}>
                    {c.metaapiAccountId ? <p className="font-mono text-zinc-400">{c.metaapiAccountId.slice(0, 8)}</p> : <span className="text-zinc-600">—</span>}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {c.metaapi.inexistente && <Pilula tom="grave">inexistente</Pilula>}
                      {c.metaapi.streaming && <Pilula tom={c.metaapi.streaming === "fresco" ? "ok" : "aviso"}>stream</Pilula>}
                      {c.metaapi.motorTempoReal && <Pilula tom="info">motor</Pilula>}
                    </div>
                  </td>
                  <td className={`${td} font-mono`}>{c.contaMetaApi ? <span className={c.quota.acima ? "text-amber-300" : ""}>{c.quota.emUso}/{c.quota.limite ?? "∞"}</span> : <span className="text-zinc-600">n/a</span>}</td>
                  <td className={`${td} max-w-[240px] text-[10.5px] text-zinc-400`}>{[...c.usos, ...c.estrategias.filter((e) => !c.usos.some((u) => u.includes(e)))].join(" · ")}</td>
                  <td className={`${td} font-mono`}><SaldoCel c={c} /></td>
                  <td className={`${td} font-mono`}>{c.ultimaActividade ? fmtIdade(idadeDe(c.ultimaActividade)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Lista>
        {lista.length > 500 && <p className="mt-2 text-[11px] text-zinc-500">A mostrar as primeiras 500 — filtra para ver as restantes {fmtNum(lista.length - 500)}.</p>}
      </Painel>

      <Grupo titulo="Painéis clássicos" nota="Lêem a MetaApi ou fazem escritas — por isso ficam fechados; abre só quando precisares.">
        <Recolhivel titulo="Contas com MetaApi ao vivo" descricao="Fotografia da MetaApi (60 s), vista de posições e acções.">
          <ContasCopia />
        </Recolhivel>
        <Recolhivel titulo="Gestor detalhado por utilizador" descricao="Lotes, prop firm, trailing, auditoria de risco, re-sync, testar MT5, últimos sinais." aberto={Boolean(ctx.filtro.userId)}>
          <MTMcopierManager highlightUserId={ctx.filtro.userId ?? null} />
        </Recolhivel>
      </Grupo>
    </div>
  )
}
