"use client"

import { useState } from "react"
import Link from "next/link"
import QueroQueMeLiguem from "@/components/captacao/quero-que-me-liguem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  BellRing,
  Check,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Newspaper,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react"
import { MockupGrafico, MockupPainel, MockupConfirmacoes } from "@/components/sensei-ea-mockups"
import { SenseiResultadosLive } from "@/components/sensei-resultados-live"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import {
  ConfirmacoesAnimadas,
  FaixaFactos,
  FundoHero,
  GraficoEaAnimado,
  Inclinar,
  Revelar,
  SenseiEstilos,
} from "@/components/sensei/sensei-motion"

const PRECO_ANUAL = 297
const PRECO_VITALICIO = 1000

type Plano = "sensei_ea_annual" | "sensei_ea_lifetime"

export default function SenseiEaPage() {
  const [plano, setPlano] = useState<Plano>("sensei_ea_annual")
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
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-1 text-xs text-[#D2A63C]">
              <Sparkles className="w-3.5 h-3.5" />
              MetaTrader 5 · Expert Advisor · pronto a operar
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-bold leading-[1.05]">
              O <span className="bg-gradient-to-r from-[#E9C46A] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">MTM Sensei</span>{" "}
              a correr sozinho no teu MetaTrader
            </h1>
            <p className="mt-6 text-gray-300 text-lg leading-relaxed">
              A mesma leitura que fazemos à mão — estrutura, order blocks, liquidez, sessões —
              transformada num robô que lê, entra, tira parciais e faz trailing. Vinte confirmações
              antes de cada entrada, e o painel no gráfico para tomares conta quando quiseres.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#comprar">
                <Button className="snx-brilho bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold h-12 px-6 shadow-[0_10px_40px_-10px_rgba(210,166,60,.6)]">
                  Comprar licença
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <a href="/api/sensei-ea/guia" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] h-12 px-6 bg-transparent hover:bg-[#D2A63C]/10">
                  <FileText className="w-4 h-4 mr-2" />
                  Ler o guia (PDF)
                </Button>
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Incluído sem custo para membros Premium, VIP e Fundador.
            </p>
          </Revelar>

          <Revelar atraso={150}>
            <div className="snx-flutua">
              <Inclinar className="rounded-2xl border border-[#D2A63C]/25 bg-black/50 p-3 shadow-[0_30px_80px_-20px_rgba(210,166,60,.35)]">
                <GraficoEaAnimado className="w-full h-auto rounded-xl" />
              </Inclinar>
            </div>
            <p className="text-[11px] text-gray-600 px-2 pt-3">
              Ilustração animada do comportamento do EA. As velas e os preços são ilustrativos.
            </p>
          </Revelar>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pb-16">
          <FaixaFactos
            itens={[
              { valor: 20, rotulo: "confirmações por entrada" },
              { valor: 4, rotulo: "saídas parciais" },
              { valor: 3, rotulo: "instrumentos com preset" },
              { valor: 72, sufixo: " h", rotulo: "a operar sem internet" },
            ]}
          />
        </div>
      </section>

      {/* ── Do sinal à saída ─────────────────────────────────────────────── */}
      <section className="border-b border-gray-800/70 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-20 grid md:grid-cols-2 gap-12 items-center">
          <Revelar>
            <h2 className="text-3xl md:text-4xl font-bold">
              Do sinal à saída, <span className="text-[#D2A63C]">sem tirares os olhos da tua vida</span>
            </h2>
            <ol className="mt-8 space-y-6">
              {[
                {
                  icon: ListChecks,
                  t: "Lê",
                  d: "A cada vela fechada corre as vinte confirmações do Sensei. Cada entrada traz o seu score — vês porque é que entrou.",
                },
                {
                  icon: Target,
                  t: "Entra",
                  d: "A mercado, quando o setup confirma, já com stop loss e quatro alvos na corretora. Nada fica só na memória do terminal.",
                },
                {
                  icon: TrendingUp,
                  t: "Gere até ao fim",
                  d: "Parciais nos alvos, breakeven automático e trailing por ATR ou por pontos. Deixa um runner a correr ou fecha tudo na quarta saída.",
                },
              ].map(({ icon: Icon, t, d }, i) => (
                <li key={t} className="flex gap-4">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-xl bg-[#D2A63C]/10 ring-1 ring-[#D2A63C]/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-[#D2A63C]" />
                    </div>
                    {i < 2 && <div className="absolute left-1/2 top-12 h-8 w-px -translate-x-1/2 bg-gradient-to-b from-[#D2A63C]/40 to-transparent" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg">{t}</h3>
                    <p className="mt-1 text-sm text-gray-400 leading-relaxed">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Revelar>
          <Revelar atraso={150}>
            <ConfirmacoesAnimadas />
          </Revelar>
        </div>
      </section>

      {/* ── O que faz ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <Revelar>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">O que está lá dentro</h2>
          <p className="text-gray-400 max-w-2xl">
            Um só ficheiro para anexar ao gráfico. O indicador corre dentro do robô — não precisas de
            instalar nada por fora nem de ligar dois ficheiros um ao outro.
          </p>
        </Revelar>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
          {[
            {
              icon: ListChecks,
              t: "Vinte confirmações",
              d: "Tendência de tempo superior, EMA 200 fechada, estrutura (BOS/CHoCH), order blocks, sweeps de liquidez, POC, RSI, ADX, fluxo de ordens e sessão. Cada entrada traz o seu score.",
            },
            {
              icon: Target,
              t: "Gestão até ao fim",
              d: "Quatro saídas parciais configuráveis, breakeven automático e trailing por ATR ou por pontos. Podes deixar um runner a correr ou fechar tudo na quarta saída.",
            },
            {
              icon: LayoutDashboard,
              t: "Painel no gráfico",
              d: "Automático on/off, comprar e vender à mão, risco em % ou lotes, parcial imediato, trailing, fechar tudo, estilo de trading, PT/EN. Painéis arrastáveis.",
            },
            {
              icon: Newspaper,
              t: "Filtro de notícias",
              d: "Calendário do MetaTrader ou fonte externa por CSV/URL. Define a antecedência e o tempo depois do evento, e o robô fica quieto.",
            },
            {
              icon: ShieldCheck,
              t: "Modo prop firm",
              d: "Perda diária, perda total e alvo de lucro, medidos por saldo ou por equity. Trava o dia quando o limite é tocado e volta a abrir no dia seguinte.",
            },
            {
              icon: SlidersHorizontal,
              t: "Presets prontos",
              d: "Ficheiros .set com par, tempo gráfico e horário já afinados. O guia diz qual usar em cada instrumento.",
            },
            {
              icon: Download,
              t: "Instalador automático",
              d: "Windows e macOS. Encontra o teu MetaTrader — mesmo com dois instalados de corretoras diferentes — copia tudo para o sítio certo e abre o guia.",
            },
            {
              icon: BellRing,
              t: "Avisos de versão",
              d: "O EA diz-te quando sai uma versão nova e o que mudou, e pode descarregá-la para a pasta Files. Afinações de risco e trailing podem chegar do servidor, se autorizares.",
            },
          ].map(({ icon: Icon, t, d }, i) => (
            <Revelar key={t} atraso={(i % 4) * 90}>
              <div className="group h-full rounded-xl border border-gray-800 bg-gray-900/50 p-6 transition duration-300 hover:-translate-y-1 hover:border-[#D2A63C]/40 hover:shadow-[0_20px_50px_-25px_rgba(210,166,60,.5)]">
                <div className="rounded-lg bg-[#D2A63C]/10 w-10 h-10 flex items-center justify-center ring-1 ring-[#D2A63C]/20 mb-4 transition group-hover:bg-[#D2A63C]/20">
                  <Icon className="w-5 h-5 text-[#D2A63C]" />
                </div>
                <h3 className="font-semibold text-white mb-2">{t}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{d}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-14">
          <Revelar>
            <Inclinar className="rounded-2xl border border-[#D2A63C]/20 bg-black/40 p-3">
              <MockupPainel className="w-full h-auto rounded-lg" />
            </Inclinar>
            <p className="text-[11px] text-gray-600 px-2 pt-2">Painel de controlo, sobre o gráfico.</p>
          </Revelar>
          <Revelar atraso={120}>
            <Inclinar className="rounded-2xl border border-[#D2A63C]/20 bg-black/40 p-3">
              <MockupConfirmacoes className="w-full h-auto rounded-lg" />
            </Inclinar>
            <p className="text-[11px] text-gray-600 px-2 pt-2">Confirmações em tempo real.</p>
          </Revelar>
        </div>
      </section>

      {/* A prova só existe quando a amostra existir: o componente traz a secção inteira e
          devolve nada enquanto a conta não tiver histórico que chegue. */}
      <SenseiResultadosLive />

      {/* ── Como funciona a licença ──────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Como funciona a licença</h2>
        <div className="grid md:grid-cols-4 gap-6 mt-8">
          {[
            { n: "1", t: "Pagas", d: "E indicas o número da conta MT5, se já o tiveres. Se não, deixas em branco." },
            { n: "2", t: "Recebes a chave", d: "Por email, no formato MTM-XXXX-XXXX-XXXX, com o pacote e o guia." },
            { n: "3", t: "Corres o instalador", d: "Windows ou macOS: encontra o teu MetaTrader sozinho, põe tudo no sítio e abre o guia." },
            { n: "4", t: "Colas a chave", d: "No campo \"Licença\" do EA. Aparece \"LICENCA: valida\" e podes ligar o AutoTrading." },
          ].map(({ n, t, d }) => (
            <div key={n} className="relative rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <span className="absolute -top-3 left-6 rounded-md bg-[#D2A63C] text-black text-xs font-bold px-2 py-0.5">
                {n}
              </span>
              <h3 className="font-semibold text-white mt-2 mb-2">{t}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-6">
          Uma licença vale para <strong className="text-gray-300">uma conta MT5</strong>. Mudaste de
          corretora? Pedes e libertamos. Se a internet cair, o robô aguenta 72 horas com a última
          validação antes de parar de abrir ordens.
        </p>
      </section>

      {/* ── Preços e checkout ────────────────────────────────────────────── */}
      <section id="comprar" className="border-t border-gray-800 bg-gray-900/30">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-center">Licença</h2>
          <p className="text-gray-400 text-center mb-10">
            Uma conta MT5 por licença. Presets, guia e actualizações incluídos.
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                id: "sensei_ea_annual" as Plano,
                nome: "Anual",
                preco: `${PRECO_ANUAL} €`,
                nota: "por ano · renova sozinha",
                itens: ["1 conta MT5", "Presets e guia", "Actualizações durante a subscrição", "Cancelas quando quiseres"],
              },
              {
                id: "sensei_ea_lifetime" as Plano,
                nome: "Vitalícia",
                preco: `${PRECO_VITALICIO} €`,
                nota: "pagamento único · sem prazo",
                itens: ["1 conta MT5", "Presets e guia", "Actualizações sem prazo", "Sem renovações"],
                destaque: true,
              },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlano(p.id)}
                className={`text-left rounded-2xl border p-6 transition-all ${
                  plano === p.id
                    ? "border-[#D2A63C] bg-[#D2A63C]/[0.07] ring-1 ring-[#D2A63C]/40"
                    : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{p.nome}</span>
                  {p.destaque && (
                    <span className="text-[10px] uppercase tracking-wider text-[#D2A63C] border border-[#D2A63C]/40 rounded px-2 py-0.5">
                      sem renovações
                    </span>
                  )}
                </div>
                <div className="mt-3 text-3xl font-bold text-[#D2A63C] tabular-nums">{p.preco}</div>
                <div className="text-xs text-gray-500 mt-1">{p.nota}</div>
                <ul className="mt-4 space-y-1.5">
                  {p.itens.map((i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check className="w-3.5 h-3.5 text-[#D2A63C] mt-0.5 shrink-0" />
                      {i}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="para onde vai a chave"
                  className="bg-black/40 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">
                  Conta MT5 <span className="text-gray-600">(opcional)</span>
                </label>
                <Input
                  value={mt5Login}
                  onChange={(e) => setMt5Login(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="só dígitos"
                  className="bg-black/40 border-gray-700 text-white font-mono"
                />
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Ainda não abriste conta? Deixa em branco — a licença prende-se à primeira conta onde
              ligares o EA.
            </p>

            {erro && <p className="text-sm text-red-400">{erro}</p>}

            <Button
              onClick={comprar}
              disabled={aEnviar}
              className="w-full h-12 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-semibold"
            >
              {aEnviar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {plano === "sensei_ea_annual"
                    ? `Comprar — ${PRECO_ANUAL} €/ano`
                    : `Comprar — ${PRECO_VITALICIO} € vitalícia`}
                </>
              )}
            </Button>

            <p className="text-xs text-gray-600 text-center">
              Pagamento seguro com Stripe. Já és membro Premium ou VIP?{" "}
              <Link href="/member-area?tab=subscription" className="text-[#D2A63C] hover:underline">
                emite a tua licença sem custo
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ── Perguntas ────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Perguntas que nos fazem sempre</h2>
        <div className="space-y-5">
          {[
            {
              q: "Preciso de deixar o computador ligado?",
              a: "Sim, ou de uma VPS. O EA corre dentro do MetaTrader — se o terminal fechar, nada acontece. As posições já abertas ficam com o stop e o take profit na corretora.",
            },
            {
              q: "Funciona em conta de prop firm?",
              a: "Tem um módulo próprio para isso: perda diária, perda total e alvo, medidos por saldo ou por equity. Confirma sempre os limites da tua empresa — os valores por defeito são só um ponto de partida.",
            },
            {
              q: "Posso usar a licença em duas contas?",
              a: "Não. Cada licença vale para uma conta MT5. Precisas de outra conta, compras outra licença — ou pedes para libertar a que tens, se mudaste de corretora.",
            },
            {
              q: "O que acontece se cancelar a anual?",
              a: "A licença deixa de validar no fim do período pago e o EA pára de abrir ordens novas. As posições abertas continuam a ser geridas até fecharem.",
            },
            {
              q: "Que corretora recomendam?",
              a: "Qualquer uma com MT5 e spreads decentes em ouro. Os presets foram afinados em contas com 2 e 3 casas decimais no XAUUSD, e o script MTM_Setup diz-te o que a tua corretora tem.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h3 className="font-semibold text-white mb-2">{q}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <a href="/api/sensei-ea/guia" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C]">
              <FileText className="w-4 h-4 mr-2" />
              Guia completo em PDF
            </Button>
          </a>
          {/* Antes do pacote: sem MetaTrader o pacote nao serve de nada, e quem chega aqui
              pode nem o ter instalado. */}
          <DescarregarMt5 />
          {/* O pacote e aberto de proposito: quem o descarrega sem licenca fica com um EA que
              nao abre ordens. A porta e a licenca, nao o ficheiro. */}
          <a href="/downloads/MTM-Sensei-EA.zip" download>
            <Button variant="outline" className="border-gray-700 text-gray-300">
              <Download className="w-4 h-4 mr-2" />
              Descarregar o pacote
            </Button>
          </a>
        </div>

        <p className="mt-10 text-xs text-gray-600 leading-relaxed">
          Software de apoio à decisão. Negociar com alavancagem implica risco de perda do capital
          investido. Resultados passados dos sinais não são indicativos de resultados
          futuros. Nada nesta página é aconselhamento de investimento.
        </p>
      </section>

      <QueroQueMeLiguem origem="produto:/sensei-ea" interesseInicial="ea_sensei" titulo="Queres ajuda a instalar a EA Sensei?" />
    </div>
  )
}
