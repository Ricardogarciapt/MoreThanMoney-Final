"use client"

import { useEffect, useMemo, useState } from "react"
import type { ContaCentro } from "@/lib/admin-centro/servidor/contas"
import { appDaConta } from "@/lib/admin-centro/ligacoes"
import { nomeMotivo } from "@/lib/admin-centro/regras"
import ContasCopia from "@/components/admin/mtmauto-copia/contas"
import MTMcopierManager from "@/components/admin/mtmcopier-manager"
import SeccaoFunded from "./funded"
import { agruparContas, type ContaAgrupada } from "@/lib/admin-centro/agrupar-contas"

import { AVISO_SIMULADO, resumirSaldos, textoPct } from "@/lib/admin-centro/linha-de-agua"
import { MarcaProveniencia, PctLinhaDeAgua } from "../linha-de-agua"
import { useCentroCtx } from "../contexto"
import { fmtDinheiro, fmtFlutuante } from "@/lib/format/dinheiro"
import { Loader2, Wallet } from "lucide-react"
import { Azulejo, Botao, BotaoLer, Chip, Filtros, Grupo, Lista, Painel, Pilula, Recolhivel, Tabela, fmtIdade, fmtNum, idadeDe, pedirCentro, td, th, trClic, useCentro } from "../ui"

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
  lido: { curto: "", titulo: "saldo da corretora, última leitura guardada (vista ao vivo, cópia ou «Actualizar saldos»)" },
  referencia: { curto: "ref.", titulo: "saldo de referência guardado ao ligar a conta — não é o actual" },
  maximo: { curto: "máx.", titulo: "o saldo mais alto já visto (MTM Auto) — não é o actual" },
}

/**
 * O saldo de uma conta: o número, de onde vem, se é real ou simulado, e a LINHA DE ÁGUA (saldo
 * actual contra `saldo_inicial`, com sinal) — que é o que o dono pediu para estar sempre à vista.
 * Sem a percentagem, «10 250» não diz nada: a mestre parte de 10 000 e a conta de medição de 1 000.
 */
export function SaldoCel({ c }: { c: ContaCentro }) {
  const f = c.saldoFonte ? FONTE_SALDO[c.saldoFonte] : null
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1" title={f?.titulo}>
        {c.saldo == null ? <span className="text-zinc-600">—</span> : <span className="whitespace-nowrap">{fmtDinheiro(c.saldo)}</span>}
        {f?.curto ? <span className="text-[9.5px] text-zinc-500">{f.curto}</span> : null}
        <MarcaProveniencia p={c.proveniencia} />
      </span>
      <span className="whitespace-nowrap text-[10px]">
        <PctLinhaDeAgua l={c.linhaDeAgua} />
        {c.saldoInicial != null && <span className="ml-1 text-zinc-600">de {fmtNum(c.saldoInicial, 0)}</span>}
      </span>
    </div>
  )
}

/**
 * A equity ao lado do capital: o número, a diferença para o saldo (= o flutuante das posições abertas)
 * e há quanto tempo foi lida, quando vem da corretora. Sem leitura guardada, diz-se em vez de inventar.
 */
export function EquityCel({ c }: { c: ContaCentro }) {
  const flutuante = c.equity != null && c.saldo != null ? c.equity - c.saldo : null
  return (
    <div className="flex flex-col items-start gap-0.5">
      {c.equity == null ? <span className="text-zinc-600" title="sem leitura guardada — usa «Actualizar saldos»">—</span> : <span className="whitespace-nowrap">{fmtDinheiro(c.equity)}</span>}
      <span className="whitespace-nowrap text-[10px]">
        {flutuante != null && Math.abs(flutuante) >= 0.01 && (
          <span className={flutuante > 0 ? "text-emerald-400" : "text-rose-400"} title="equity − capital: o resultado das posições abertas">{fmtFlutuante(flutuante)}</span>
        )}
        {c.saldoFonte === "lido" && c.saldoLidoEm && (
          <span className={`ml-1 ${(idadeDe(c.saldoLidoEm) ?? 0) > 3600 ? "text-amber-500/80" : "text-zinc-600"}`} title={`lido em ${new Date(c.saldoLidoEm).toLocaleString("pt-PT")}`}>há {fmtIdade(idadeDe(c.saldoLidoEm))}</span>
        )}
      </span>
    </div>
  )
}

