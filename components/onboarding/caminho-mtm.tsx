"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ehIosNativo } from "@/lib/app-nativa"

/**
 * O CAMINHO DO ECOSSISTEMA — os cinco passos do onboarding MTM, por ordem.
 *
 * Substitui o guia em HTML solto (public/onboarding-mtm.html), que tinha ficado para trás: mandava
 * marcar no Calendly (saiu a 30/09), punha o Tap to Trade na app MTM System (passou para o MTM Auto
 * a 05/10), prometia «resultados em 48 horas» e, sobretudo, não tinha o passo da corretora. Sem
 * conta na corretora não há «ganha enquanto aprendes»: os sinais não têm onde trabalhar. Por isso
 * a corretora é aqui o passo do meio, o mais explicado, e o único com vídeo próprio.
 *
 * Dois cuidados que não são de gosto:
 *  · Na app iOS (Apple 3.7.2, rejeição de 02/09/2026) não se angaria para a corretora nem se mostram
 *    preços de subscrição (3.1.1). Os passos 1 e 3 trocam de texto lá dentro, e o passo 2 dá-se
 *    por feito — quem lê isto na app já a instalou.
 *  · Os números (preços, depósito, bónus) chegam por props de quem os tem: `escada-precos` e
 *    `broker/deposito-minimo`. Nada de valores escritos à mão neste ficheiro.
 *
 * O progresso fica no telemóvel (localStorage) e é ajudado pelo que se sabe da conta: com sessão,
 * o passo 1 está feito; com o UID da corretora guardado no perfil, o passo 3 também.
 */

export type DadosCaminho = {
  premium1oMes: string
  premiumMensal: string
  depositoMinimoUsd: number
  bonusPct: number
  linkAgendarOnboarding: string
  /** O vídeo de 2 minutos da abertura de conta. `null` enquanto não estiver renderizado. */
  videoAbrirConta: string | null
}

const CHAVE = "mtm_onboarding_passos"
const TOTAL = 5

function lerFeitos(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || "[]")
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : []
  } catch {
    return []
  }
}

function gravarFeitos(feitos: number[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(feitos))
  } catch {}
}

