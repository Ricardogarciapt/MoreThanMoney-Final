"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  FileText,
  Gauge,
  KeyRound,
  Loader2,
  Newspaper,
  ShieldCheck,
  Sliders,
  X,
} from "lucide-react"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import { FaixaFactos, FundoHero, Inclinar, Revelar, ScalpAnimado, SenseiEstilos } from "@/components/sensei/sensei-motion"

const PRECO_ANUAL = 200
const PRECO_VITALICIO = 697

type Plano = "sensei_scalp_annual" | "sensei_scalp_lifetime"

/**
 * Página de vendas da Sensei Scalp Edition.
 *
 * Duas decisões que valem a pena explicar a quem mexer nisto a seguir:
 *
 * 1. A comparação com o MTM Sensei EA vem LOGO A SEGUIR AO HERO, e não escondida no fim. São dois
 *    produtos com o mesmo nome de família e quem já comprou um vai assumir que este é uma versão
 *    nova do mesmo. Deixar essa confusão de pé vende hoje e devolve amanhã.
 *
 * 2. Não há números de resultados nesta página. A prova desta casa mede-se em pips, com origem
 *    declarada, numa conta real — é o que a página do Sensei EA mostra. Até a Scalp ter essa
 *    publicação, a página descreve o comportamento (as animações mostram-no) e nunca uma curva
 *    nem uma taxa de acerto.
 *
 * O produto está validado e opera sem restrições: nada nesta página fala de testes, de demo ou
 * de "versão nova a experimentar" (decisão do Ricardo, 26/10/2026).
 */