/** As ligações da conta: uma pílula por app, cada uma abre a SUA gaveta (as acções são por ligação). */
function Ligacoes({ c, abrir }: { c: ContaAgrupada; abrir: (ref: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {c.ligacoes.map((l) => (
        <button
          key={l.ref}
          type="button"
          title={`Abrir a ligação ${appDaConta(l.origem).nome}${l.estado ? ` · ${l.estado}` : ""}`}
          onClick={(e) => { e.stopPropagation(); abrir(l.ref) }}
          className={`rounded border px-1.5 py-px text-[9.5px] transition-colors hover:border-[#D2A63C]/60 hover:text-[#E9C46A] ${tomEstadoConta(l) === "grave" ? "border-rose-500/40 text-rose-300" : "border-zinc-700 text-zinc-400"}`}
        >
          {appDaConta(l.origem).nome}
        </button>
      ))}
    </div>
  )
}

/** Os saldos somados, um total por proveniência e a linha de água de cada conjunto. */
function ResumoSaldos({ contas }: { contas: ContaCentro[] }) {
  const r = resumirSaldos(contas)
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Azulejo
        rotulo="Saldo real"
        valor={r.real.contas ? fmtNum(r.real.saldo, 2) : "—"}
        sub={`${r.real.contas} conta(s) com saldo · ${r.real.comLinha} com linha de partida`}
      />
      <Azulejo
        rotulo="Linha de água · real"
        valor={textoPct(r.real.pct)}
        tom={r.real.pct == null ? "neutro" : r.real.pct >= 0 ? "ok" : "grave"}
        sub={r.real.comLinha ? `contra ${fmtNum(r.real.inicial, 0)} de partida` : "nenhuma conta real declara saldo_inicial"}
      />
      <Azulejo
        rotulo="Saldo simulado"
        valor={r.simulado.contas ? fmtNum(r.simulado.saldo, 2) : "—"}
        tom="aviso"
        sub={`${r.simulado.contas} conta(s) SIM · não se somam às reais`}
      />
      <Azulejo
        rotulo="Linha de água · simulado"
        valor={textoPct(r.simulado.pct)}
        tom="aviso"
        sub={AVISO_SIMULADO}
      />
    </div>
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

  const [premium, setPremium] = useState(false)
  const [ordem, setOrdem] = useState<"" | "capital" | "equity">("")
  // «Actualizar saldos»: lotes de 25 contas de corretora com leitura velha, 3 de cada vez, no servidor.
  const [aLerSaldos, setALerSaldos] = useState(false)
  const [notaSaldos, setNotaSaldos] = useState<string | null>(null)
  const actualizarSaldos = async () => {
    setALerSaldos(true)
    setNotaSaldos(null)
    const r = await pedirCentro<{ lidas: number; falhas: { ref: string; erro: string }[]; restantes: number }>("/api/admin/centro/contas", { method: "POST", body: { acao: "saldos" } })
    setALerSaldos(false)
    if (!r.success || !r.data) { setNotaSaldos(`Falhou: ${r.error ?? "erro"}`); return }
    const d = r.data
    setNotaSaldos(`${d.lidas} lida(s)${d.falhas.length ? ` · ${d.falhas.length} sem leitura` : ""}${d.restantes ? ` · faltam ${d.restantes} (carrega outra vez)` : " · tudo em dia"}`)
    recarregar()
  }
  // `ligacoes` = cada caminho por onde a conta chega (T2T, MTM Auto, WebTrader, Funded); `todas` = a
  // conta uma vez só. Quota e MetaApi contam-se por ligação (cada uma é uma conta MetaApi); o resto
  // conta-se por conta — senão a mesma conta somava o saldo duas vezes.
  const ligacoes = useMemo(() => dados?.contas ?? [], [dados])
  const todas = useMemo(() => agruparContas(ligacoes), [ligacoes])
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    const alguma = (c: ContaAgrupada, f: (l: ContaCentro) => boolean) => c.ligacoes.some(f)
    const filtradas = todas.filter((c) => {
      if (plataforma && c.plataforma !== plataforma) return false
      if (categoria && !alguma(c, (l) => l.categoria === categoria)) return false
      if (premium && (!ehPremium(c) || c.categoria === "mestre")) return false
      if (problema === "inexistente" && !alguma(c, (l) => l.metaapi.inexistente)) return false
      if (problema === "1" && !alguma(c, (l) => tomEstadoConta(l) === "grave" || l.quota.acima)) return false
      if (problema === "quota" && !alguma(c, (l) => l.quota.acima)) return false
      if (t && !c.ligacoes.some((l) => [l.email, l.nome, l.login, l.servidor, l.rotulo, l.etiquetaDoDono, l.metaapiAccountId, l.ref].some((x) => x && x.toLowerCase().includes(t)))) return false
      return true
    })
    if (!ordem) return filtradas
    // Sem valor vai para o fim, por qualquer ordem.
    const v = (c: ContaAgrupada) => (ordem === "capital" ? c.saldo : c.equity)
    return [...filtradas].sort((a, b) => { const x = v(a), y = v(b); return x == null ? (y == null ? 0 : 1) : y == null ? -1 : y - x })
  }, [todas, q, plataforma, categoria, problema, premium, ordem])

  const graves = todas.filter((c) => c.ligacoes.some((l) => tomEstadoConta(l) === "grave")).length
  const premiumLista = todas.filter((c) => ehPremium(c) && c.categoria !== "mestre")
  const funded = todas.filter((c) => c.plataforma === "mtmfunded")
  const verFunded = () => { setPlataforma("mtmfunded"); setCategoria(""); setPremium(false); setProblema("") }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        <Azulejo rotulo="Contas" valor={fmtNum(todas.length)} sub={`${todas.filter((c) => c.ativa).length} activas · ${ligacoes.length} ligações`} />
        <Azulejo rotulo="MetaApi" valor={ligacoes.filter((c) => c.contaMetaApi).length} sub="ligações que contam para a quota" />
        <Azulejo rotulo="Com problema" valor={graves} tom={graves ? "grave" : "ok"} onClick={() => setProblema("1")} />
        <Azulejo rotulo="MetaApi inexistente" valor={ligacoes.filter((c) => c.metaapi.inexistente).length} tom={ligacoes.some((c) => c.metaapi.inexistente) ? "aviso" : "ok"} onClick={() => setProblema("inexistente")} />
        <Azulejo rotulo="Acima da quota" valor={ligacoes.filter((c) => c.quota.acima).length} tom={ligacoes.some((c) => c.quota.acima) ? "aviso" : "neutro"} onClick={() => setProblema("quota")} />
        <Azulejo rotulo="Seguem o Premium" valor={premiumLista.length} sub={`${premiumLista.filter((c) => c.ativa).length} activas`} onClick={() => setPremium(true)} />
        <Azulejo rotulo="MTM Funded" valor={funded.length} sub={`${todas.filter((c) => c.categoria === "casa").length} da casa · ${funded.filter((c) => c.mestreDe).length} mestres`} onClick={verFunded} />
      </div>

      {/* Os saldos em DOIS totais. Somá-los daria um número que não está em conta nenhuma — e que
          passaria por prova, porque o simulado entra a preço melhor do que o mercado deu. */}
      <ResumoSaldos contas={todas} />

      <Painel titulo="Todas as contas" sub="T2T/site, MTM Auto, WebTrader e MTM Funded — estado, capital e equity guardados na base, sem chamadas à MetaApi por linha. Clica para abrir a gaveta com acções." accao={(
        <div className="flex items-center gap-1.5">
          <Botao onClick={actualizarSaldos} disabled={aLerSaldos} title="Lê saldo e equity das contas MT4/MT5/TradeLocker com leitura de mais de 10 min (25 de cada vez). As MTM Funded já vêm do motor.">
            {aLerSaldos ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wallet className="h-3 w-3" />}Actualizar saldos
          </Botao>
          <BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />
        </div>
      )}>
        {notaSaldos && <p className="mb-2 text-[11px] text-zinc-400">{notaSaldos}</p>}
        <Filtros q={q} aoMudarQ={setQ} exemplo="email, login, servidor, etiqueta, id MetaApi…" contagem={lista.length} total={todas.length}>
          <Chip activo={!plataforma} onClick={() => setPlataforma("")}>todas</Chip>
          {PLATAFORMAS.map((p) => <Chip key={p} activo={plataforma === p} onClick={() => setPlataforma(p)}>{p}</Chip>)}
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          {CATEGORIAS.map((c) => <Chip key={c} activo={categoria === c} onClick={() => setCategoria(categoria === c ? "" : c)}>{c}</Chip>)}
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <Chip activo={premium} onClick={() => setPremium(!premium)}>segue o Premium</Chip>
          {problema && <Chip activo onClick={() => setProblema("")}>filtro: {problema === "1" ? "com problema" : problema} ✕</Chip>}
        </Filtros>
        <Lista dados={dados} erro={erro} avisos={dados?.avisos} vazio={todas.length === 0} textoVazio="Nenhuma conta ligada em nenhum produto." filtrada={lista.length === 0}>
          <Tabela min={1200}>
            <thead><tr><th className={th}>Conta</th><th className={th}>Dono · direito</th><th className={th}>Estado</th><th className={th}>MetaApi · quota</th><th className={th}>Usos</th><th className={th} title="saldo actual · linha de água (contra saldo_inicial) · «SIM» = conta simulada · clica para ordenar"><button type="button" onClick={() => setOrdem(ordem === "capital" ? "" : "capital")} className="uppercase tracking-wider hover:text-[#E9C46A]">Capital{ordem === "capital" ? " ↓" : ""}</button></th><th className={th} title="equity · flutuante (equity − capital) · idade da leitura · clica para ordenar"><button type="button" onClick={() => setOrdem(ordem === "equity" ? "" : "equity")} className="uppercase tracking-wider hover:text-[#E9C46A]">Equity{ordem === "equity" ? " ↓" : ""}</button></th><th className={th}>Actividade</th><th className={th} /></tr></thead>
            <tbody>
              {lista.slice(0, 500).map((c) => (
                <tr key={c.ref} className={trClic} onClick={() => ctx.abrir({ tipo: "conta", id: c.ref })}>
                  <td className={td}>
                    <p className="font-mono text-zinc-100">{c.plataforma.toUpperCase()} {c.login ?? "—"}</p>
                    {c.etiquetaDoDono && <p className="truncate text-[10.5px] text-[#E9C46A]" title="etiqueta do dono">{c.etiquetaDoDono}</p>}
                    <p className="text-[10px] text-zinc-500">{c.servidor ?? "—"}{c.rotulo ? ` · ${c.rotulo}` : ""} · {c.categoria}{c.demo ? " · demo" : ""}</p>
                    <Ligacoes c={c} abrir={(ref) => ctx.abrir({ tipo: "conta", id: ref })} />
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
                    {c.metaapiAccountId ? <p className="font-mono text-zinc-400">{c.metaapiAccountId.slice(0, 8)}</p> : <span className="text-zinc-600">sem MetaApi</span>}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {c.contaMetaApi && <Pilula tom={c.quota.acima ? "aviso" : "neutro"} title="contas MetaApi do dono / limite do plano">quota {c.quota.emUso}/{c.quota.limite ?? "∞"}</Pilula>}
                      {c.metaapi.inexistente && <Pilula tom="grave">inexistente</Pilula>}
                      {c.metaapi.streaming && <Pilula tom={c.metaapi.streaming === "fresco" ? "ok" : "aviso"}>stream</Pilula>}
                      {c.metaapi.motorTempoReal && <Pilula tom="info">motor</Pilula>}
                    </div>
                  </td>
                  <td className={`${td} max-w-[240px] text-[10.5px] text-zinc-400`}>{[...c.usos, ...c.estrategias.filter((e) => !c.usos.some((u) => u.includes(e)))].join(" · ")}</td>
                  <td className={`${td} font-mono`}><SaldoCel c={c} /></td>
                  <td className={`${td} font-mono`}><EquityCel c={c} /></td>
                  <td className={`${td} font-mono`}>{c.ultimaActividade ? fmtIdade(idadeDe(c.ultimaActividade)) : "—"}</td>
                  <td className={td}>
                    <span className="rounded-md border border-[#D2A63C]/40 px-2 py-1 text-[10.5px] font-medium text-[#E9C46A]">Gerir</span>
                  </td>
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

      {/* Era a secção «MTM Funded» (?s=funded, que redirecciona para aqui com grupo=funded). As contas
          Funded já estão na lista de cima; os programas, a equidade da casa e o gestor ficam aqui. */}
      <Grupo titulo="MTM Funded" nota="Programas, equidade da casa, contas emitidas e o gestor completo.">
        <Recolhivel titulo="MTM Funded · programas, contas e gestor" descricao="Equidade MTM, contas de clientes e mestres, a ficha de cada conta e o gestor (lançamento, torneios, levantamentos, certificados)." aberto={ctx.filtro.grupo === "funded"}>
          <SeccaoFunded aoVerContas={verFunded} />
        </Recolhivel>
      </Grupo>
    </div>
  )
}