export default function CaminhoMtm({ dados }: { dados: DadosCaminho }) {
  const [ios, setIos] = useState(false)
  const [feitos, setFeitos] = useState<number[]>([])
  const [aberto, setAberto] = useState<number | null>(1)

  useEffect(() => {
    const noIos = ehIosNativo()
    setIos(noIos)
    const base = lerFeitos()
    if (noIos && !base.includes(2)) base.push(2)
    setFeitos(base)

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) return
        const auto = [1]
        const { data } = await supabase
          .from("profiles")
          .select("broker_uid")
          .eq("id", session.user.id)
          .single()
        if (data?.broker_uid) auto.push(3)
        setFeitos((f) => {
          const novo = Array.from(new Set([...f, ...auto]))
          gravarFeitos(novo)
          return novo
        })
        // Abre o primeiro passo que falta, em vez de obrigar a fechar os que já estão feitos.
        setAberto((a) => (a === 1 ? [1, 2, 3, 4, 5].find((n) => !auto.includes(n) && !base.includes(n)) ?? null : a))
      } catch {}
    })()
  }, [])

  const alternarFeito = (n: number) => {
    setFeitos((f) => {
      const novo = f.includes(n) ? f.filter((x) => x !== n) : [...f, n]
      gravarFeitos(novo)
      return novo
    })
    if (!feitos.includes(n)) setAberto(n < TOTAL ? n + 1 : null)
  }

  const n = feitos.filter((x) => x >= 1 && x <= TOTAL).length

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between text-[13px] text-[#8a8a95]">
        <span>
          {n === TOTAL ? "Está tudo montado." : `${n} de ${TOTAL} passos feitos`}
        </span>
        <span className="tabular-nums">{Math.round((n / TOTAL) * 100)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b1d24]">
        <div
          className="h-full rounded-full bg-[#D2A63C] transition-[width] duration-500"
          style={{ width: `${(n / TOTAL) * 100}%` }}
        />
      </div>

      <ol className="mt-8 space-y-3">
        <Passo
          n={1}
          titulo="Cria a tua conta MTM"
          resumo={ios ? "Já entraste com a tua conta." : "3 dias de Premium sem pagar nada."}
          feito={feitos.includes(1)}
          aberto={aberto === 1}
          onAbrir={() => setAberto(aberto === 1 ? null : 1)}
          onFeito={() => alternarFeito(1)}
        >
          {ios ? (
            <p>Estás na app com a tua conta, por isso este passo já está feito. Segue para o passo 3.</p>
          ) : (
            <>
              <p>
                Regista-te e escolhe <b>«Grátis 3 dias»</b>. Ficas com o Premium inteiro: sinais, aulas ao
                vivo, scanners e a comunidade.
              </p>
              <ul className="mt-3 space-y-1.5">
                <Item>O cartão fica registado, mas nos 3 dias não é cobrado nada.</Item>
                <Item>
                  Se continuares, o 1.º mês fica a {dados.premium1oMes} e depois {dados.premiumMensal}.
                </Item>
                <Item>Cancelas na tua conta quando quiseres, sem teres de falar com ninguém.</Item>
              </ul>
              <Dica>
                Usa o mesmo email aqui, na app e na corretora. É por ele que ligamos as três coisas à tua
                conta.
              </Dica>
              <Botao href="/register">Criar conta com 3 dias grátis</Botao>
            </>
          )}
        </Passo>

        <Passo
          n={2}
          titulo="Instala a app MTM System"
          resumo="No telemóvel, no computador, ou nos dois."
          feito={feitos.includes(2)}
          aberto={aberto === 2}
          onAbrir={() => setAberto(aberto === 2 ? null : 2)}
          onFeito={() => alternarFeito(2)}
        >
          <p>
            É a mesma conta em todo o lado. Começas no telemóvel e continuas no computador, e está tudo
            sincronizado.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Plataforma titulo="iPhone e iPad" href="https://apps.apple.com/app/id6778558643" cta="App Store" />
            <Plataforma
              titulo="Android"
              href="/downloads/MoreThanMoney.apk"
              cta="Descarregar APK"
              nota="Se o telemóvel pedir, autoriza instalar desta fonte."
            />
            <Plataforma titulo="Computador" href="/app-mobile" cta="Abrir no browser" nota="Sem instalar nada." />
          </div>
          <Dica>
            Quando a app pedir para enviar notificações, aceita. É por aí que chegam os alertas e o aviso de
            que uma aula começou.
          </Dica>
        </Passo>

        <Passo
          n={3}
          titulo="Abre a tua conta na corretora"
          resumo="O passo que põe o «ganha enquanto aprendes» a funcionar."
          destaque
          feito={feitos.includes(3)}
          aberto={aberto === 3}
          onAbrir={() => setAberto(aberto === 3 ? null : 3)}
          onFeito={() => alternarFeito(3)}
        >
          {ios ? (
            <p>A abertura de conta na corretora faz-se no nosso site, fora da app.</p>
          ) : (
            <PassoCorretora dados={dados} />
          )}
        </Passo>

        <Passo
          n={4}
          titulo="Liga os sinais à tua conta"
          resumo="Cópia automática ou alertas para executares tu."
          feito={feitos.includes(4)}
          aberto={aberto === 4}
          onAbrir={() => setAberto(aberto === 4 ? null : 4)}
          onFeito={() => alternarFeito(4)}
        >
          <p>Há duas maneiras de usar os sinais. Escolhe uma agora e mudas quando quiseres.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Escolha
              titulo="MTM Auto"
              texto="Os sinais copiam-se sozinhos para a tua conta MT5 ou MT4, com o risco que definires. Também é lá que vive o Tap to Trade, para aprovares cada sinal com um toque."
              para="Para quem está a começar ou não tem tempo para estar ao ecrã."
              href="/onboarding/mtm-auto"
              cta="Configurar o MTM Auto"
            />
            <Escolha
              titulo="Alertas MTM"
              texto="Recebes cada sinal com entrada, stop e alvos, e abres tu a operação na corretora."
              para="Para quem já opera, ou quer aprender a executar à mão."
              href="/alertas-mtm"
              cta="Abrir os alertas"
            />
          </div>
          <Dica>
            A cópia automática abre operações reais na tua conta. Começa com risco baixo (por exemplo 0,5% por
            operação) e afina-o na chamada de onboarding.
          </Dica>
        </Passo>

        <Passo
          n={5}
          titulo="Entra nas aulas e marca a tua chamada"
          resumo="A parte do «aprendes». E 30 minutos connosco para fechar tudo."
          feito={feitos.includes(5)}
          aberto={aberto === 5}
          onAbrir={() => setAberto(aberto === 5 ? null : 5)}
          onFeito={() => alternarFeito(5)}
        >
          <p>
            Na app, o separador <b>Aulas</b> tem as academias, as salas ao vivo e as gravações. Se nunca
            operaste, começa pela sala <b>Básicos de Trading</b>.
          </p>
          <ul className="mt-3 space-y-1.5">
            <Item>Forex e metais, com o Ricardo Garcia</Item>
            <Item>Criptomoedas, com o Ruben Pereira</Item>
            <Item>Ações e ETF, Imobiliário, Social Media e UGC</Item>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao href="/live-sessions">Ver as academias</Botao>
            <Botao href={dados.linkAgendarOnboarding} secundario>
              Marcar a chamada de onboarding
            </Botao>
          </div>
          <p className="mt-4 text-[13px] text-[#8a8a95]">
            Na chamada confirmamos a conta, a app, a corretora e o teu risco, e saímos com um plano de estudo
            para as primeiras semanas.
          </p>
        </Passo>
      </ol>
    </div>
  )
}