export default function SenseiScalpPage() {
  const [plano, setPlano] = useState<Plano>("sensei_scalp_annual")
  const [email, setEmail] = useState("")
  const [mt5Login, setMt5Login] = useState("")
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
        body: JSON.stringify({ planId: plano, email, mt5Login }),
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
              Família Sensei · pronta a operar
            </div>

            <h1 className="mt-5 text-4xl md:text-6xl font-bold leading-[1.05]">
              MTM Sensei
              <span className="block bg-gradient-to-r from-[#E9C46A] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                Scalp Edition
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
              Um scalper de ouro para MetaTrader 5. Arma uma ordem pendente de cada lado, deixa o
              preço escolher, e a partir do primeiro cêntimo de lucro põe o stop em breakeven e
              acompanha. Quando o preço vira, a ordem contrária fecha uma e abre a outra.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                onClick={() => document.getElementById("precos")?.scrollIntoView({ behavior: "smooth" })}
                className="snx-brilho h-12 px-6 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold shadow-[0_10px_40px_-10px_rgba(210,166,60,.6)]"
              >
                Comprar licença — {PRECO_ANUAL} €/ano
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button asChild variant="outline" className="h-12 px-6 border-[#D2A63C]/40 bg-transparent text-[#D2A63C] hover:bg-[#D2A63C]/10">
                <a href="/api/sensei-scalp/guia" target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-2" />
                  Ler o guia (PDF)
                </a>
              </Button>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              XAUUSD · M5 · MetaTrader 5 · licença por conta, sem DLLs
            </p>
          </Revelar>

          <Revelar atraso={150}>
            <div className="snx-flutua">
              <Inclinar className="rounded-2xl border border-[#D2A63C]/25 bg-black/50 p-3 shadow-[0_30px_80px_-20px_rgba(210,166,60,.35)]">
                <ScalpAnimado className="w-full h-auto rounded-xl" />
              </Inclinar>
            </div>
            <p className="text-[11px] text-gray-600 px-2 pt-3">
              Ilustração animada de um ciclo: as duas pendentes, o breakeven, o trailing e a reversão.
              Os preços são ilustrativos.
            </p>
          </Revelar>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pb-16">
          <FaixaFactos
            itens={[
              { valor: "M5", rotulo: "tempo gráfico" },
              { valor: 2, rotulo: "pendentes armadas por ciclo" },
              { valor: "1.º", rotulo: "cêntimo de lucro → breakeven" },
              { valor: 3, rotulo: "travões de risco, ligados" },
            ]}
          />
        </div>
      </section>

      {/* ── SÃO DUAS EA DIFERENTES ───────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">
            Isto <span className="text-[#D2A63C]">não</span> é o MTM Sensei EA
          </h2>
          <p className="mt-3 max-w-3xl text-gray-400 leading-relaxed">
            Partilham o motor de leitura — a mesma análise do Sensei que já conheces — e mais nada.
            Operam em tempos gráficos diferentes, entram de maneiras diferentes e comportam-se de
            maneiras diferentes. <strong className="text-gray-200">São licenças separadas</strong>:
            uma chave não abre a outra, e se a colares na EA errada ela diz-te exactamente isso.
          </p>

          <div className="mt-10 grid md:grid-cols-2 gap-5">
            {/* AllInOne */}
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6">
              <div className="text-xs uppercase tracking-wider text-gray-500">O que já existia</div>
              <h3 className="mt-2 text-xl font-semibold">MTM Sensei EA</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {[
                  ["Tempo gráfico", "M15 e H1"],
                  ["Como entra", "A mercado, quando o setup confirma"],
                  ["Stop loss", "Sim, fixo, com quatro alvos"],
                  ["Ritmo", "Poucas trades por dia"],
                  ["Instrumentos", "XAUUSD, BTCUSD, US30"],
                  ["Preço", "297 €/ano — grátis para membros Premium"],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-3">
                    <span className="w-28 shrink-0 text-gray-500">{k}</span>
                    <span className="text-gray-300">{v}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sensei-ea"
                className="mt-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#D2A63C]"
              >
                Ver o MTM Sensei EA <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Scalp */}
            <div className="rounded-2xl border border-[#D2A63C]/40 bg-[#D2A63C]/[0.04] p-6 ring-1 ring-[#D2A63C]/10">
              <div className="text-xs uppercase tracking-wider text-[#D2A63C]">Esta página</div>
              <h3 className="mt-2 text-xl font-semibold">Sensei Scalp Edition</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {[
                  ["Tempo gráfico", "M5"],
                  ["Como entra", "Ordens pendentes — o preço é que escolhe"],
                  ["Stop loss", "Não tem fixo. Quem fecha é a ordem de reversão"],
                  ["Ritmo", "Dezenas de ciclos por dia, com tecto diário"],
                  ["Instrumentos", "XAUUSD"],
                  [`Preço`, `${PRECO_ANUAL} €/ano — não está incluída em nenhum plano`],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-3">
                    <span className="w-28 shrink-0 text-gray-500">{k}</span>
                    <span className="text-gray-200">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
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
                t: "Arma os dois lados",
                d: "Um buy stop acima e um sell stop abaixo, à distância medida. Quando o preço se afasta, a ordem acompanha; quando se aproxima, fica quieta e deixa-se disparar.",
              },
              {
                n: "2",
                t: "Trailing desde o primeiro cêntimo",
                d: "Mal a posição fique positiva o stop vai para breakeven, e daí só sobe. Uma trade fechada pelo stop nunca fecha a negativo.",
              },
              {
                n: "3",
                t: "A reversão é o travão",
                d: "A ordem contrária fica logo a seguir ao stop. Quando o preço vira, ela fecha o lado errado e abre o outro, no mesmo movimento.",
              },
              {
                n: "4",
                t: "Empilha enquanto ganha",
                d: "Com a posição a correr, acrescenta mais uma do mesmo lado. Uma só linha de stop, puxada pela mais recente, fecha-as todas juntas.",
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

      {/* ── O que vem na caixa ───────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">O que vem na caixa</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Sliders,
                t: "Vinte parâmetros, não cento e onze",
                d: "O motor Sensei tem 68 afinações. Ficam todas fixas, nos valores com que a configuração foi medida. Vês o que muda alguma coisa: licença, lote, sessão, notícias e os travões.",
              },
              {
                icon: Gauge,
                t: "Painel no gráfico",
                d: "Iniciar, fechar tudo, inverter o lado, e trocar entre lote fixo e percentagem do saldo sem tirar a EA do gráfico. Mostra a leitura, os ciclos do dia, a próxima notícia e o estado da licença.",
              },
              {
                icon: Newspaper,
                t: "Filtro de notícias",
                d: "Vem ligado e, por defeito, fecha as posições na janela do evento em vez de apenas não abrir novas. Numa EA sem stop loss, estar dentro de uma NFP é o risco que interessa evitar.",
              },
              {
                icon: Download,
                t: "Instalador para Windows e macOS",
                d: "Encontra todos os terminais MT5 instalados — se tens duas corretoras, copia para as duas — e põe o EA, o indicador, o preset e o calendário no sítio certo.",
              },
              {
                icon: Clock,
                t: "Um preset, qualquer corretora",
                d: "As distâncias estão gravadas em dólares e convertidas no arranque. Funciona num ouro de duas casas decimais e num de três, sem tocares em nada.",
              },
              {
                icon: FileText,
                t: "Guia em PDF",
                d: "Instalação, licença, painel, dimensionamento e — a parte que importa — como a EA se comporta ao longo do dia, para saberes ler o que ela faz.",
              },
            ].map((c, i) => (
              <Revelar key={c.t} atraso={(i % 3) * 90}>
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

      {/* ── Como ler esta EA ────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <Revelar>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[#D2A63C]" />
              <h2 className="text-2xl md:text-3xl font-bold">Como ler esta EA</h2>
            </div>
            <p className="mt-4 text-gray-400">
              Um scalper de reversão não se comporta como um robô de alvos fixos. Sabe isto antes de a
              ligares e vais ler o painel com calma.
            </p>
          </Revelar>

          <div className="mt-8 space-y-4">
            {[
              {
                t: "A maioria dos ciclos fecha pequeno",
                d: "É assim por desenho. Muitos ciclos fecham com uma perda pequena — o custo do spread — e o resultado vem dos movimentos que correm. Sequências de pequenas perdas são o funcionamento normal, não uma avaria.",
              },
              {
                t: "Não há stop loss fixo — há três travões",
                d: "Quem fecha o lado errado é a ordem de reversão, e quando ela dispara há uma perda realizada. O que segura a conta são três limites — spread máximo, tecto de ciclos por dia e perda máxima diária — e vêm todos ligados.",
              },
              {
                t: "Começa no lote de origem",
                d: "0,01 lotes é a configuração com que a EA vem. Sobe só quando conheceres o ritmo dela na tua corretora: o spread que ela te dá é o que mais pesa no resultado.",
              },
              {
                t: "Números só com origem declarada",
                d: "Não pomos curvas nem taxas de acerto nesta página. Quando publicarmos resultados da Scalp Edition, vêm de conta real e medidos em pips — como já acontece na página do MTM Sensei EA.",
              },
            ].map((c, i) => (
              <Revelar key={c.t} atraso={i * 80}>
                <div className="rounded-xl border border-gray-800 border-l-[#D2A63C]/60 border-l-2 bg-gray-900/40 p-5">
                  <h3 className="font-semibold text-white">{c.t}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{c.d}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços ───────────────────────────────────────────────────────── */}
      <section id="precos" className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center">Licença</h2>
          <p className="mt-3 text-center text-gray-400">
            Uma conta MT5 por licença. Produto independente — não está incluído em nenhum plano de
            subscrição, nem para quem já tem o MTM Sensei EA.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-4">
            {[
              {
                id: "sensei_scalp_annual" as Plano,
                nome: "Anual",
                preco: `${PRECO_ANUAL} €`,
                sufixo: "/ano",
                notas: ["Renova sozinha", "Cancelas quando quiseres", "Actualizações incluídas"],
              },
              {
                id: "sensei_scalp_lifetime" as Plano,
                nome: "Vitalícia",
                preco: `${PRECO_VITALICIO} €`,
                sufixo: "uma vez",
                notas: ["Sem renovação", "Actualizações incluídas", "Paga-se em três anos e meio"],
              },
            ].map((p) => {
              const activo = plano === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlano(p.id)}
                  className={`text-left rounded-2xl border p-6 transition ${
                    activo
                      ? "border-[#D2A63C] bg-[#D2A63C]/[0.06] ring-1 ring-[#D2A63C]/30"
                      : "border-gray-800 bg-gray-950/60 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.nome}</span>
                    {activo && <Check className="w-4 h-4 text-[#D2A63C]" />}
                  </div>
                  <div className="mt-3">
                    <span className="text-3xl font-bold">{p.preco}</span>
                    <span className="ml-1 text-sm text-gray-500">{p.sufixo}</span>
                  </div>
                  <ul className="mt-4 space-y-1.5">
                    {p.notas.map((n) => (
                      <li key={n} className="text-sm text-gray-400 flex gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-600" />
                        {n}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="mt-8 space-y-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="O teu email — é para lá que vai a chave"
              className="bg-gray-950 border-gray-800"
            />
            <Input
              value={mt5Login}
              onChange={(e) => setMt5Login(e.target.value)}
              placeholder="Número da conta MT5 (opcional — podes dizer-nos depois)"
              className="bg-gray-950 border-gray-800"
            />
            {erro && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <X className="w-4 h-4" />
                {erro}
              </p>
            )}
            <Button
              onClick={comprar}
              disabled={aEnviar}
              className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold h-12"
            >
              {aEnviar ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />A abrir o pagamento…
                </>
              ) : plano === "sensei_scalp_annual" ? (
                `Comprar — ${PRECO_ANUAL} €/ano`
              ) : (
                `Comprar — ${PRECO_VITALICIO} € vitalícia`
              )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              Ainda não tens conta MT5? Compra na mesma — a licença prende-se à primeira conta que a
              usar.
            </p>
          </div>
        </div>
      </section>

      {/* ── Descarregar ──────────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">Descarregar</h2>
          <p className="mt-3 text-gray-400">
            O pacote é aberto — instala-o e conhece o painel. Para abrir ordens precisas da chave.
          </p>

          <div className="mt-8">
            <DescarregarMt5 />
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Button asChild variant="outline" className="border-gray-700 text-gray-200 hover:bg-gray-900 h-12">
              <a href="/downloads/MTM-Sensei-Scalp.zip">
                <Download className="w-4 h-4 mr-2" />
                Pacote da Scalp Edition
              </a>
            </Button>
            <Button asChild variant="outline" className="border-gray-700 text-gray-200 hover:bg-gray-900 h-12">
              <a href="/api/sensei-scalp/guia" target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4 mr-2" />
                Guia em PDF
              </a>
            </Button>
          </div>

          <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h3 className="font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D2A63C]" />O passo onde toda a gente tropeça
            </h3>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              No MetaTrader: <strong className="text-gray-200">Ferramentas → Opções → Consultores</strong>.
              Liga &quot;Permitir WebRequest para os seguintes URLs&quot; e acrescenta{" "}
              <code className="text-[#D2A63C]">https://www.morethanmoney.pt</code>. Sem isto a
              licença não valida — e o erro parece ser da chave, mas não é.
            </p>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-sm text-gray-600">
        Negociar envolve risco de perda. Resultados passados não garantem resultados futuros.
      </footer>
    </div>
  )
}
