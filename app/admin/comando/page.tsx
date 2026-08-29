"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDot, Loader2, RefreshCw,
  Radar, Send, Users, Zap,
} from "lucide-react"

/**
 * Centro de comando — o sítio de onde se parte.
 *
 * A administração cresceu em ilhas: doze páginas, quatro barras laterais, e a mesma verdade
 * contada de maneiras diferentes em cada uma. Isto não as substitui — elas continuam a ser onde
 * se trabalha. O que faltava era um sítio onde a pergunta "está tudo bem?" tenha resposta, em vez
 * de se ter de a montar saltando entre ecrãs.
 *
 * A ordem da página é a ordem das perguntas, e é deliberada:
 *   1. O que está PARTIDO — porque é o que muda o que se faz a seguir.
 *   2. Onde o dinheiro trava.
 *   3. O que corre sozinho, e se está mesmo a correr.
 *   4. Para onde ir.
 *
 * Os números vêm todos de uma leitura só (`lib/comando/estado`). Cada painel a buscar os seus
 * dava a mesma coisa contada de maneiras diferentes — que é o problema que isto veio resolver.
 */

interface Alerta { gravidade: "partido" | "atencao" | "ok"; titulo: string; detalhe: string; href?: string }
interface Degrau { nome: string; n: number; fonte: string; passou: number | null }
interface Motor { nome: string; ligado: boolean; ultimoSinal: string | null; detalhe: string }
interface Estado {
  quando: string
  alertas: Alerta[]
  escada: Degrau[]
  motores: Motor[]
  dinheiro: { assinantesAtivos: number; novos7d: number; expiramEm7d: number; contasCopia: number }
  conteudo: { porAprovar: number; agendados: number; publicados7d: number; falhados: number }
  atencaoIA: { automacoes: number; ativas: number; disparos: number; naFila: number; radarPorTratar: number }
}

const CORES: Record<Alerta["gravidade"], string> = {
  partido: "border-red-900 bg-red-950/40 text-red-200",
  atencao: "border-amber-900 bg-amber-950/40 text-amber-200",
  ok: "border-emerald-900 bg-emerald-950/40 text-emerald-200",
}

/** Os ecrãs onde se trabalha. Agrupados pelo que se vai lá fazer, não pela pasta onde vivem. */
const DESTINOS: Array<{ grupo: string; itens: Array<{ nome: string; href: string; nota: string }> }> = [
  {
    grupo: "Vender",
    itens: [
      { nome: "Máquina de vendas", href: "/admin/sales-machine", nota: "funil, conversões, links de corretora" },
      { nome: "Conteúdo e funis", href: "/admin/social", nota: "posts, automações, mapa, radar, tokens" },
      { nome: "Leads", href: "/admin/social/leads", nota: "de onde vêm e onde param" },
      { nome: "Cupões", href: "/admin/coupons", nota: "descontos e ofertas" },
    ],
  },
  {
    grupo: "Operar",
    itens: [
      { nome: "MTM Copy", href: "/admin/mtmcopy", nota: "estratégias, execução, subscritores" },
      { nome: "Portfolios", href: "/admin/portfolios", nota: "cripto e ETF" },
      { nome: "Utilizadores", href: "/admin?tab=users", nota: "contas, acessos, subscrições" },
      { nome: "MLM / afiliados", href: "/admin/backoffice", nota: "árvore, comissões" },
    ],
  },
  {
    grupo: "Construir",
    itens: [
      { nome: "Educação e sessões", href: "/admin?tab=education", nota: "aulas, DVR, educadores" },
      { nome: "Avaliações", href: "/admin?tab=avaliacoes", nota: "quizzes e certificados" },
      { nome: "Notificações", href: "/admin?tab=notifications", nota: "push e email" },
      // Existia e não estava ligada a lado nenhum: só se chegava lá escrevendo o endereço.
      { nome: "Email em massa", href: "/admin/broadcast", nota: "comunicar com a comunidade toda" },
      { nome: "Dashboard de gestão", href: "/dashboard-gestao", nota: "agentes, n8n, streaming" },
    ],
  },
]