/**
 * O passo da corretora, contado pela ordem do registo na PU Prime: perfil e verificação primeiro,
 * conta real depois, depósito no fim. É a ordem em que a corretora deixa fazer as coisas, e quem a
 * tenta saltar fica parado num ecrã sem perceber porquê.
 */
function PassoCorretora({ dados }: { dados: DadosCaminho }) {
  return (
    <>
      <p>
        O <b>ganha enquanto aprendes</b> precisa de uma conta tua. É nela que os sinais e o MTM Auto
        trabalham enquanto tu estudas. O dinheiro fica em teu nome na PU Prime, a nossa corretora parceira,
        e a MTM nunca lhe toca.
      </p>

      {dados.videoAbrirConta && (
        <video
          className="mt-4 aspect-video w-full rounded-xl border border-[#23262F] bg-black"
          src={dados.videoAbrirConta}
          controls
          playsInline
          preload="metadata"
        />
      )}

      <ol className="mt-4 space-y-3">
        <SubPasso n="a" titulo="Abre o registo pelo nosso link">
          Tem de ser por este link. Uma conta aberta diretamente no site da PU Prime não fica ligada à MTM, e
          aí não te conseguimos dar o acesso pela corretora.
        </SubPasso>
        <SubPasso n="b" titulo="Cria o perfil e verifica a identidade">
          Nome, email, telemóvel e país. Depois o Cartão de Cidadão ou passaporte e um comprovativo de morada
          recente. A verificação demora entre uns minutos e 24 horas, e sem ela não dá para depositar.
        </SubPasso>
        <SubPasso n="c" titulo="Abre uma conta real (Live)">
          Tipo <b>Standard</b>, plataforma <b>MT5</b>, moeda <b>USD</b>. A corretora envia-te por email o
          número da conta, a palavra-passe e o servidor. Guarda esse email.
        </SubPasso>
        <SubPasso n="d" titulo="Faz o primeiro depósito">
          A partir de {dados.depositoMinimoUsd} $ ficas com o bónus de {dados.bonusPct}% da PU Prime e com
          direito ao Premium sem mensalidade, enquanto mantiveres esse saldo. Deposita só dinheiro de que não
          precisas.
        </SubPasso>
        <SubPasso n="e" titulo="Guarda o número da conta na MTM">
          Na app, em <b>Abrir conta</b>, colas o teu UID (o número da conta PU Prime). Depois envia o mesmo UID
          ao nosso bot no Telegram: é lá que se valida o depósito e se ativa o Premium sem mensalidade.
        </SubPasso>
      </ol>

      <div className="mt-4 rounded-xl border border-[#3a2f17] bg-[#17140c] p-4 text-[13px] leading-relaxed text-[#d9cfb6]">
        <p className="font-semibold text-[#E9C46A]">Os enganos que mais vemos</p>
        <ul className="mt-2 space-y-1">
          <li>Registar fora do nosso link.</li>
          <li>Usar na corretora um email diferente do da MTM.</li>
          <li>Abrir uma conta Demo e depositar à espera de que seja real.</li>
          <li>Deixar a verificação a meio e não conseguir depositar.</li>
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Botao href="/abrir-conta" externo>
          Abrir conta na PU Prime
        </Botao>
        <Botao href="/app-mobile/accountopen" secundario>
          Guardar o meu UID
        </Botao>
        <Botao href="https://t.me/MoreThanMoney_aibot?start=lead" secundario>
          Validar no Telegram
        </Botao>
      </div>
    </>
  )
}

