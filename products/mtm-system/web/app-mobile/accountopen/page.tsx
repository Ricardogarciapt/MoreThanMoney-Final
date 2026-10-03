"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Info,
  Shield,
  TrendingUp,
  User,
  FileText,
  CreditCard,
  Smartphone,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

// Corretora de registo. PU Prime por defeito (site + Android + web); VT Markets só
// no app iOS nativo (que tem o seu próprio fluxo nativo — isto é rede de segurança).
type Broker = { key: string; name: string; referral: string; blurb: string; tags: string[] }
const BROKERS: Record<string, Broker> = {
  puprime: {
    key: "puprime",
    name: "PU Prime",
    referral: "https://www.puprime.com/campaign?cs=morethanmoney",
    blurb: "Spreads competitivos, execução rápida, MT4/MT5 e depósitos flexíveis. Suporte em português.",
    tags: ["MT4 / MT5", "Execução rápida", "Suporte PT", "Spreads baixos"],
  },
  vtmarkets: {
    key: "vtmarkets",
    name: "VT Markets",
    referral: "https://www.vtmarkets.net/campaign?cs=7d17097uqs",
    blurb: "Regulada pela ASIC (Austrália) e FSCA (África do Sul). Spreads competitivos, execução rápida e suporte em português.",
    tags: ["Regulada ASIC", "MT4 / MT5", "Suporte PT", "Spreads baixos"],
  },
}

/** Corretora de registo em todas as plataformas: PU Prime (site, Android, PWA e app iOS). */
function pickBroker(): Broker {
  return BROKERS.puprime
}

function makeSteps(b: string) {
  return [
    { id: 1, icon: ExternalLink, title: `Acede ao site da ${b}`, description: `Clica no botão abaixo para abrir o registo oficial da ${b} com o nosso link de parceiro.`, detail: "Ao usares o nosso link garantes que a conta fica associada ao grupo MTM — isso dá-te acesso às melhores condições de suporte.", action: "open_link" as const },
    { id: 2, icon: User, title: "Cria a tua conta", description: "Preenche os teus dados pessoais: nome completo, email, data de nascimento e país de residência.", detail: `Usa dados reais — a ${b} é uma corretora regulada e vai verificar a tua identidade.`, action: null },
    { id: 3, icon: FileText, title: "Verificação de identidade (KYC)", description: "Faz upload do teu documento de identificação (CC ou Passaporte) e um comprovativo de morada.", detail: "A verificação demora normalmente entre 30 minutos e 24 horas. Tens de a completar antes de poderes depositar.", action: null },
    { id: 4, icon: CreditCard, title: "Faz o teu primeiro depósito", description: "O depósito mínimo recomendado é de €100. Podes depositar via transferência bancária, cartão ou Skrill.", detail: "Recomendamos começar com um valor com que te sintas confortável. Não há pressão — podes começar com o mínimo.", action: null },
    { id: 5, icon: Smartphone, title: "Instala a plataforma MetaTrader", description: `Descarrega o MetaTrader 4 ou 5 (MT4/MT5) disponível no site da ${b} ou na App Store / Play Store.`, detail: `A ${b} fornece-te os dados de login (servidor, número de conta e password) assim que a conta estiver ativa.`, action: null },
    { id: 6, icon: TrendingUp, title: "Regista o teu UID na MTM", description: `Após criares a conta, copia o teu número de conta ${b} (UID) e guarda-o aqui.`, detail: `O UID é o número da tua conta na ${b} (ex: 12345678). Vais encontrá-lo no painel da ${b} após o login. Este passo desbloqueia as salas exclusivas de Trade Ideas.`, action: "save_uid" as const },
  ]
}

