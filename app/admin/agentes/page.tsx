"use client"

/**
 * O DASHBOARD DA EQUIPA DE AGENTES (/admin/agentes) — a ÁRVORE, não uma lista.
 *
 * ═══ PORQUE É QUE ISTO VIVE DEBAIXO DE /admin E NÃO EM /agentes ════════════════════════════
 *
 * Porque mostra receita por agente e os códigos `?ag=` de atribuição, e os dados vêm de
 * `/api/admin/agentes`, que é fechado por `requireAdmin`. Em `/agentes`, sem sessão de admin, a
 * página carregava e ficava vazia com um erro — uma página pública que nunca mostra nada é pior do
 * que não existir. E os códigos de atribuição em circulação são a própria medição: publicá-los era
 * convidar a que a receita de um agente fosse colada a outro.
 *
 * ═══ O QUE ISTO ACRESCENTA AO PAINEL QUE JÁ EXISTIA ════════════════════════════════════════
 *
 * `components/admin/agentes-equipa.tsx` (secção «agentes» do /admin) continua a ser o painel de
 * trabalho: lista, botões, livro de eventos. Isto é o ecrã de ESTADO — a hierarquia inteira num
 * olhar, para abrir numa janela e deixar aberto. Partilham a MESMA API e o MESMO módulo de árvore:
 * dois ecrãs a derivar hierarquia por conta própria acabariam a discordar, e discordariam no caso
 * difícil.
 *
 * ═══ O QUE ESTE ECRÃ SE RECUSA A FAZER ═════════════════════════════════════════════════════
 *
 *  · não pinta ninguém de vivo por omissão. A cor vem de `estadoNoEcra`, que resolve o conflito
 *    entre as colunas `estado` e `pausado` e DECLARA o conflito quando ele existe;
 *  · não desenha contagens decrescentes negativas. O relógio vem de `relogioDoJuizo`, que devolve
 *    uma fase e uma frase em vez de um número com sinal;
 *  · não esconde um filho cujo `pai_id` não bate. Aparece no topo, marcado, com o motivo;
 *  · não lê a receita por atribuir como zero. Quando não vem medida, diz-se.
 *
 * Tudo isto está provado em `lib/agentes/arvore.check.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowLeft, Ban, Bot, Copy, Crown, GraduationCap, Loader2, Pause, Play,
  Handshake, PauseCircle, PlayCircle, Power, RefreshCw, Terminal, TrendingDown, TrendingUp, Wrench,
} from "lucide-react"
import { linkDoAgente } from "@/lib/agentes/atribuicao"
import {
  CORTES_DA_ESCALA, achatar, escalaDeVida, estadoNoEcra, montarArvore, relogioDoJuizo,
  resumoDaEquipa, textoDoPilar, type Escala, type No,
} from "@/lib/agentes/arvore"

type Juizo = { decisao: "continua" | "avisa" | "morre" | "espera"; porque: string }

type Agente = {
  id: string
  nome: string
  papel: string | null
  pilar: "ceo" | "trading" | "educacao" | "desenvolvimento" | "vendas"
  pai_id: string | null
  estado: "vivo" | "em_risco" | "parado" | "pausado" | "reformado" | "morto"
  pausado: boolean
  instrucoes: string | null
  chave_receita: string | null
  orcamento: number
  gasto: number
  receita: number
  saldo: number
  receita_janela: number
  gasto_janela: number
  resultado: number
  criado_em: string | null
  avaliado_em: string | null
  parado_em: string | null
  parado_porque: string | null
  /** 06/10: a régua das 48 h sem receita mata — e arquiva. */
  morto_em?: string | null
  causa_morte?: string | null
  ultima_receita_em?: string | null
  mutacao?: string | null
  juizo: Juizo
  ilegivel: string[]
}

type PorAtribuir = { motivo: string; cents: number; vendas: number; porque: string }

/** Um pedido do CEO a um filho, com prazo e desfecho. */
type Pedido = {
  id: string
  para_agente_id: string
  accao: string
  porque: string
  prazo: string | null
  desfecho: string | null
  criado_em: string | null
}

/** Um bloqueio que o CEO NÃO pode desbloquear, com a decisão pronta a tomar. */
type Escalonamento = {
  id: string
  assunto: string
  o_que: string
  porque: string
  decisao_pronta: string
  estado: string
  criado_em: string | null
}

/** Uma reescrita de instruções — aceite ou RECUSADA pela guarda. */
type Reescrita = {
  id: string
  agente_id: string
  autor: string
  aceita: boolean
  limites_perdidos: string[] | null
  limites_acrescentados: string[] | null
  veredicto: string
  criado_em: string | null
}

type Dados = {
  ok: boolean
  janelaHoras: number
  gracaHoras?: number
  /** O interruptor geral do motor autónomo (o mesmo do painel do AIOS e do Telegram). */
  motor?: { ligado: boolean; por: string | null; em: string | null; porque: string | null }
  agentes: Agente[]
  receita: {
    moeda: string
    liquidoCents: number
    atribuidoCents: number
    naoAtribuidoCents: number
    porAtribuir: PorAtribuir[]
  }
  /** Opcionais porque um erro de leitura destes NÃO deve rebentar o painel de estado. */
  pedidos?: Pedido[]
  escalonamentos?: Escalonamento[]
  reescritas?: Reescrita[]
}