function Passo({
  n,
  titulo,
  resumo,
  feito,
  aberto,
  destaque = false,
  onAbrir,
  onFeito,
  children,
}: {
  n: number
  titulo: string
  resumo: string
  feito: boolean
  aberto: boolean
  destaque?: boolean
  onAbrir: () => void
  onFeito: () => void
  children: React.ReactNode
}) {
  return (
    <li
      className="overflow-hidden rounded-2xl border transition-colors"
      style={{
        borderColor: destaque ? "rgba(210,166,60,0.45)" : "#23262F",
        background: destaque ? "rgba(210,166,60,0.05)" : "#12141A",
      }}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={aberto}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold"
          style={{
            background: feito ? "#D2A63C" : "rgba(210,166,60,0.12)",
            color: feito ? "#0b0b0e" : "#D2A63C",
          }}
        >
          {feito ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
        </span>
        <span className="flex-1">
          <span className="block text-[16px] font-semibold text-white">{titulo}</span>
          <span className="block text-[13px] text-[#8a8a95]">{resumo}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8a8a95] transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {aberto && (
        <div className="border-t border-[#23262F] px-5 pb-5 pt-4 text-[14px] leading-relaxed text-[#b9b9c3]">
          {children}
          <button
            type="button"
            onClick={onFeito}
            className="mt-5 text-[13px] font-medium text-[#8a8a95] underline-offset-4 hover:text-white hover:underline"
          >
            {feito ? "Afinal ainda não fiz isto" : "Já fiz este passo"}
          </button>
        </div>
      )}
    </li>
  )
}

function SubPasso({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#3a3d47] text-[12px] font-semibold text-[#D2A63C]">
        {n}
      </span>
      <div>
        <p className="font-semibold text-white">{titulo}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#D2A63C]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-lg bg-[#1b1d24] px-3 py-2.5 text-[13px] text-[#c9c9d1]">{children}</p>
}

function Botao({
  href,
  children,
  secundario = false,
  externo = false,
}: {
  href: string
  children: React.ReactNode
  secundario?: boolean
  externo?: boolean
}) {
  const classe = secundario
    ? "inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 py-2.5 text-[14px] text-zinc-200 hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
    : "inline-flex min-h-[44px] items-center rounded-lg bg-[#D2A63C] px-4 py-2.5 text-[14px] font-semibold text-black hover:opacity-90"
  // /abrir-conta é um redireccionamento para fora do site: abre noutro separador para o guia
  // continuar aberto aqui, que é onde está o passo seguinte.
  if (externo || /^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`mt-4 ${classe}`}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={`mt-4 ${classe}`}>
      {children}
    </Link>
  )
}

function Plataforma({ titulo, href, cta, nota }: { titulo: string; href: string; cta: string; nota?: string }) {
  return (
    <a
      href={href}
      className="flex flex-col rounded-xl border border-[#23262F] bg-[#0e1015] p-4 hover:border-[#D2A63C]/50"
    >
      <span className="text-[14px] font-semibold text-white">{titulo}</span>
      {nota && <span className="mt-1 text-[12px] text-[#8a8a95]">{nota}</span>}
      <span className="mt-3 text-[13px] font-semibold text-[#D2A63C]">{cta} →</span>
    </a>
  )
}

function Escolha({
  titulo,
  texto,
  para,
  href,
  cta,
}: {
  titulo: string
  texto: string
  para: string
  href: string
  cta: string
}) {
  return (
    <Link href={href} className="flex flex-col rounded-xl border border-[#23262F] bg-[#0e1015] p-4 hover:border-[#D2A63C]/50">
      <span className="text-[15px] font-semibold text-white">{titulo}</span>
      <span className="mt-1.5 flex-1 text-[13px] leading-relaxed text-[#b9b9c3]">{texto}</span>
      <span className="mt-2 text-[12px] text-[#8a8a95]">{para}</span>
      <span className="mt-3 text-[13px] font-semibold text-[#D2A63C]">{cta} →</span>
    </Link>
  )
}