export default function AccountOpenPage() {
  const router = useRouter()
  /**
   * Dentro da app iOS esta página não se mostra.
   *
   * A Apple rejeitou a 3.7.2 (02/09/2026) depois de fotografar exactamente este ecrã: angariação
   * para um terceiro financeiro, com KYC e depósito, dentro da app. Esconder o atalho não chega —
   * o revisor pode chegar aqui pelo URL, e foi assim que ele lá chegou da primeira vez.
   *
   * No site e no Android fica tudo igual. O REGISTO DO UID continua a existir no iOS, nas
   * Definições: isso é validação de acesso, não é angariação.
   */
  const [noAppIos, setNoAppIos] = useState<boolean | null>(null)
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    setNoAppIos(/MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua))
  }, [])
  const { toast } = useToast()
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [expandedStep, setExpandedStep] = useState<number | null>(1)
  const [copiedLink, setCopiedLink] = useState(false)
  const [uid, setUid] = useState("")
  const [savedUid, setSavedUid] = useState("")
  const [savingUid, setSavingUid] = useState(false)
  const [linkOpened, setLinkOpened] = useState(false)
  const [broker, setBroker] = useState<Broker>(BROKERS.puprime)

  const STEPS = makeSteps(broker.name)

  useEffect(() => {
    setBroker(pickBroker())
    loadSavedUid()
  }, [])

  const loadSavedUid = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase
        .from("profiles")
        .select("broker_uid")
        .eq("id", session.user.id)
        .single()
      if (data?.broker_uid) {
        setSavedUid(data.broker_uid)
        setUid(data.broker_uid)
        // Auto-mark step 6 as done if UID already saved
        setCompletedSteps(prev => prev.includes(6) ? prev : [...prev, 6])
      }
    } catch {}
  }

  const toggleStep = (stepId: number) => {
    setExpandedStep(prev => prev === stepId ? null : stepId)
  }

  const markStepDone = (stepId: number) => {
    setCompletedSteps(prev =>
      prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId]
    )
  }

  const handleOpenLink = () => {
    window.open(broker.referral, "_blank", "noopener,noreferrer")
    setLinkOpened(true)
    markStepDone(1)
    setTimeout(() => setExpandedStep(2), 400)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(broker.referral)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
      toast({ title: "Link copiado!" })
    } catch {}
  }

  const handleSaveUid = async () => {
    if (!uid.trim()) {
      toast({ title: "Insere o teu UID", description: "O campo não pode estar vazio.", variant: "destructive" })
      return
    }
    setSavingUid(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error("Sem sessão")
      const { error } = await supabase
        .from("profiles")
        .update({ broker_uid: uid.trim() })
        .eq("id", session.user.id)
      if (error) throw error
      setSavedUid(uid.trim())
      markStepDone(6)
      toast({
        title: "UID guardado!",
        description: "O teu número de conta foi registado com sucesso.",
      })
      setTimeout(() => setExpandedStep(null), 500)
    } catch (err) {
      console.error(err)
      toast({ title: "Erro ao guardar UID", description: "Tenta novamente.", variant: "destructive" })
    } finally {
      setSavingUid(false)
    }
  }

  const allDone = completedSteps.length >= STEPS.length

  // `null` = ainda não se sabe. Não se pinta nada até saber, senão o ecrã pisca o conteúdo
  // que se está a tentar não mostrar.
  if (noAppIos !== false) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        {noAppIos === true && (
          <div className="max-w-sm text-center">
            <p className="text-[15px] text-gray-300">
              A abertura de conta na corretora faz-se no nosso site, fora da app.
            </p>
            <button
              onClick={() => router.back()}
              className="mt-5 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200"
            >
              Voltar
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div
        className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-base">Abrir Conta na Corretora</h1>
          <p className="text-xs text-gray-400">{broker.name} — Parceiro oficial MTM</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-[#D2A63C]/10 border border-[#D2A63C]/30 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#D2A63C]" />
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 pb-10">

        {/* Hero banner */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 border border-[#D2A63C]/20">
          <div className="h-1.5 bg-gradient-to-r from-[#D2A63C] to-[#BB8525]" />
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/30 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-[#D2A63C]" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg leading-tight">{broker.name} — Corretora Parceira</h2>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                  {broker.blurb}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {broker.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/10 text-[#D2A63C] border border-[#D2A63C]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">O teu progresso</span>
            <span className="text-sm text-[#D2A63C] font-semibold">{completedSteps.length}/{STEPS.length}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] h-2 rounded-full transition-all duration-500"
              style={{ width: `${(completedSteps.length / STEPS.length) * 100}%` }}
            />
          </div>
          {allDone && (
            <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Conta configurada! Já tens acesso às salas de Trade Ideas.</span>
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map(step => {
            const Icon = step.icon
            const isCompleted = completedSteps.includes(step.id)
            const isExpanded = expandedStep === step.id

            return (
              <div
                key={step.id}
                className={`bg-gray-900 rounded-xl border transition-all duration-200 overflow-hidden ${
                  isCompleted
                    ? "border-green-500/30 bg-green-500/5"
                    : isExpanded
                    ? "border-[#D2A63C]/40"
                    : "border-gray-800"
                }`}
              >
                {/* Step header */}
                <button
                  onClick={() => toggleStep(step.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  {/* Step number / check */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${
                    isCompleted
                      ? "bg-green-500/20 text-green-400"
                      : isExpanded
                      ? "bg-[#D2A63C]/20 text-[#D2A63C]"
                      : "bg-gray-800 text-gray-400"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                  </div>

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isCompleted ? "bg-green-500/10" : "bg-gray-800"
                  }`}>
                    <Icon className={`w-5 h-5 ${isCompleted ? "text-green-400" : isExpanded ? "text-[#D2A63C]" : "text-gray-400"}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isCompleted ? "text-green-300" : "text-white"}`}>
                      {step.title}
                    </p>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{step.description}</p>
                    )}
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>

                    {/* Detail box */}
                    <div className="flex gap-2 bg-gray-800/60 rounded-lg p-3">
                      <Info className="w-4 h-4 text-[#D2A63C] flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-400 leading-relaxed">{step.detail}</p>
                    </div>

                    {/* Step 1 actions — open link */}
                    {step.action === "open_link" && (
                      <div className="space-y-2">
                        <button
                          onClick={handleOpenLink}
                          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir {broker.name} com o nosso link
                        </button>
                        <button
                          onClick={handleCopyLink}
                          className="w-full py-2.5 px-4 rounded-xl bg-gray-800 text-gray-300 font-medium text-sm flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors"
                        >
                          {copiedLink ? (
                            <><Check className="w-4 h-4 text-green-400" /> Copiado!</>
                          ) : (
                            <><Copy className="w-4 h-4" /> Copiar link</>
                          )}
                        </button>
                        {linkOpened && (
                          <button
                            onClick={() => { markStepDone(1); setExpandedStep(2) }}
                            className="w-full py-2.5 px-4 rounded-xl border border-green-500/30 text-green-400 text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Já abri o link — marcar como feito
                          </button>
                        )}
                      </div>
                    )}

                    {/* Step 6 — save UID */}
                    {step.action === "save_uid" && (
                      <div className="space-y-3">
                        {savedUid && (
                          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                            <p className="text-sm text-green-300">
                              UID guardado: <span className="font-mono font-bold">{savedUid}</span>
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-400 mb-1.5 block">Número de conta {broker.name} (UID)</label>
                          <input
                            type="text"
                            value={uid}
                            onChange={e => setUid(e.target.value)}
                            placeholder="Ex: 12345678"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50 font-mono"
                          />
                        </div>
                        <button
                          onClick={handleSaveUid}
                          disabled={savingUid}
                          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                        >
                          {savingUid ? "A guardar..." : (
                            <><Check className="w-4 h-4" /> Guardar UID</>
                          )}
                        </button>
                        <p className="text-xs text-gray-500 text-center">
                          Podes actualizar este número a qualquer momento nas Definições.
                        </p>
                      </div>
                    )}

                    {/* Generic done button for steps without actions */}
                    {step.action === null && (
                      <button
                        onClick={() => {
                          markStepDone(step.id)
                          const next = STEPS.find(s => s.id === step.id + 1)
                          if (next) setExpandedStep(next.id)
                          else setExpandedStep(null)
                        }}
                        className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                          isCompleted
                            ? "bg-gray-800 text-gray-400"
                            : "bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] hover:bg-[#D2A63C]/20"
                        }`}
                      >
                        {isCompleted ? (
                          <><CheckCircle2 className="w-4 h-4 text-green-400" /> Concluído</>
                        ) : (
                          <><Circle className="w-4 h-4" /> Marcar como feito</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Warning disclaimer */}
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-300 mb-1">Aviso de risco</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              O trading de CFDs e Forex envolve um risco elevado de perda de capital. Investe apenas o que podes perder.
              A MTM não é responsável pelas operações que realizas na tua conta de corretora.
            </p>
          </div>
        </div>

        {/* Support link */}
        <div className="text-center pb-2">
          <p className="text-xs text-gray-500">
            Tens dúvidas?{" "}
            <a
              href="mailto:suporte@morethanmoney.pt"
              className="text-[#D2A63C] underline"
            >
              Contacta o suporte MTM
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