/** Para onde apontam os links de um agente — as superfícies que já cobram hoje. */
const DESTINOS = [
  { caminho: "/marketplace", rotulo: "Marketplace" },
  { caminho: "/upgrade", rotulo: "Planos" },
  { caminho: "/scanner-access", rotulo: "Scanners" },
  { caminho: "/mtmfunded", rotulo: "Funded" },
] as const

const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"

/** `reformado` é ouro porque é SUCESSO — um filho dele rende mais. Não é a mesma coisa que parado. */
const TOM: Record<Agente["estado"], { borda: string; fundo: string; texto: string; rotulo: string }> = {
  vivo: { borda: "border-emerald-500/35", fundo: "bg-emerald-500/[0.04]", texto: "text-emerald-300", rotulo: "vivo" },
  em_risco: { borda: "border-amber-500/40", fundo: "bg-amber-500/[0.05]", texto: "text-amber-300", rotulo: "em risco" },
  parado: { borda: "border-zinc-800", fundo: "bg-zinc-950/40", texto: "text-zinc-500", rotulo: "parado" },
  pausado: { borda: "border-sky-500/35", fundo: "bg-sky-500/[0.04]", texto: "text-sky-300", rotulo: "pausado pelo dono" },
  // Classes LITERAIS, e não interpoladas com as constantes: o Tailwind lê o ficheiro à procura de
  // nomes de classe e não corre JavaScript. `border-[${OURO}]` compila para nada e a cor
  // desaparecia em produção sem dar erro em lado nenhum.
  reformado: { borda: "border-[#D2A63C]/45", fundo: "bg-[#D2A63C]/[0.06]", texto: "text-[#E9C46A]", rotulo: "reformado" },
  // Morto (06/10): 48 h sem receita. Cinza-escuro e riscado — arquivado, não apagado.
  morto: { borda: "border-zinc-900", fundo: "bg-black/40", texto: "text-zinc-600", rotulo: "morto · arquivado" },
}

const ICONE_PILAR: Record<string, typeof Bot> = {
  ceo: Crown,
  trading: TrendingUp,
  educacao: GraduationCap,
  desenvolvimento: Wrench,
  vendas: Handshake,
}

const eur = (cents: number) =>
  `${(Number(cents || 0) / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €`
const num = (v: number) => Number(v || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })

