import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Bell, CheckCircle, Hand, LineChart, Link2, Repeat, ShieldCheck, Smartphone, Zap } from "lucide-react"
import DemoTapToTrade from "@/components/automation/demo-tap-to-trade"

export const metadata: Metadata = {
  title: "Tap to Trade e cópia automática na MTM Auto | MoreThanMoney",
  description:
    "Os sinais MTM chegam ao teu telemóvel e abrem na tua conta com um toque — ou sozinhos. Tudo na app MTM Auto. MT4, MT5 e TradeLocker.",
}

/**
 * /automation — a porta de entrada da execução.
 *
 * A página antiga abria com um «Tap to Trade MTM» genérico e mandava para três produtos ao mesmo
 * nível, sem dizer onde o Tap to Trade vive. Desde que a execução saiu da app MTM System, quem lá
 * procurava o botão ficava sem saber para onde ir. Esta página faz o caminho de venda numa linha:
 * o que é → como funciona (em 4 tempos) → manual ou automático → preço → robôs para quem vive no
 * MetaTrader → dúvidas. Um único CTA principal (MTM Auto), repetido nos sítios de decisão.
 *
 * Nomes de produtos, scanners e estratégias ficam como são — não se traduzem.
 */
export default function AutomationPage() {
  return (
    <div className="relative overflow-hidden bg-[#07080B] text-white">
      {/* Brilho dourado de fundo, discreto */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(210,166,60,0.22),transparent)]"
      />

      {/* ── 1. Herói ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-[1.15fr_1fr] md:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-1 text-xs font-semibold text-[#E9C46A]">
            <Smartphone className="h-3.5 w-3.5" /> Agora na app MTM Auto
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
            O sinal chega.
            <br />
            Tu tocas.
            <br />
            <span className="bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] bg-clip-text text-transparent">
              Abre na tua conta.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Com o <b className="text-white">Tap to Trade</b> da <b className="text-[#E9C46A]">MTM Auto</b> recebes cada
            ideia das estratégias MTM no telemóvel, revês entrada, stop e alvos, e abres na tua corretora com um toque.
            Preferes não decidir? Liga a cópia automática e a app abre por ti.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/mtmauto"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] px-7 py-4 text-base font-bold text-black transition hover:brightness-110"
            >
              <Smartphone className="h-5 w-5" /> Descarregar a MTM Auto
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-7 py-4 text-base font-semibold text-white/85 transition hover:bg-white/5"
            >
              Ver como funciona <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/55">
            <li className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-[#D2A63C]" />iOS, Android e web</li>
            <li className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-[#D2A63C]" />MT4, MT5 e TradeLocker</li>
            <li className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-[#D2A63C]" />Descarregar é grátis</li>
          </ul>
        </div>

        <DemoTapToTrade />
      </section>

      {/* ── 2. O que mudou ───────────────────────────────────────────────────── */}
      {/* Quem já usava o Tap to Trade na MTM System tem de encontrar aqui, sem procurar, para onde
          ele foi — senão a primeira coisa que faz é abrir um pedido de suporte. */}
      <section className="relative mx-auto max-w-6xl px-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#D2A63C]/30 bg-[#12141A] p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D2A63C]/15">
              <Repeat className="h-5 w-5 text-[#E9C46A]" />
            </div>
            <div>
              <p className="font-bold">Usavas o Tap to Trade na MTM System?</p>
              <p className="mt-1 text-sm text-white/60">
                A execução passou para a <b className="text-white/85">MTM Auto</b>: é lá que aceitas os sinais e escolhes a
                conta. Na <b className="text-white/85">MTM System</b> continuas a ter os alertas, o chat, os scanners e a
                academia. Entras nas duas com o mesmo login.
              </p>
            </div>
          </div>
          <Link
            href="/mtmauto"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D2A63C]/50 px-5 py-3 text-sm font-bold text-[#E9C46A] transition hover:bg-[#D2A63C]/10"
          >
            Instalar a MTM Auto <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── 3. Como funciona ─────────────────────────────────────────────────── */}
      <section id="como-funciona" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
        <h2 className="text-center text-3xl font-black md:text-5xl">
          Começas em <span className="text-[#E9C46A]">três passos</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/60">
          Não precisas de perceber de trading nem de ficar a olhar para gráficos. Precisas de uma conta numa corretora
          e de cinco minutos.
        </p>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          <Passo
            n={1}
            icone={<Link2 className="h-5 w-5" />}
            titulo="Liga a tua conta"
            texto="Instalas a MTM Auto e ligas a tua conta MT4, MT5 ou TradeLocker. Uma conta real e uma demo estão incluídas."
          />
          <Passo
            n={2}
            icone={<Bell className="h-5 w-5" />}
            titulo="Escolhe as estratégias"
            texto="Segues as estratégias MTM que quiseres e defines o risco de cada uma: lote fixo, % da conta ou multiplicador."
          />
          <Passo
            n={3}
            icone={<Hand className="h-5 w-5" />}
            titulo="Toca ou deixa correr"
            texto="Cada sinal chega como notificação. Aceitas com um toque — ou ligas a cópia automática e não tens de fazer nada."
          />
        </ol>
      </section>

      {/* ── 4. Manual ou automático ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-center text-3xl font-black md:text-5xl">
          Tu decides quanto <span className="text-[#E9C46A]">controlo</span> queres
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/60">
          As duas formas vivem na mesma app e podes mudar por estratégia, quando quiseres.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Modo
            destaque
            icone={<Hand className="h-6 w-6" />}
            titulo="Tap to Trade"
            sub="Recebes, revês, confirmas"
            itens={[
              "Vês entrada, stop e alvos antes de abrir",
              "Escolhes em que conta abre cada sinal",
              "Um toque e a ordem segue para a corretora",
              "Ideal para quem quer aprender a decidir",
            ]}
          />
          <Modo
            icone={<Zap className="h-6 w-6" />}
            titulo="Cópia automática"
            sub="Abre sozinho, com o teu risco"
            itens={[
              "Cada sinal abre na hora, sem confirmação",
              "Risco definido por ti em cada estratégia",
              "Se um sinal não abrir, a app diz-te porquê",
              "Ideal para quem não pode estar ao telemóvel",
            ]}
          />
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-[#0E1015] p-5 text-sm text-white/65 sm:grid-cols-3">
          <p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[#D2A63C]" />Stop e alvos colocados na corretora desde o primeiro segundo.</p>
          <p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[#D2A63C]" />Breakeven, parciais e trailing geridos pelo motor MTM.</p>
          <p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[#D2A63C]" />O dinheiro fica sempre na tua conta, na tua corretora.</p>
        </div>
      </section>

      {/* ── 5. Preço ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-4 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#D2A63C]/70 via-[#D2A63C]/20 to-[#D2A63C]/50 p-[1.5px]">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-[#0E1015] p-8 text-center md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#E9C46A]">MTM Auto</p>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="text-6xl font-black">25€</span>
              <span className="text-white/50">/mês</span>
            </div>
            {/* A isenção é a razão pela qual muitos não pagam nada — esconder isso seria cobrar a
                quem já nos dá receita do outro lado. */}
            <p className="mt-3 text-lg font-semibold text-[#E9C46A]">Conta real PU Prime validada? Não pagas nada.</p>
            <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm text-white/70">
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-[#D2A63C]" />Tap to Trade e cópia automática</li>
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-[#D2A63C]" />Todas as estratégias MTM Auto activas</li>
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-[#D2A63C]" />Uma conta real e uma demo</li>
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-[#D2A63C]" />Notificações a cada sinal, em iOS, Android e web</li>
            </ul>
            <Link
              href="/mtmauto"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] px-7 py-4 text-base font-bold text-black transition hover:brightness-110 sm:w-auto"
            >
              <Smartphone className="h-5 w-5" /> Começar com a MTM Auto
            </Link>
            <p className="mt-3 text-xs text-white/40">Sem conta MTM obrigatória · MT4, MT5 ou TradeLocker</p>
          </div>
        </div>
      </section>

      {/* ── 6. Robôs no MetaTrader ───────────────────────────────────────────── */}
      {/* As EAs ficam DEPOIS do preço da MTM Auto: são para quem já vive dentro do MetaTrader e não
          quer uma app. Postas ao mesmo nível que a MTM Auto, partiam a decisão em três. */}
      <section className="relative mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-center text-2xl font-black md:text-4xl">Preferes o robô dentro do MetaTrader?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-white/60">
          Não copiam ninguém: é a nossa leitura de mercado a correr no teu MT5. Duas EAs diferentes, com licenças separadas.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <EA
            nome="MTM Sensei EA"
            sub="MT5 · o robô na tua conta"
            texto="Analisa, entra, tira parciais e faz trailing sozinho, com painel no gráfico para tomares conta quando quiseres."
            itens={["Quatro saídas parciais, breakeven e trailing", "Filtro de notícias e modo prop firm", "Instalador para Windows e macOS"]}
            preco="297€"
            precoNota="/ano · ou 1000€ vitalícia"
            isencao="Premium, VIP ou Fundador? Não pagas nada."
            href="/sensei-ea"
          />
          <EA
            nome="Sensei Scalp Edition"
            sub="MT5 · XAUUSD em M5"
            texto="Não é uma versão nova do Sensei EA — é outra EA. Arma ordens dos dois lados, deixa o preço escolher e acompanha com breakeven."
            itens={["Dezenas de ciclos por dia no ouro", "Lote fixo ou percentagem, ao vivo no painel", "Filtro de notícias que fecha, não só bloqueia"]}
            preco="200€"
            precoNota="/ano · ou 697€ vitalícia"
            isencao="Licença própria, não incluída em nenhum plano."
            href="/sensei-scalp"
          />
        </div>
      </section>

      {/* ── 7. Dúvidas ───────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-4 pb-20">
        <h2 className="text-center text-2xl font-black md:text-4xl">Dúvidas rápidas</h2>
        <div className="mt-8 space-y-3">
          <Duvida p="Onde está agora o Tap to Trade?">
            Na app MTM Auto, no separador Sinais. Os sinais do Tap to Trade e os das estratégias aparecem no mesmo sítio,
            e é lá que aceitas e escolhes a conta. A MTM System continua com os alertas, o chat e a academia.
          </Duvida>
          <Duvida p="Preciso de ser membro da MoreThanMoney?">
            Não. Descarregas a MTM Auto, crias conta e ligas a tua corretora. Se já és membro, entras com o mesmo login.
          </Duvida>
          <Duvida p="Que corretoras funcionam?">
            Qualquer corretora com MT4, MT5 ou TradeLocker. Com uma conta real PU Prime validada, a MTM Auto fica grátis.
          </Duvida>
          <Duvida p="Posso usar Tap to Trade numa estratégia e cópia automática noutra?">
            Sim. O modo escolhe-se por estratégia e podes mudar quando quiseres.
          </Duvida>
          <Duvida p="A MTM tem acesso ao meu dinheiro?">
            Não. O dinheiro fica na tua conta, na tua corretora. A app só envia as ordens que aceitas ou que deixaste em
            cópia automática.
          </Duvida>
        </div>
      </section>

      {/* ── 8. Fecho ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-4xl px-4 pb-16 text-center">
        <h2 className="text-3xl font-black md:text-5xl">
          O próximo sinal pode ser o <span className="text-[#E9C46A]">teu primeiro toque</span>.
        </h2>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/mtmauto"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] px-8 py-4 text-base font-bold text-black transition hover:brightness-110"
          >
            <Smartphone className="h-5 w-5" /> Descarregar a MTM Auto
          </Link>
          <Link
            href="/scanner-access"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-base font-semibold text-white/85 transition hover:bg-white/5"
          >
            <LineChart className="h-5 w-5" /> Ver os scanners
          </Link>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-xs leading-relaxed text-white/35">
          Conteúdo educativo, não constitui consultoria financeira. Negociar CFDs e Forex envolve risco elevado de perda
          de capital e os resultados passados não garantem resultados futuros. Os preços mostrados na demonstração são
          exemplos.
        </p>
      </section>
    </div>
  )
}

function Passo({ n, icone, titulo, texto }: { n: number; icone: React.ReactNode; titulo: string; texto: string }) {
  return (
    <li className="relative rounded-2xl border border-white/10 bg-[#0E1015] p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#D2A63C]/15 text-[#E9C46A]">{icone}</span>
        <span className="text-sm font-bold text-white/30">0{n}</span>
      </div>
      <h3 className="mt-4 text-xl font-bold">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{texto}</p>
    </li>
  )
}

function Modo({
  icone,
  titulo,
  sub,
  itens,
  destaque = false,
}: {
  icone: React.ReactNode
  titulo: string
  sub: string
  itens: string[]
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-7 ${
        destaque ? "border-[#D2A63C]/50 bg-gradient-to-br from-[#D2A63C]/12 to-[#0E1015]" : "border-white/10 bg-[#0E1015]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#D2A63C]/15 text-[#E9C46A]">{icone}</span>
        <div>
          <h3 className="text-2xl font-bold">{titulo}</h3>
          <p className="text-sm font-semibold text-[#E9C46A]">{sub}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-2.5 text-sm text-white/70">
        {itens.map((i) => (
          <li key={i} className="flex gap-2.5">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" />
            {i}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EA({
  nome,
  sub,
  texto,
  itens,
  preco,
  precoNota,
  isencao,
  href,
}: {
  nome: string
  sub: string
  texto: string
  itens: string[]
  preco: string
  precoNota: string
  isencao: string
  href: string
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-[#0E1015] p-7">
      <h3 className="text-xl font-bold">{nome}</h3>
      <p className="text-sm font-semibold text-[#E9C46A]">{sub}</p>
      <p className="mt-4 text-sm leading-relaxed text-white/65">{texto}</p>
      <ul className="mt-4 space-y-2 text-sm text-white/65">
        {itens.map((i) => (
          <li key={i} className="flex gap-2.5">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" />
            {i}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <p>
          <span className="text-2xl font-black">{preco}</span> <span className="text-sm text-white/45">{precoNota}</span>
        </p>
        <p className="mt-1 text-sm text-white/50">{isencao}</p>
        <Link
          href={href}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D2A63C]/50 px-5 py-3 text-sm font-bold text-[#E9C46A] transition hover:bg-[#D2A63C]/10"
        >
          Ver o {nome} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

function Duvida({ p, children }: { p: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-[#0E1015] p-5 open:border-[#D2A63C]/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
        {p}
        <span className="text-[#E9C46A] transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{children}</p>
    </details>
  )
}
