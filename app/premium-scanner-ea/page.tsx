"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Download,
  FileText,
  Gauge,
  KeyRound,
  LineChart,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import { FaixaFactos, FundoHero, Inclinar, Revelar, SenseiEstilos } from "@/components/sensei/sensei-motion"

const PRECO_PACOTE = 1250
const PLANO = "premium_scanner_ea_lifetime"

/**
 * Página de vendas do pacote MTM Premium Scanner: indicador e estratégia no TradingView + EA no
 * MetaTrader 5, com uma licença por venda (produto `premium_scanner_ea` em lib/licencas.ts).
 *
 * Sem números de resultados: a regra foi construída sobre sinais reais, mas depois do spread não
 * há vantagem comprovada (docs/premium-scanner-engenharia-reversa.md). A página descreve o que a
 * ferramenta faz e manda testar na estratégia do TradingView e em demo, com os custos da corretora.
 */
export default function PremiumScannerEaPage() {
  const [email, setEmail] = useState("")
  const [mt5Login, setMt5Login] = useState("")
  const [tvUser, setTvUser] = useState("")
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function comprar() {
    setErro(null)
    if (!email.trim()) {
      setErro("Escreve o teu email — é para lá que vai a chave.")
      return
    }
    setAEnviar(true)
    try {
      const r = await fetch("/api/licencas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: PLANO, email, mt5Login, tradingviewUsername: tvUser }),
      })
      const d = await r.json()
      if (!r.ok || !d.url) throw new Error(d.error || "Não foi possível abrir o pagamento")
      window.location.href = d.url
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido")
      setAEnviar(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SenseiEstilos />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[#D2A63C]/15">
        <FundoHero />
        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-14 md:pt-24 md:pb-20 grid md:grid-cols-[1fr_1.15fr] gap-12 items-center">
          <Revelar>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-1 text-xs text-[#D2A63C]">
              <Gauge className="w-3.5 h-3.5" />
              Indicador · Estratégia · EA
            </div>

            <h1 className="mt-5 text-4xl md:text-6xl font-bold leading-[1.05]">
              MTM Premium
              <span className="block bg-gradient-to-r from-[#E9C46A] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                Scanner EA
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
              O ouro em três sessões — Ásia, Londres e Nova Iorque. A mesma regra no teu TradingView
              e no teu MetaTrader 5: lê a direcção com cinco critérios, espera pelo recuo e desenha a
              zona, o stop e os alvos. A EA executa-a sozinha, com o mesmo plano no gráfico.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                onClick={() => document.getElementById("precos")?.scrollIntoView({ behavior: "smooth" })}
                className="snx-brilho h-12 px-6 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold shadow-[0_10px_40px_-10px_rgba(210,166,60,.6)]"
              >
                Comprar o pacote — {PRECO_PACOTE} €
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button asChild variant="outline" className="h-12 px-6 border-[#D2A63C]/40 bg-transparent text-[#D2A63C] hover:bg-[#D2A63C]/10">
                <Link href="/scanner/premium-scanner">Ver o scanner</Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              XAUUSD · M15 · TradingView + MetaTrader 5 · licença vitalícia por conta, sem DLLs
            </p>
          </Revelar>

          <Revelar atraso={150}>
            <div className="snx-flutua">
              <Inclinar className="rounded-2xl border border-[#D2A63C]/25 bg-black/50 p-3 shadow-[0_30px_80px_-20px_rgba(210,166,60,.35)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/scanners/premium-scanner.png" alt="Zona de entrada, stop e alvos do MTM Premium Scanner no ouro" className="w-full h-auto rounded-xl" />
              </Inclinar>
            </div>
            <p className="text-[11px] text-gray-600 px-2 pt-3">
              Zona de entrada, SL e TP1–TP3 desenhados no gráfico. A EA desenha os mesmos níveis no MetaTrader.
            </p>
          </Revelar>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pb-16">
          <FaixaFactos
            itens={[
              { valor: 3, rotulo: "sessões do ouro" },
              { valor: 5, rotulo: "critérios no voto da direcção" },
              { valor: "50/25/25", rotulo: "saídas, SL na entrada no TP1" },
              { valor: 1, rotulo: "grupo de cada vez" },
            ]}
          />
        </div>
      </section>

      {/* ── O pacote ─────────────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">Três ferramentas, a mesma regra</h2>
          <p className="mt-3 max-w-3xl text-gray-400 leading-relaxed">
            Vês o sinal no TradingView, testas a regra com os custos da tua corretora e deixas a EA
            executá-la no MetaTrader 5. Os três usam os mesmos números por omissão.
          </p>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: LineChart,
                t: "Indicador · TradingView",
                d: "Sinais BUY/SELL no fecho da vela, zona de entrada, SL e TP1–TP4 desenhados, e alertas JSON prontos para webhook.",
              },
              {
                icon: BarChart3,
                t: "Estratégia · TradingView",
                d: "A mesma regra em backtest: ordem limite no meio da zona, três parciais e SL na entrada depois do TP1. Pões o spread e a comissão da tua corretora e lês o resultado.",
              },
              {
                icon: Bot,
                t: "EA · MetaTrader 5",
                d: "Executa a regra sozinha, com painel no gráfico: iniciar e parar, fechar tudo, Maioria ou Unânime, lote fixo ou risco em %, e o estado da sessão e da licença.",
              },
            ].map((c, i) => (
              <Revelar key={c.t} atraso={i * 90}>
                <div className="group h-full rounded-xl border border-gray-800 bg-gray-950/60 p-5 transition duration-300 hover:-translate-y-1 hover:border-[#D2A63C]/40">
                  <div className="w-10 h-10 rounded-lg bg-[#D2A63C]/10 ring-1 ring-[#D2A63C]/20 flex items-center justify-center transition group-hover:bg-[#D2A63C]/20">
                    <c.icon className="w-5 h-5 text-[#D2A63C]" />
                  </div>
                  <h3 className="mt-4 font-semibold">{c.t}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{c.d}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      {/* ── Como trabalha ────────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">Como trabalha</h2>
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                n: "1",
                t: "Só nas sessões",
                d: "Ásia 00–06, Londres 07–11 e Nova Iorque 13–16 (UTC), cada uma com o seu interruptor. Fora delas, não há sinais.",
              },
              {
                n: "2",
                t: "Cinco perguntas",
                d: "No fecho de cada vela: acima da abertura da sessão? De há 1 h? De há 4 h? Da EMA200? Da EMA9? Maioria ou Unânime decide se há sinal.",
              },
              {
                n: "3",
                t: "Espera pelo recuo",
                d: "A entrada é uma ordem limite no meio de uma zona de 5 $ colocada contra o movimento. Se o preço não volta em 4 velas, a ordem cai.",
              },
              {
                n: "4",
                t: "Gestão por partes",
                d: "50 % sai no TP1 e o stop do resto passa para a entrada; 25 % no TP2 e 25 % no TP3. Tudo editável.",
              },
            ].map((c, i) => (
              <Revelar key={c.n} atraso={i * 90}>
                <div className="h-full rounded-xl border border-gray-800 bg-gray-900/40 p-5 transition duration-300 hover:-translate-y-1 hover:border-[#D2A63C]/40 hover:shadow-[0_20px_50px_-25px_rgba(210,166,60,.5)]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E9C46A] to-[#BB8525] text-black text-sm font-bold flex items-center justify-center shadow-[0_0_20px_rgba(210,166,60,.35)]">
                    {c.n}
                  </div>
                  <h3 className="mt-4 font-semibold">{c.t}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{c.d}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      {/* ── Antes de ligar ───────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <Revelar>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[#D2A63C]" />
              <h2 className="text-2xl md:text-3xl font-bold">Antes de a ligares</h2>
            </div>
          </Revelar>
          <div className="mt-8 space-y-4">
            {[
              {
                t: "Testa com os teus custos",
                d: "O resultado de uma regra de ouro em M15 depende muito do spread e da comissão. Põe os da tua corretora na estratégia do TradingView e no testador do MetaTrader antes de usares dinheiro real.",
              },
              {
                t: "Começa em demo e com lote pequeno",
                d: "O lote total reparte-se pelas três partes: 0,04 dá 0,02 / 0,01 / 0,01. Sobe só quando conheceres o ritmo da EA na tua conta.",
              },
              {
                t: "Números só com origem declarada",
                d: "Não pomos curvas nem taxas de acerto nesta página. Quando publicarmos resultados da EA, vêm de conta e medidos em pips, com a origem dita.",
              },
            ].map((c, i) => (
              <Revelar key={c.t} atraso={i * 80}>
                <div className="rounded-xl border border-gray-800 border-l-[#D2A63C]/60 border-l-2 bg-gray-950/40 p-5">
                  <h3 className="font-semibold text-white">{c.t}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{c.d}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preço ────────────────────────────────────────────────────────── */}
      <section id="precos" className="border-b border-gray-800/70">
        <div className="max-w-xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center">O pacote</h2>
          <p className="mt-3 text-center text-gray-400">
            Indicador e estratégia no TradingView + EA no MetaTrader 5, com uma licença para uma conta MT5.
          </p>

          <div className="mt-10 rounded-2xl border border-[#D2A63C] bg-[#D2A63C]/[0.06] ring-1 ring-[#D2A63C]/30 p-6">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Vitalício</span>
              <Check className="w-4 h-4 text-[#D2A63C]" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold">{PRECO_PACOTE} €</span>
              <span className="ml-1 text-sm text-gray-500">uma vez</span>
            </div>
            <ul className="mt-4 space-y-1.5">
              {["Indicador e estratégia por convite no teu TradingView", "EA para MetaTrader 5 com painel", "Licença sem renovação", "Actualizações incluídas", "Guia em PDF e vídeos de uso"].map((n) => (
                <li key={n} className="text-sm text-gray-400 flex gap-2">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-600" />
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 space-y-3">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="O teu email — é para lá que vai a chave" className="bg-gray-950 border-gray-800" />
            <Input value={tvUser} onChange={(e) => setTvUser(e.target.value)} placeholder="Utilizador do TradingView (para o acesso ao indicador)" className="bg-gray-950 border-gray-800" />
            <Input value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} placeholder="Número da conta MT5 (opcional — podes dizer-nos depois)" className="bg-gray-950 border-gray-800" />
            {erro && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <X className="w-4 h-4" />
                {erro}
              </p>
            )}
            <Button onClick={comprar} disabled={aEnviar} className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold h-12">
              {aEnviar ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />A abrir o pagamento…
                </>
              ) : (
                `Comprar o pacote — ${PRECO_PACOTE} €`
              )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              Ainda não tens conta MT5? Compra na mesma — a licença prende-se à primeira conta que a usar.
            </p>
          </div>
        </div>
      </section>

      {/* ── Instalar ─────────────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">Instalar</h2>
          <p className="mt-3 text-gray-400">
            O pacote é aberto — instala-o e conhece o painel. Para abrir ordens precisas da chave, que segue no email da compra.
          </p>
          <div className="mt-8">
            <DescarregarMt5 />
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" className="w-full border-gray-700 text-gray-200 hover:bg-gray-900 h-12">
              <a href="/downloads/MTM-Premium-Scanner-EA.zip">
                <Download className="w-4 h-4 mr-2" />
                Pacote da EA (MetaTrader 5)
              </a>
            </Button>
          </div>
          <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950/40 p-5">
            <h3 className="font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D2A63C]" />O passo onde toda a gente tropeça
            </h3>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              No MetaTrader: <strong className="text-gray-200">Ferramentas → Opções → Consultores</strong>.
              Liga &quot;Permitir WebRequest para os seguintes URLs&quot; e acrescenta{" "}
              <code className="text-[#D2A63C]">https://www.morethanmoney.pt</code>. Sem isto a licença não valida.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            As sessões estão em UTC; a EA lê sozinha o fuso do servidor da tua corretora.
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-sm text-gray-600">
        Conteúdo educativo, não constitui consultoria financeira. Negociar envolve risco de perda. Resultados passados não garantem resultados futuros.
      </footer>
    </div>
  )
}