export default function DashboardAgentesPage() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [lido, setLido] = useState<string | null>(null)

  const origem = typeof window === "undefined" ? "https://www.morethanmoney.pt" : window.location.origin

  const ler = useCallback(async () => {
    const r = await fetch("/api/admin/agentes", { cache: "no-store" })
      .then((x) => x.json())
      .catch(() => null)
    if (!r?.ok) {
      setErro(r?.erro ?? "Não foi possível ler a equipa. Sem sessão de admin esta página não mostra nada.")
      return
    }
    setErro(null)
    setD(r)
    setLido(new Date().toLocaleTimeString("pt-PT"))
  }, [])

  useEffect(() => {
    void ler()
    // 30 s: isto é um ecrã para deixar aberto, e a regra de vida corre no cron, não aqui.
    const t = setInterval(() => void ler(), 30_000)
    return () => clearInterval(t)
  }, [ler])

  /**
   * O FOCO QUE VEM DE FORA.
   *
   * `?ag=<código>` ou `#<código>` destaca um agente. É por aqui que o AIOS consegue apontar este
   * ecrã a um agente concreto quando o Ricardo fala com ele — abre a janela já no sítio certo, em
   * vez de o obrigar a procurar a linha.
   */
  const [foco, setFoco] = useState<string | null>(null)
  useEffect(() => {
    const aplicar = () => {
      const p = new URLSearchParams(window.location.search)
      const alvo = (p.get("ag") || p.get("agente") || window.location.hash.replace(/^#/, "")).trim()
      setFoco(alvo ? alvo.toLowerCase() : null)
    }
    aplicar()
    window.addEventListener("hashchange", aplicar)
    return () => window.removeEventListener("hashchange", aplicar)
  }, [])

  const arvore = useMemo(() => montarArvore(d?.agentes ?? []), [d?.agentes])
  const nos = useMemo(() => achatar(arvore), [arvore])
  const resumo = useMemo(
    () => resumoDaEquipa(arvore, d ? d.receita.naoAtribuidoCents : null),
    [arvore, d],
  )

  const agir = async (a: Agente, acao: "pausar" | "retomar" | "parar") => {
    let porque = ""
    if (acao === "parar") {
      const resposta = window.prompt(
        `Parar «${a.nome}»?\n\nNão apaga nada: o agente deixa de trabalhar e volta com um clique em Retomar.\nEscreve o motivo (fica gravado na linha):`,
        "",
      )
      if (resposta == null) return
      porque = resposta
    }
    setOcupado(a.id)
    setErro(null)
    setNota(null)
    const r = await fetch("/api/admin/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, id: a.id, porque }),
    })
      .then((x) => x.json())
      .catch(() => null)
    setOcupado(null)
    if (!r?.ok) {
      setErro(r?.erro ?? "Não foi possível.")
      return
    }
    if (r.porque) setNota(r.porque)
    await ler()
  }

  /**
   * O interruptor da equipa — pausar ou retomar os sete de uma vez.
   *
   * Pede confirmação antes de pausar porque é um botão que mexe em toda a gente, e mostra depois o
   * que NÃO mexeu: quem o dono tinha pausado à mão fica como estava, e se o ecrã não o disser, o
   * botão parece ter falhado. `parar` não existe aqui — é o fim da linha e continua a ser um a um.
   */
  const agirEquipa = async (acao: "pausar" | "retomar") => {
    const quantos = arvore?.total ?? 0
    const confirmado = window.confirm(
      acao === "pausar"
        ? `Pausar a equipa (${quantos} agentes)?\n\nA regra das 48 horas não corre em agentes pausados. Quem já estiver pausado ou parado fica como está.`
        : `Retomar a equipa?\n\nSó volta a trabalhar quem foi pausado por este botão. Quem pausaste à mão fica pausado.`,
    )
    if (!confirmado) return
    setOcupado("equipa")
    setErro(null)
    setNota(null)
    const r = await fetch("/api/admin/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, alvo: "equipa", porque: "" }),
    })
      .then((x) => x.json())
      .catch(() => null)
    setOcupado(null)
    if (!r) {
      setErro("Não foi possível falar com o servidor.")
      return
    }
    // Os que ficaram de fora têm de aparecer com o motivo — senão o botão parece não ter feito nada.
    const deixados = (r.deixados ?? []) as { nome: string; porque: string }[]
    const detalhe = deixados.length
      ? ` ${deixados.map((x) => `${x.nome}: ${x.porque}`).join(" · ")}`
      : ""
    if (!r.ok) setErro((r.erro ?? r.porque ?? "Não foi possível.") + detalhe)
    else setNota((r.porque ?? "") + detalhe)
    await ler()
  }

  /** O interruptor geral do motor autónomo. Pede confirmação a ligar: acorda agentes com ferramentas. */
  const agirMotor = async (acao: "ligar" | "desligar") => {
    if (acao === "ligar" && !window.confirm("Ligar o motor autónomo?\n\nOs agentes vivos passam a acordar sozinhos no Mac (CEO de hora a hora, filhos a cada 3 h). Nada sai para clientes fora das regras dos canais, e nada mexe em dinheiro, ordens ou permissões.")) return
    setOcupado("motor")
    setErro(null)
    setNota(null)
    const r = await fetch("/api/admin/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, alvo: "motor", porque: "" }),
    })
      .then((x) => x.json())
      .catch(() => null)
    setOcupado(null)
    if (!r?.ok) setErro(r?.erro ?? "Não foi possível mexer no motor.")
    else setNota(r.porque ?? null)
    await ler()
  }

  const copiar = (texto: string, chave: string) => {
    void navigator.clipboard?.writeText(texto)
    setCopiado(chave)
    setTimeout(() => setCopiado(null), 1600)
  }

  return (
    <div className="min-h-screen bg-[#07070A] text-zinc-200">
      {/* O ouro da casa só no que importa; o resto é quase-preto para a árvore se ler de longe. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(120% 80% at 50% -10%, ${OURO}14 0%, transparent 60%)` }}
      />

      <div className="relative mx-auto max-w-[1180px] px-5 py-7">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/admin?tab=agentes"
              className="mb-2 inline-flex items-center gap-1.5 text-[11.5px] text-zinc-500 hover:text-[#E9C46A]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Painel de administração
            </Link>
            <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight text-white">
              <Bot className="h-5 w-5" style={{ color: OURO }} /> Equipa de agentes
            </h1>
            <p className="mt-1 max-w-[760px] text-[12.5px] leading-relaxed text-zinc-400">
              Um agente com {d?.janelaHoras ?? 48} horas seguidas sem receita atribuída <strong className="text-zinc-300">morre</strong>{" "}
              — sai da equipa e fica <strong className="text-zinc-300">arquivado, nunca apagado</strong>. Recém-nascidos têm{" "}
              {d?.gracaHoras ?? 72} h de graça; o CEO não morre. Parar passou a ser só decisão tua.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lido && <span className="text-[11px] text-zinc-600">lido às {lido}</span>}
            {/* Os dois botões da equipa inteira. Ficam juntos e separados do «Actualizar» por uma
                linha, para ninguém carregar num deles a querer carregar no outro. */}
            {/* O INTERRUPTOR GERAL DO MOTOR (06/10): o mesmo que o painel do AIOS e o «para os agentes»
                do Telegram. Pausar/retomar a equipa também o desliga/liga. */}
            <button
              onClick={() => void agirMotor(d?.motor?.ligado ? "desligar" : "ligar")}
              disabled={ocupado === "motor" || !d}
              title={d?.motor?.em ? `Último: ${d.motor.por ?? "?"} às ${new Date(d.motor.em).toLocaleString("pt-PT")}` : "Desligado por omissão"}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition disabled:opacity-50 ${
                d?.motor?.ligado
                  ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                  : "border-white/12 text-zinc-400 hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
              }`}
            >
              <Power className="h-3.5 w-3.5" /> Motor {d?.motor?.ligado ? "ligado" : "desligado"}
            </button>
            <div className="flex items-center gap-1.5 rounded-md border border-white/12 p-1">
              <span className="pl-1.5 pr-0.5 text-[11px] text-zinc-500">Equipa</span>
              <button
                onClick={() => void agirEquipa("pausar")}
                disabled={ocupado === "equipa"}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-zinc-300 transition hover:bg-white/[0.06] hover:text-[#E9C46A] disabled:opacity-50"
              >
                <PauseCircle className="h-3.5 w-3.5" /> Pausar
              </button>
              <button
                onClick={() => void agirEquipa("retomar")}
                disabled={ocupado === "equipa"}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-zinc-300 transition hover:bg-white/[0.06] hover:text-[#E9C46A] disabled:opacity-50"
              >
                <PlayCircle className="h-3.5 w-3.5" /> Retomar
              </button>
            </div>
            <button
              onClick={() => void ler()}
              className="flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
        </header>

        {erro && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-200">
            {erro}
          </div>
        )}
        {nota && (
          <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-200">
            {nota}
          </div>
        )}

        {!d && !erro && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: OURO }} />
          </div>
        )}

        {d && (
          <>
            {/* ── O RESUMO. A receita por atribuir está aqui, ao lado dos vivos, de propósito:
                   é a diferença entre «não venderam» e «não se mediu». ── */}
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao rotulo="Vivos" valor={String(resumo.vivos)} pe={`de ${resumo.total} agentes`} cor="text-emerald-300" />
              <Cartao
                rotulo="Em risco / parados"
                valor={`${resumo.emRisco} / ${resumo.parados}`}
                pe={resumo.pausados ? `${resumo.pausados} pausado(s) pelo dono` : "nenhum pausado"}
                cor="text-amber-300"
              />
              <Cartao
                rotulo="Receita atribuída"
                valor={eur(d.receita.atribuidoCents)}
                pe={`de ${eur(d.receita.liquidoCents)} lidos no livro`}
                cor="text-[#E9C46A]"
              />
              <Cartao
                rotulo="Por atribuir"
                valor={resumo.porAtribuirCents == null ? "não medido" : eur(resumo.porAtribuirCents)}
                pe={`${resumo.semReceitaMedida} agente(s) com receita medida a zero`}
                cor={resumo.porAtribuirCents == null ? "text-zinc-400" : "text-sky-300"}
              />
            </div>

            <div
              className="mb-6 rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed"
              style={{ borderColor: `${OURO}3d`, background: `${OURO}0a`, color: "#d4d4d8" }}
            >
              <strong className="text-[#E9C46A]">Receita por atribuir.</strong> {resumo.porAtribuirTexto}
              {d.receita.porAtribuir.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12px] text-zinc-400">
                  {d.receita.porAtribuir.map((p) => (
                    <li key={p.motivo} className="flex flex-wrap gap-x-2">
                      <span className="font-medium text-zinc-300">{eur(p.cents)}</span>
                      <span className="text-zinc-500">· {p.vendas} venda(s) ·</span>
                      <span>{p.porque}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── OS ÓRFÃOS. Vazio é o normal; não-vazio é um defeito de dados que TEM de aparecer,
                   porque é a diferença entre «temos seis» e «temos sete e um não se vê». ── */}
            {arvore.orfaos.length > 0 && (
              <div className="mb-6 rounded-lg border border-red-500/35 bg-red-500/[0.07] px-3.5 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-red-200">
                  <AlertTriangle className="h-4 w-4" /> {arvore.orfaos.length} agente(s) sem lugar na árvore
                </div>
                <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-red-100/80">
                  {arvore.orfaos.map((o) => (
                    <li key={o.id}>{o.texto}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
                 O GOVERNO: O QUE O CEO FECHOU SOZINHO, E O QUE ESPERA PELO DONO.
                 
                 Fica ANTES da árvore de propósito. A árvore diz como a equipa ESTÁ; isto diz o que
                 foi DECIDIDO — e uma decisão automática que não se vê em ecrã nenhum é a mesma
                 doença que se acabou de curar na medição dos agentes.
                 ═══════════════════════════════════════════════════════════════════════════ */}
            {(d.escalonamentos ?? []).filter((e) => e.estado === "aberto").length > 0 && (
              <div className="mb-6 rounded-lg border border-sky-500/35 bg-sky-500/[0.06] px-3.5 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-sky-200">
                  <AlertTriangle className="h-4 w-4" /> Na tua mesa — decisões que o CEO não pode tomar
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-sky-100/70">
                  Cada linha traz a <strong>decisão pronta a tomar</strong>, não uma pergunta. São bloqueios
                  que fazem sair mensagens a clientes, publicam, ou mexem em dinheiro — e por isso são teus.
                </p>
                <ul className="mt-2.5 space-y-2.5 text-[12px] leading-relaxed">
                  {(d.escalonamentos ?? [])
                    .filter((e) => e.estado === "aberto")
                    .map((e) => (
                      <li key={e.id} className="rounded border border-sky-500/20 bg-black/20 px-2.5 py-2">
                        <div className="font-medium text-sky-100">{e.assunto}</div>
                        <div className="mt-0.5 text-zinc-400">{e.o_que}</div>
                        <div className="mt-1.5 text-[#E9C46A]">{e.decisao_pronta}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{e.porque}</div>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* As reescritas RECUSADAS primeiro, e em vermelho: uma recusa quer dizer que o CEO
                tentou apagar um limite de um filho. É a linha mais importante deste ecrã. */}
            {(d.reescritas ?? []).filter((r) => !r.aceita).length > 0 && (
              <div className="mb-6 rounded-lg border border-red-500/35 bg-red-500/[0.07] px-3.5 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-red-200">
                  <AlertTriangle className="h-4 w-4" /> Reescritas de instruções RECUSADAS pela guarda
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-red-100/70">
                  As instruções de cada agente são onde os limites dele vivem. A guarda recusou estas
                  porque perdiam um limite — ou porque acrescentavam uma permissão que o contradiz. A
                  coluna não mudou.
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-red-100/80">
                  {(d.reescritas ?? [])
                    .filter((r) => !r.aceita)
                    .slice(0, 8)
                    .map((r) => (
                      <li key={r.id}>
                        <span className="text-zinc-400">{(r.criado_em ?? "").slice(0, 16).replace("T", " ")} · {r.autor} · </span>
                        {r.veredicto}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {(d.pedidos ?? []).filter((p) => !p.desfecho).length > 0 && (
              <div className="mb-6 rounded-lg border border-white/12 bg-white/[0.02] px-3.5 py-3">
                <div className="text-[12.5px] font-semibold text-zinc-200">
                  Pedidos abertos do CEO ({(d.pedidos ?? []).filter((p) => !p.desfecho).length})
                </div>
                <p className="mt-1 text-[11.5px] text-zinc-500">
                  Um pedido por agente, com prazo. Na carência o pedido é de <em>trabalho</em> e nunca de
                  cobrança — é para o agente ter o que mostrar quando a primeira avaliação chegar.
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
                  {(d.pedidos ?? [])
                    .filter((p) => !p.desfecho)
                    .map((p) => {
                      const nome = d.agentes.find((a) => a.id === p.para_agente_id)?.nome ?? p.para_agente_id
                      return (
                        <li key={p.id}>
                          <span className="font-medium text-[#E9C46A]">{nome} → {p.accao}</span>
                          <span className="text-zinc-600"> · até {(p.prazo ?? "").slice(0, 16).replace("T", " ")}</span>
                          <div className="text-[11.5px] text-zinc-500">{p.porque}</div>
                        </li>
                      )
                    })}
                </ul>
              </div>
            )}

            {/* ═══ A ÁRVORE ═══ */}
            <Bolha>01 · a equipa</Bolha>
            <div className="space-y-2">
              {nos.map((n) => (
                <LinhaDaArvore
                  key={n.agente.id}
                  no={n}
                  foco={foco}
                  aberto={aberto === n.agente.id}
                  ocupado={ocupado === n.agente.id}
                  copiado={copiado}
                  origem={origem}
                  onAbrir={() => setAberto(aberto === n.agente.id ? null : n.agente.id)}
                  onAgir={agir}
                  onCopiar={copiar}
                />
              ))}
              {nos.length === 0 && (
                <div className="rounded-lg border border-white/10 px-4 py-8 text-center text-[12.5px] text-zinc-500">
                  Nenhum agente na base. A equipa cria-se pelo motor (`lib/agentes/motor.ts`).
                </div>
              )}
            </div>

            {/* ── A legenda do código gráfico. Vai LOGO a seguir à árvore porque é dela que fala. ── */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-dashed border-[#D2A63C]/25 pt-3 text-[11px] text-[#8A8A94]">
              <span className="flex items-center gap-2">
                <span className="h-[13px] w-[22px] rounded border border-[#D2A63C] bg-[#D2A63C]/25" />
                sólido = acontece em casa
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[13px] w-[22px] rounded border border-dashed border-[#D2A63C]" />
                tracejado = tem código <code>?ag=</code> a circular, chega ao cliente
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-[13px] w-[22px] rounded border border-dashed border-white/20"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg,rgba(255,255,255,.14) 0 3px,transparent 3px 6px)",
                  }}
                />
                riscado = não está a correr
              </span>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {/* ── Os cortes da escala, escritos a par do desenho. Não se escolhem a olho. ── */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3">
                <Bolha>02 · a escala</Bolha>
                <p className="text-[12px] leading-relaxed text-[#8A8A94]">
                  <span className="text-[#FF8DA1]">0–2 pára</span> ·{" "}
                  <span className="text-[#FFB020]">3–5 em risco</span> ·{" "}
                  <span className="text-[#68FF9B]">6–9 paga-se</span>
                  <br />
                  <span className="text-[11.5px]">{CORTES_DA_ESCALA.split("—")[1]?.trim()}</span>
                </p>
                <div className="mt-2.5 border-l border-dashed border-[#D2A63C]/35 pl-3 text-[11.5px] leading-relaxed text-[#8A8A94]">
                  Casas <strong className="text-[#E9C46A]">riscadas e vazias</strong> = sem contador. Um agente sem
                  código <code>?ag=</code> não tem nível zero: não tem nível nenhum. Zero dizia que ele não trouxe
                  nada; o que se sabe é que <strong className="text-[#E9C46A]">ninguém contou</strong>.
                </div>
              </div>

              {/* ── Os limites, riscados: a referência risca o que não existe. ── */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3">
                <Bolha>03 · os limites</Bolha>
                <p className="text-[12px] leading-relaxed text-[#8A8A94]">
                  <s className="text-[#FF8DA1] decoration-[#FF8DA1]/70">executar ordens de trading</s> ·{" "}
                  <s className="text-[#FF8DA1] decoration-[#FF8DA1]/70">mexer em dinheiro</s> ·{" "}
                  <s className="text-[#FF8DA1] decoration-[#FF8DA1]/70">enviar mensagens a clientes sem aprovação</s> ·{" "}
                  <s className="text-[#FF8DA1] decoration-[#FF8DA1]/70">mudar definições do site sozinho</s>
                </p>
                <div className="mt-2.5 border-l border-dashed border-[#D2A63C]/35 pl-3 text-[11.5px] leading-relaxed text-[#8A8A94]">
                  Riscado porque <strong className="text-[#E9C46A]">não existe o passo</strong>, e não porque esteja
                  desligado: a prospecção devolve um rascunho, o envio para o Telegram devolve um rascunho, e mudar uma
                  definição devolve um pedido de confirmação. O ecrã diz o que o código faz.
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3">
                <Bolha>04 · a medição</Bolha>
                <p className="text-[12px] leading-relaxed text-[#8A8A94]">
                  A receita de um agente só conta quando a compra traz o código dele (link <code>?ag=</code>). Sem links
                  em circulação a receita é zero para todos — e aí a regra pára a equipa por falta de{" "}
                  <strong className="text-[#E9C46A]">MEDIÇÃO</strong>, não por falta de trabalho. O motivo de cada juízo
                  vem do servidor, calculado pela mesma função que o cron usa.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * ETIQUETA COM BICO DE BOLHA.
 *
 * O bico, em baixo à esquerda, aponta para o bloco que a etiqueta nomeia — é o truque de uma
 * referência que o dono trouxe, e serve para explicar um painel sem o encher de legendas.
 *
 * O texto é CARVÃO sobre ouro, nunca branco: branco sobre #D2A63C dá 2.27:1 e chumba em WCAG.
 * Carvão sobre o mesmo ouro dá 8.87:1. Foi medido, não suposto.
 */
function Bolha({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-2.5 inline-block rounded-[7px] rounded-bl-none px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.13em]"
      style={{ background: OURO, color: "#07070A" }}
    >
      {children}
    </span>
  )
}

/**
 * A ESCALA DE VIDA: dez casas, cortes tirados de `lib/agentes/vida.ts`.
 *
 * As casas sobem de altura além de mudarem de cor — uma escala que só fala por cor não se lê de
 * longe nem para quem não distingue o vermelho do verde.
 *
 * Sem nível, as dez casas ficam RISCADAS e vazias. É a diferença que dá nome a isto: um agente sem
 * código `?ag=` não tem nível zero, tem ausência de contador, e um zero desenhado punha-o no fundo
 * da escala ao lado de quem falhou a sério.
 */
function EscalaDeVida({ escala }: { escala: Escala }) {
  const cor =
    escala.banda === "paga_se" ? "#68FF9B" : escala.banda === "risco" ? "#FFB020" : "#FF8DA1"
  const rotulo =
    escala.nivel == null
      ? escala.banda === "nao_medido"
        ? "sem contador"
        : escala.banda === "suspenso"
          ? "suspensa"
          : "ainda não"
      : `${escala.nivel}/9 · ${escala.banda === "paga_se" ? "paga-se" : escala.banda === "risco" ? "em risco" : "pára"}`

  return (
    <div className="min-w-[108px]">
      <div className="text-[10px] uppercase tracking-wider text-[#8A8A94]">escala de vida</div>
      <div className="mt-1 flex items-end gap-[2px]" style={{ height: 17 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const aceso = escala.nivel != null && i <= escala.nivel
          return (
            <span
              key={i}
              className="block w-[7px] rounded-[1.5px]"
              style={{
                height: 6 + i,
                background: aceso
                  ? cor
                  : escala.nivel == null
                    ? "repeating-linear-gradient(135deg,rgba(255,255,255,.14) 0 2px,transparent 2px 4px)"
                    : "rgba(255,255,255,.07)",
              }}
            />
          )
        })}
      </div>
      <div className="mt-1 text-[10.5px] text-[#8A8A94]">{rotulo}</div>
    </div>
  )
}

function Cartao({ rotulo, valor, pe, cor }: { rotulo: string; valor: string; pe: string; cor: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#A1A1AA]">{rotulo}</div>
      <div className={`mt-1.5 text-[22px] font-semibold leading-none ${cor}`}>{valor}</div>
      <div className="mt-1.5 text-[11px] text-[#8A8A94]">{pe}</div>
    </div>
  )
}

function LinhaDaArvore({
  no, foco, aberto, ocupado, copiado, origem, onAbrir, onAgir, onCopiar,
}: {
  no: No<Agente>
  foco: string | null
  aberto: boolean
  ocupado: boolean
  copiado: string | null
  origem: string
  onAbrir: () => void
  onAgir: (a: Agente, acao: "pausar" | "retomar" | "parar") => void
  onCopiar: (texto: string, chave: string) => void
}) {
  const a = no.agente
  // A cor, o relógio e a escala NUNCA se derivam aqui: vêm do módulo puro, que é onde estão
  // provados — e é o MESMO módulo que o servidor usa para o painel do AIOS. Dois ecrãs a derivar
  // a mesma regra por conta própria acabariam a discordar, e discordariam no caso difícil.
  const { estado, conflito } = estadoNoEcra(a)
  const relogio = relogioDoJuizo(a)
  const escala = escalaDeVida({
    resultado: a.resultado,
    saldo: a.saldo,
    codigo: a.chave_receita,
    estado: a.estado,
    pausado: a.pausado,
    criado_em: a.criado_em,
    ultima_receita_em: a.ultima_receita_em ?? null,
    pilar: a.pilar,
    pai_id: a.pai_id,
  })
  const tom = TOM[estado]
  const Icone = ICONE_PILAR[String(a.pilar)] ?? Bot
  const codigo = a.chave_receita ?? null

  const destacado =
    !!foco &&
    (String(codigo ?? "").toLowerCase() === foco ||
      a.nome.toLowerCase() === foco ||
      a.nome.toLowerCase().includes(foco) ||
      a.id.toLowerCase() === foco)

  const positivo = a.resultado > 0
  /** Tem código a circular: o trabalho dele sai de casa e chega a um cliente. */
  const saiParaFora = !!codigo
  /** Não está a correr — e por isso aparece riscado, não apagado. */
  const naoCorre = estado === "parado" || estado === "pausado" || estado === "reformado" || estado === "morto"

  return (
    <div style={{ marginLeft: no.profundidade * 26 }}>
      {/*
        O CÓDIGO GRÁFICO (de uma referência que o dono trouxe, com a paleta da casa):
          sólido    = acontece em casa;
          tracejado = tem código ?ag= a circular, ou seja o trabalho dele SAI e chega a um cliente;
          riscado   = não está a correr. A referência risca os passos que não existem; aqui risca-se
                      o agente que a regra parou ou o dono pausou, e os limites, na legenda.
        Não é decoração: é a distinção que o texto demora três linhas a fazer.
      */}
      <div
        className={`rounded-lg border transition ${tom.borda} ${tom.fundo} ${
          saiParaFora && !naoCorre ? "border-dashed border-[#D2A63C]/50" : ""
        } ${destacado ? "ring-1 ring-[#D2A63C] shadow-[0_0_24px_-6px_#D2A63C]" : ""}`}
        style={
          naoCorre
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 6px,transparent 6px 12px)",
                borderStyle: "dashed",
                opacity: 0.8,
              }
            : undefined
        }
      >
        {/* O traço que mostra que é uma árvore e não uma lista: um filho tem sempre a marca do pai. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
          {no.profundidade > 0 && (
            <span className="-ml-1 select-none font-mono text-[13px] text-zinc-700" aria-hidden>
              └─
            </span>
          )}
          <Icone
            className="h-4 w-4 shrink-0"
            style={{ color: no.profundidade === 0 ? OURO : "#8b8b94" }}
          />

          <div className="min-w-[190px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[13.5px] font-semibold ${no.profundidade === 0 ? "text-white" : "text-zinc-100"} ${
                  naoCorre ? "line-through decoration-[#FF8DA1]/70" : ""
                }`}
              >
                {a.nome}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tom.texto} bg-white/[0.06]`}>
                {tom.rotulo}
              </span>
              {no.orfao && (
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                  sem pai na árvore
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11.5px] text-zinc-500">
              {textoDoPilar(a.pilar)}
              {a.papel ? ` · ${a.papel}` : ""}
            </div>
          </div>

          <EscalaDeVida escala={escala} />

          {/* ── O resultado da JANELA: é por este número que ele vive. ── */}
          <div className="min-w-[112px]">
            <div className="text-[10px] uppercase tracking-wider text-[#8A8A94]">resultado 48 h</div>
            <div className={`flex items-center gap-1 text-[13px] font-semibold ${positivo ? "text-emerald-300" : "text-zinc-400"}`}>
              {positivo ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {num(a.resultado)} $
            </div>
          </div>

          <div className="min-w-[96px]">
            <div className="text-[10px] uppercase tracking-wider text-[#8A8A94]">saldo</div>
            <div className="text-[13px] font-semibold text-zinc-200">{num(a.saldo)} $</div>
          </div>

          <div className="min-w-[132px]">
            <div className="text-[10px] uppercase tracking-wider text-[#8A8A94]">receita medida</div>
            <div className="text-[13px] font-semibold" style={{ color: a.receita > 0 ? OURO_CLARO : "#71717a" }}>
              {a.receita > 0 ? `${num(a.receita)} $` : "por atribuir"}
            </div>
          </div>

          {/* ── O RELÓGIO. Uma fase e uma frase, nunca um número com sinal. ── */}
          <div className="min-w-[150px]">
            <div className="text-[10px] uppercase tracking-wider text-[#8A8A94]">
              {relogio.fase === "carencia"
                ? "até ao juízo"
                : relogio.fase === "em_julgamento"
                  ? "em julgamento há"
                  : "relógio"}
            </div>
            <div
              className={`text-[13px] font-semibold ${
                relogio.fase === "suspenso" || relogio.fase === "sem_data" ? "text-zinc-500" : "text-zinc-200"
              }`}
            >
              {relogio.horas == null
                ? relogio.fase === "sem_data"
                  ? "sem data"
                  : "parado"
                : `${relogio.horas} h`}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {estado !== "parado" && (
              a.pausado ? (
                <Botao titulo="Retomar" onClick={() => onAgir(a, "retomar")} ocupado={ocupado}>
                  <Play className="h-3.5 w-3.5" />
                </Botao>
              ) : (
                <Botao titulo="Pausar" onClick={() => onAgir(a, "pausar")} ocupado={ocupado}>
                  <Pause className="h-3.5 w-3.5" />
                </Botao>
              )
            )}
            {estado !== "parado" && (
              <Botao titulo="Parar (não apaga)" onClick={() => onAgir(a, "parar")} ocupado={ocupado} perigo>
                <Ban className="h-3.5 w-3.5" />
              </Botao>
            )}
            <button
              onClick={onAbrir}
              className="rounded border border-white/12 px-2 py-1 text-[11px] text-zinc-400 transition hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
            >
              {aberto ? "fechar" : "detalhe"}
            </button>
          </div>
        </div>

        {/* ── O MOTIVO ESCRITO. Não é decoração: é o que permite dar a volta quando a medição
               errar, e já se sabe que vai errar. ── */}
        <div className="border-t border-white/[0.07] px-3.5 py-2">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            <span className="font-medium text-zinc-300">Juízo:</span> {a.juizo.porque}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[#8A8A94]">{relogio.texto}</p>
          {escala.porque !== relogio.texto && (
            <p className="mt-0.5 text-[11.5px] text-[#8A8A94]">{escala.porque}</p>
          )}
          {conflito && (
            <p className="mt-1 text-[11.5px] text-amber-300/90">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {conflito}
            </p>
          )}
          {a.ilegivel.length > 0 && (
            <p className="mt-1 text-[11.5px] text-red-300/90">
              Campos ilegíveis na base ({a.ilegivel.join(", ")}) — não é julgado. Um agente cujo orçamento não se
              consegue ler não se mata por dúvida.
            </p>
          )}
        </div>

        {aberto && (
          <div className="border-t border-white/[0.07] bg-black/30 px-3.5 py-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-[#8A8A94]">
                  Código de atribuição
                </div>
                {codigo ? (
                  <button
                    onClick={() => onCopiar(codigo, a.id + ":cod")}
                    className="flex items-center gap-1.5 rounded border border-white/12 px-2 py-1 font-mono text-[12px] text-[#E9C46A] hover:border-[#D2A63C]/60"
                  >
                    <Copy className="h-3 w-3" /> {codigo}
                    {copiado === a.id + ":cod" && <span className="text-emerald-300">copiado</span>}
                  </button>
                ) : (
                  <p className="text-[12px] text-zinc-500">
                    Sem código. Enquanto não tiver, nenhuma venda se liga a ele e a receita dele fica a zero por
                    falta de medição.
                  </p>
                )}

                {codigo && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {DESTINOS.map((dst) => (
                      <button
                        key={dst.caminho}
                        onClick={() => onCopiar(linkDoAgente(origem, dst.caminho, codigo), a.id + dst.caminho)}
                        className="rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:border-[#D2A63C]/50 hover:text-[#E9C46A]"
                      >
                        {copiado === a.id + dst.caminho ? "copiado" : dst.rotulo}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-0.5 text-[11.5px] text-zinc-500">
                  <div>Orçamento: {num(a.orcamento)} $ · gasto {num(a.gasto)} $</div>
                  <div>Acumulado: {num(a.receita)} $ de receita</div>
                  <div>Janela: {num(a.receita_janela)} $ receita · {num(a.gasto_janela)} $ gasto</div>
                  {a.criado_em && <div>Nasceu: {new Date(a.criado_em).toLocaleString("pt-PT")}</div>}
                  {a.avaliado_em && <div>Último juízo: {new Date(a.avaliado_em).toLocaleString("pt-PT")}</div>}
                  {a.parado_em && <div>Parado em: {new Date(a.parado_em).toLocaleString("pt-PT")}</div>}
                  {a.parado_porque && <div className="text-zinc-400">Motivo: {a.parado_porque}</div>}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-[#8A8A94]">
                  <Terminal className="h-3 w-3" /> Instruções (é por estas que é julgado)
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-400">
                  {a.instrucoes ?? "Sem instruções na base. O AIOS não lhe pode dar voz sem elas — e se as inventasse, seriam duas versões do mesmo agente."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Botao({
  titulo, onClick, ocupado, perigo, children,
}: {
  titulo: string
  onClick: () => void
  ocupado: boolean
  perigo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={titulo}
      disabled={ocupado}
      onClick={onClick}
      className={`rounded border px-2 py-1 transition disabled:opacity-40 ${
        perigo
          ? "border-red-500/25 text-red-300/80 hover:border-red-500/60 hover:text-red-200"
          : "border-white/12 text-zinc-400 hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
      }`}
    >
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}