function quando(iso: string | null): string {
  if (!iso) return "nunca"
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.round(min / 60)}h`
  return `há ${Math.round(min / 1440)} dias`
}

export default function CentroDeComando() {
  const [e, setE] = useState<Estado | null>(null)
  const [aLer, setALer] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/comando", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) { setE(j.estado); setErro(null) } else setErro(j.erro ?? "não deu para ler")
    } catch {
      setErro("não deu para ler")
    }
    setALer(false)
  }, [])

  useEffect(() => {
    carregar()
    // Um minuto: o suficiente para um alerta novo aparecer sem se estar a olhar, e pouco que
    // chegue para não valer a pena carregar em actualizar.
    const t = setInterval(carregar, 60_000)
    return () => clearInterval(t)
  }, [carregar])

  if (!e && aLer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A ler o estado do negócio…
      </div>
    )
  }
  if (!e) {
    return <div className="min-h-screen bg-neutral-950 p-8 text-red-400">Erro: {erro}</div>
  }

  const partidos = e.alertas.filter((a) => a.gravidade === "partido")

  return (
    <div className="min-h-screen bg-neutral-950 p-4 text-neutral-100 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Centro de comando</h1>
            <p className="text-sm text-neutral-400">
              Tudo o que decide o dia, numa leitura · atualiza sozinho a cada minuto
            </p>
          </div>
          <button
            onClick={() => void carregar()}
            disabled={aLer}
            className="rounded-lg border border-neutral-800 p-2 hover:bg-neutral-900 disabled:opacity-40"
          >
            {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </header>

        {/* 1 · O que está partido. Primeiro, porque é o que muda o que se faz a seguir. */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            {partidos.length ? `${partidos.length} a corrigir` : "Estado"}
          </h2>
          {e.alertas.slice(0, 6).map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${CORES[a.gravidade]}`}>
              {a.gravidade === "ok"
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.titulo}</p>
                <p className="text-[12.5px] leading-snug opacity-80">{a.detalhe}</p>
              </div>
              {a.href && (
                <Link href={a.href} className="shrink-0 rounded-lg border border-current/30 px-2.5 py-1 text-xs hover:bg-white/10">
                  resolver
                </Link>
              )}
            </div>
          ))}
        </section>

        {/* 2 · Onde o dinheiro trava. */}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Do primeiro contacto ao pagante</h2>
            <div className="space-y-2">
              {e.escada.map((d, i) => {
                const teto = Math.max(1, ...e.escada.map((x) => x.n))
                const parede = d.passou !== null && d.passou < 10
                return (
                  <div key={d.nome} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 text-[12.5px] text-neutral-300">{d.nome}</div>
                    <div className="h-6 flex-1 overflow-hidden rounded bg-neutral-800">
                      <div
                        className={`h-full ${parede ? "bg-red-500/70" : "bg-amber-500/70"}`}
                        style={{ width: `${Math.max(1, (d.n / teto) * 100)}%` }}
                      />
                    </div>
                    <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">{d.n}</div>
                    <div className={`w-16 shrink-0 text-right text-xs ${parede ? "font-semibold text-red-400" : "text-neutral-500"}`}>
                      {d.passou === null ? "—" : `${d.passou}%`}
                    </div>
                    {i === 0 && <span className="w-0" />}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              A percentagem é quanto sobreviveu do andar de cima. Cada andar vem de uma tabela
              diferente — o mesmo número contado de um só sítio só mostrava o que esse sítio sabe.
            </p>
          </div>

          <div className="space-y-3">
            <Numero icone={<Users className="h-4 w-4" />} rotulo="Subscrições ativas" valor={e.dinheiro.assinantesAtivos} />
            <Numero icone={<CircleDot className="h-4 w-4" />} rotulo="Registos (7 dias)" valor={e.dinheiro.novos7d} />
            <Numero
              icone={<AlertTriangle className="h-4 w-4" />}
              rotulo="Expiram em 7 dias"
              valor={e.dinheiro.expiramEm7d}
              alerta={e.dinheiro.expiramEm7d > 0}
            />
            <Numero icone={<Zap className="h-4 w-4" />} rotulo="Contas a copiar" valor={e.dinheiro.contasCopia} />
          </div>
        </section>

        {/* 3 · O que corre sozinho — e se está mesmo. */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold">O que corre sozinho</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {e.motores.map((m) => (
              <div key={m.nome} className="flex items-start gap-2.5 rounded-lg border border-neutral-800 p-2.5">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.ligado ? "bg-emerald-400" : "bg-neutral-600"}`}
                  title={m.ligado ? "ligado" : "desligado"}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {m.nome}
                    {!m.ligado && <span className="ml-2 text-[11px] text-neutral-500">desligado</span>}
                  </p>
                  <p className="text-[11.5px] leading-snug text-neutral-400">{m.detalhe}</p>
                  {m.ultimoSinal && (
                    <p className="text-[11px] text-neutral-600">último sinal {quando(m.ultimoSinal)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-800 pt-3 text-[11.5px]">
            <Etiqueta icone={<Bot className="h-3 w-3" />} texto={`${e.atencaoIA.ativas}/${e.atencaoIA.automacoes} regras · ${e.atencaoIA.disparos} disparos`} />
            {e.atencaoIA.naFila > 0 && <Etiqueta icone={<Send className="h-3 w-3" />} texto={`${e.atencaoIA.naFila} conversas à espera`} alerta />}
            <Etiqueta icone={<Radar className="h-3 w-3" />} texto={`${e.atencaoIA.radarPorTratar} conversas por tratar`} />
            <Etiqueta texto={`conteúdo: ${e.conteudo.porAprovar} por aprovar · ${e.conteudo.agendados} agendados · ${e.conteudo.publicados7d} publicados (7d)`} />
          </div>
        </section>

        {/* 4 · Para onde ir. Agrupado pelo que se vai lá fazer, não pela pasta onde vive. */}
        <section className="grid gap-4 md:grid-cols-3">
          {DESTINOS.map((g) => (
            <div key={g.grupo} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{g.grupo}</h3>
              <div className="space-y-1">
                {g.itens.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-800"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px]">{i.nome}</span>
                      <span className="block truncate text-[11px] text-neutral-500">{i.nota}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-600 group-hover:text-neutral-300" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function Numero({ icone, rotulo, valor, alerta }: { icone: React.ReactNode; rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? "border-amber-900 bg-amber-950/30" : "border-neutral-800 bg-neutral-900/50"}`}>
      <div className="flex items-center gap-2 text-neutral-400">{icone}<span className="text-[11.5px]">{rotulo}</span></div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${alerta ? "text-amber-300" : ""}`}>{valor}</div>
    </div>
  )
}

function Etiqueta({ icone, texto, alerta }: { icone?: React.ReactNode; texto: string; alerta?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${alerta ? "bg-amber-950/50 text-amber-300" : "bg-neutral-800 text-neutral-300"}`}>
      {icone}{texto}
    </span>
  )
}
