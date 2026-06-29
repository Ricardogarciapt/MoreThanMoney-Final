"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Download, Users, Brain, TrendingUp, Target, CheckCircle, ExternalLink, Lock } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"
import ProtectedPage from "@/components/protected-page"
import OnboardingBusinessAIAgent from "@/components/onboarding-business-ai-agent"
import MentorImmersivePanel from "@/components/mentor/mentor-immersive-panel"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import {
  CALENDLY_ONBOARDING_URL,
  getFastStartJourneySteps,
  SKOOL_FAST_START_URL,
  APP_ACCOUNT_OPEN_PATH,
} from "@/lib/fast-start-journey"
import { notifyXpFromResponse } from "@/lib/xp-client"

// Links de instalação das apps nativas
// Android: APK direto alojado no site (qualquer user instala, sem ser tester / sem Play)
const ANDROID_APP_URL = "/downloads/MoreThanMoney.apk"
// iOS: App Store (canónico). Se ainda não aprovado, usar link público do TestFlight.
const IOS_APP_URL = "https://apps.apple.com/app/id6778558643"

interface Progress {
  step_1_completed: boolean
  step_2_completed: boolean
  step_3_completed: boolean
  step_4_completed: boolean
  step_5_completed: boolean
  step_6_completed: boolean
  progress_percent: number
}

export default function FastStartPage() {
  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState<string>("")
  const [progress, setProgress] = useState<Progress>({
    step_1_completed: false,
    step_2_completed: false,
    step_3_completed: false,
    step_4_completed: false,
    step_5_completed: false,
    step_6_completed: false,
    progress_percent: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [markingComplete, setMarkingComplete] = useState(0)
  const { toast } = useToast()

  // Aguardar montagem e verificar sessão antes de carregar
  useEffect(() => {
    const initialize = async () => {
      // Aguardar para que ProtectedPage termine a verificação e cookies sejam sincronizados
      // Tentar algumas vezes até encontrar sessão
      let attempts = 0
      const maxAttempts = 5
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 300))
        
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          console.log('✅ [FAST_START] Sessão encontrada após', attempts + 1, 'tentativa(s)')
          setUserId(session.user.id)
          setMounted(true)
          loadProgress()
          return
        }
        
        attempts++
        console.log(`🔄 [FAST_START] Tentativa ${attempts}/${maxAttempts} - aguardando sessão...`)
      }
      
      // Se não encontrou sessão após tentativas, ProtectedPage vai redirecionar
      console.warn('⚠️ [FAST_START] Sessão não encontrada após', maxAttempts, 'tentativas')
      setIsLoading(false)
    }
    
    initialize()
  }, [])

  // Função para calcular progresso
  const calculateProgress = (steps: Progress): number => {
    let completed = 0
    if (steps.step_1_completed) completed++
    if (steps.step_2_completed) completed++
    if (steps.step_3_completed) completed++
    if (steps.step_4_completed) completed++
    if (steps.step_5_completed) completed++
    if (steps.step_6_completed) completed++
    return Math.round((completed * 100) / 6)
  }

  const completeStepViaApi = async (stepNumber: number) => {
    const res = await fetch('/api/fast-start/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ step_number: stepNumber }),
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || data.message || 'Erro ao completar passo')
    }
    setProgress(data.progress)
    if (data.xp) void notifyXpFromResponse(data.xp)
    return data
  }

  const loadProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.log('⚠️ [FAST_START] Sem sessão, não carregando progresso')
        setIsLoading(false)
        return
      }

      console.log(`🔵 [FAST_START] Carregando progresso diretamente do Supabase para: ${session.user.email}`)
      
      // Buscar progresso diretamente da tabela
      const { data: progressData, error } = await supabase
        .from('fast_start_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [FAST_START] Erro ao buscar progresso:', error)
        setIsLoading(false)
        return
      }

      if (progressData) {
        const currentProgress = {
          step_1_completed: progressData.step_1_completed || false,
          step_2_completed: progressData.step_2_completed || false,
          step_3_completed: progressData.step_3_completed || false,
          step_4_completed: progressData.step_4_completed || false,
          step_5_completed: progressData.step_5_completed || false,
          step_6_completed: progressData.step_6_completed || false,
          progress_percent: progressData.progress_percent || calculateProgress({
            step_1_completed: progressData.step_1_completed || false,
            step_2_completed: progressData.step_2_completed || false,
            step_3_completed: progressData.step_3_completed || false,
            step_4_completed: progressData.step_4_completed || false,
            step_5_completed: progressData.step_5_completed || false,
            step_6_completed: progressData.step_6_completed || false,
            progress_percent: 0
          })
        }
        
        setProgress(currentProgress)
        console.log('✅ [FAST_START] Progresso carregado:', currentProgress)
        
        // Se passo 1 não está concluído, completar automaticamente
        if (!currentProgress.step_1_completed) {
          console.log('🔄 [FAST_START] Passo 1 não concluído, completando automaticamente...')
          completeStep1Auto()
        }
      } else {
        // Não existe progresso, iniciar vazio
        console.log('📝 [FAST_START] Nenhum progresso encontrado, iniciando novo')
        const emptyProgress = {
          step_1_completed: false,
          step_2_completed: false,
          step_3_completed: false,
          step_4_completed: false,
          step_5_completed: false,
          step_6_completed: false,
          progress_percent: 0
        }
        setProgress(emptyProgress)
        // Completar passo 1 automaticamente
        completeStep1Auto()
      }
      
      setIsLoading(false)
    } catch (error) {
      console.error('❌ [FAST_START] Erro ao carregar progresso:', error)
      setIsLoading(false)
    }
  }


  const completeStep1Auto = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: existing } = await supabase
        .from('fast_start_progress')
        .select('step_1_completed')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (existing?.step_1_completed) return

      const data = await completeStepViaApi(1)
      toast({
        title: "🎉 Bem-vindo!",
        description: data.xp_gained
          ? `Passo 1 completo! +${data.xp_gained} XP`
          : "Passo 1 completado automaticamente! Continua com os próximos passos.",
      })
    } catch (error) {
      console.error('❌ Erro ao completar passo 1 automaticamente:', error)
    }
  }

  const markStepComplete = async (stepNumber: number) => {
    if (markingComplete === stepNumber) {
      console.log('⚠️ [FAST_START] Já está marcando passo', stepNumber)
      return
    }
    
    setMarkingComplete(stepNumber)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast({
          title: 'Erro',
          description: 'Sessão não encontrada. Inicia sessão novamente.',
          variant: 'destructive'
        })
        setMarkingComplete(0)
        return
      }

      console.log('🔄 [FAST_START] Marcando passo', stepNumber, 'como concluído...')

      const data = await completeStepViaApi(stepNumber)

      if (data.message === 'Passo já estava concluído' || data.xp_gained === 0) {
        const alreadyDone = data.message === 'Passo já estava concluído'
        if (alreadyDone) {
          toast({
            title: "ℹ️ Info",
            description: `Passo ${stepNumber} já estava concluído`,
          })
        }
        setMarkingComplete(0)
        if (alreadyDone) return
      }

      let toastDescription = `Passo ${stepNumber} marcado como completo. ${data.progress.progress_percent}% do Fast Start concluído!`
      if (data.xp_gained > 0) {
        toastDescription += ` 🎉 +${data.xp_gained} XP!`
        if (data.level) toastDescription += ` Nível ${data.level}`
      }

      toast({
        title: "✅ Passo Concluído!",
        description: toastDescription,
      })

      setMarkingComplete(0)
    } catch (error: any) {
      console.error('❌ [FAST_START] Erro ao marcar passo:', error)
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao marcar passo como concluído. Tenta novamente.",
        variant: "destructive"
      })
      setMarkingComplete(0)
    }
  }

  const isStepLocked = (stepNumber: number): boolean => {
    if (stepNumber === 1) return false
    if (stepNumber === 2) return !progress.step_1_completed
    if (stepNumber === 3) return !progress.step_2_completed
    if (stepNumber === 4) return !progress.step_3_completed
    if (stepNumber === 5) return !progress.step_4_completed
    if (stepNumber === 6) return !progress.step_5_completed
    return true
  }

  const getStepProgress = (stepNumber: number): number => {
    const steps = [0, 16.67, 33.33, 50, 66.67, 83.33, 100]
    return steps[stepNumber] || 0
  }

  const journeySteps = getFastStartJourneySteps(typeof window !== 'undefined' ? window.location.origin : 'https://www.morethanmoney.pt')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-400">A carregar progresso...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/fast-start" loadingMessage="A verificar acesso ao início rápido...">
      <main className="min-h-screen bg-black text-white relative">
        <ParticleBackground />
        <div className="container mx-auto px-4 py-12 relative z-10">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-mtm-primary">Fast Start</span>
              <span className="text-white"> · MoreThanMoney</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
              {journeySteps[0]?.description ?? 'O teu plano de arranque em 6 passos — do registo ao Skool.'}
            </p>
            <Link
              href="/apresentacao"
              className="inline-flex items-center gap-2 text-mtm-primary hover:underline text-sm font-semibold"
            >
              Ver apresentação MoreThanMoney
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>

          {/* Progress Bar */}
          <div className="mb-12">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-400">Progresso Geral</span>
                <span className="text-sm text-mtm-primary font-semibold">{progress.progress_percent}% Completo</span>
              </div>
              <Progress value={progress.progress_percent} className="h-3 bg-gray-800" />
            </div>
          </div>

          <div className="max-w-4xl mx-auto mb-10 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-mtm-primary mb-3">Diagnóstico e Mentor Automático</h2>
              <p className="text-gray-300">
                Mantém a continuidade do onboarding, executa o plano de 72h e acelera os primeiros resultados.
              </p>
            </div>
            <OnboardingBusinessAIAgent context="fast-start" userKey={userId} />
            <MentorImmersivePanel />
          </div>

          {/* Steps */}
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Step 1 */}
            <Card className={`card-clean hover-lift ${isStepLocked(1) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 ${progress.step_1_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                      {progress.step_1_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">1</span>}
                    </div>
                    <div>
                      <Badge className={`${progress.step_1_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 1 de 6</Badge>
                      <CardTitle className="text-mtm-primary">{journeySteps[0]?.title ?? 'MoreThanMoney'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {progress.step_1_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Passo 1 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[0]?.description}
                </p>
                <div className="mb-6 flex flex-wrap gap-3">
                  <Link href="/apresentacao">
                    <Button className="btn-primary">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Apresentação MoreThanMoney
                    </Button>
                  </Link>
                </div>
                <div className="mb-6">
                  <h4 className="text-white font-semibold mb-3">Visão geral (vídeo)</h4>
                  <YouTubeEmbed 
                    videoId="TJ_1rvK-DgY"
                    title="Sistema MoreThanMoney"
                    className="border border-mtm-primary/30"
                  />
                </div>
                {!progress.step_1_completed && (
                  <Button 
                    onClick={() => markStepComplete(1)}
                    disabled={markingComplete === 1}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 1 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Step 2 */}
            <Card className={`card-clean hover-lift ${isStepLocked(2) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {isStepLocked(2) ? (
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                        <Lock className="text-gray-400 w-6 h-6" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 ${progress.step_2_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                        {progress.step_2_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">2</span>}
                      </div>
                    )}
                    <div>
                      <Badge className={`${isStepLocked(2) ? 'bg-gray-700' : progress.step_2_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 2 de 6</Badge>
                      <CardTitle className={isStepLocked(2) ? 'text-gray-500' : 'text-mtm-primary'}>{journeySteps[1]?.title ?? 'Agendar Onboarding'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isStepLocked(2) ? (
                  <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      Desbloqueia o Passo 1 primeiro
                    </p>
                  </div>
                ) : progress.step_2_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Passo 2 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[1]?.description}
                </p>
                {!isStepLocked(2) && (
                  <Link href={CALENDLY_ONBOARDING_URL} target="_blank">
                    <Button className="btn-primary mb-4">
                      <Users className="w-4 h-4 mr-2" />
                      Agendar Onboarding (Calendly)
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
                {!progress.step_2_completed && !isStepLocked(2) && (
                  <Button 
                    onClick={() => markStepComplete(2)}
                    disabled={markingComplete === 2}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 2 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Step 3 */}
            <Card className={`card-clean hover-lift ${isStepLocked(3) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {isStepLocked(3) ? (
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                        <Lock className="text-gray-400 w-6 h-6" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 ${progress.step_3_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                        {progress.step_3_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">3</span>}
                      </div>
                    )}
                    <div>
                      <Badge className={`${isStepLocked(3) ? 'bg-gray-700' : progress.step_3_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 3 de 6</Badge>
                      <CardTitle className={isStepLocked(3) ? 'text-gray-500' : 'text-mtm-primary'}>{journeySteps[2]?.title ?? 'App MTM'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isStepLocked(3) ? (
                  <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      Desbloqueia o Passo 2 primeiro
                    </p>
                  </div>
                ) : progress.step_3_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Passo 3 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[2]?.description}
                </p>
                {!isStepLocked(3) && (
                  <div className="space-y-4 mb-6">
                    <Link href="/app-mobile">
                      <Button className="w-full btn-primary mb-2">
                        <Download className="w-4 h-4 mr-2" />
                        Abrir App MoreThanMoney (Web)
                      </Button>
                    </Link>

                    {/* Instalar a app nativa no telemóvel */}
                    <div className="rounded-lg border border-mtm-primary/30 bg-black/40 p-4">
                      <p className="font-semibold text-mtm-primary mb-3">📲 Instala a app no teu telemóvel</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <a href={ANDROID_APP_URL} download>
                          <Button className="w-full btn-primary">
                            <Download className="w-4 h-4 mr-2" />
                            Android (instalar APK)
                          </Button>
                        </a>
                        <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer">
                          <Button className="w-full btn-primary">
                            <Download className="w-4 h-4 mr-2" />
                            iPhone (App Store)
                          </Button>
                        </a>
                      </div>
                      <p className="text-xs text-gray-400 mt-3">
                        <strong>Android:</strong> descarrega o APK e toca em <strong>Instalar</strong> (permite "fontes desconhecidas" se pedir).{" "}
                        <strong>iPhone:</strong> pela App Store / TestFlight.
                      </p>
                    </div>

                    <div className="rounded-lg border border-mtm-primary/30 bg-mtm-primary/5 p-4 text-sm text-gray-300">
                      <p className="font-semibold text-mtm-primary mb-2">💬 Apresenta-te no Chat</p>
                      <p>
                        No separador <strong>Chat</strong>, deixa uma mensagem curta: quem és, o teu objetivo
                        e o que queres aprender (trading, copy ou negócio).
                      </p>
                    </div>
                  </div>
                )}
                {!progress.step_3_completed && !isStepLocked(3) && (
                  <Button 
                    onClick={() => markStepComplete(3)}
                    disabled={markingComplete === 3}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 3 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Step 4 */}
            <Card className={`card-clean hover-lift ${isStepLocked(4) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {isStepLocked(4) ? (
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                        <Lock className="text-gray-400 w-6 h-6" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 ${progress.step_4_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                        {progress.step_4_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">4</span>}
                      </div>
                    )}
                    <div>
                      <Badge className={`${isStepLocked(4) ? 'bg-gray-700' : progress.step_4_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 4 de 6</Badge>
                      <CardTitle className={isStepLocked(4) ? 'text-gray-500' : 'text-mtm-primary'}>{journeySteps[3]?.title ?? 'Conta de trading'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isStepLocked(4) ? (
                  <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      Desbloqueia o Passo 3 primeiro
                    </p>
                  </div>
                ) : progress.step_4_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Passo 4 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[3]?.description}
                </p>
                {!isStepLocked(4) && (
                  <div className="space-y-4 mb-6">
                    <Link href={APP_ACCOUNT_OPEN_PATH}>
                      <Button className="w-full btn-primary">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Abrir conta de trading
                      </Button>
                    </Link>
                    <div className="rounded-lg border border-mtm-primary/30 bg-mtm-primary/5 p-4 text-sm text-gray-300">
                      <p>
                        Guia na app: registo VT Markets, KYC, depósito, MT5 e UID MTM.
                        Podes começar em <strong>demo</strong> para ganhar confiança enquanto aprendes.
                      </p>
                    </div>
                  </div>
                )}
                {!progress.step_4_completed && !isStepLocked(4) && (
                  <Button 
                    onClick={() => markStepComplete(4)}
                    disabled={markingComplete === 4}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 4 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Step 5 */}
            <Card className={`card-clean hover-lift ${isStepLocked(5) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {isStepLocked(5) ? (
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                        <Lock className="text-gray-400 w-6 h-6" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 ${progress.step_5_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                        {progress.step_5_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">5</span>}
                      </div>
                    )}
                    <div>
                      <Badge className={`${isStepLocked(5) ? 'bg-gray-700' : progress.step_5_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 5 de 6</Badge>
                      <CardTitle className={isStepLocked(5) ? 'text-gray-500' : 'text-mtm-primary'}>{journeySteps[4]?.title ?? 'MTMcopier'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isStepLocked(5) ? (
                  <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      Desbloqueia o Passo 4 primeiro
                    </p>
                  </div>
                ) : progress.step_5_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Passo 5 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[4]?.description}
                </p>
                {!isStepLocked(5) && (
                  <div className="mb-6">
                    <Link href="/mtmcopy">
                      <Button className="btn-primary mb-4 w-full">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Configurar MTMcopier
                      </Button>
                    </Link>
                    <div className="rounded-lg border border-mtm-primary/20 bg-mtm-primary/5 p-4 text-sm text-gray-300">
                      <p className="font-semibold text-mtm-primary mb-2">Opções disponíveis</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>Estratégia MTM (Premium / Trade Ideas via CopyFactory)</li>
                        <li>Grupos Telegram de sinais</li>
                        <li>Copy trader — escolhe o que se adequa ao teu perfil</li>
                      </ul>
                    </div>
                  </div>
                )}
                {!progress.step_5_completed && !isStepLocked(5) && (
                  <Button 
                    onClick={() => markStepComplete(5)}
                    disabled={markingComplete === 5}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 5 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Step 6: Mindset Milionário */}
            <Card className={`card-clean hover-lift ${isStepLocked(6) ? 'opacity-50' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {isStepLocked(6) ? (
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                        <Lock className="text-gray-400 w-6 h-6" />
                      </div>
                    ) : (
                      <div className={`w-12 h-12 ${progress.step_6_completed ? 'bg-green-600' : 'bg-amber-600'} rounded-full flex items-center justify-center`}>
                        {progress.step_6_completed ? <CheckCircle className="text-black font-bold text-lg" /> : <span className="text-black font-bold text-lg">6</span>}
                      </div>
                    )}
                    <div>
                      <Badge className={`${isStepLocked(6) ? 'bg-gray-700' : progress.step_6_completed ? 'bg-green-600' : 'bg-amber-600'} text-black mb-2`}>Passo 6 de 6</Badge>
                      <CardTitle className={isStepLocked(6) ? 'text-gray-500' : 'text-mtm-primary'}>{journeySteps[5]?.title ?? 'Fast Start Skool'}</CardTitle>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isStepLocked(6) ? (
                  <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold flex items-center">
                      <Lock className="w-5 h-5 mr-2" />
                      Desbloqueia o Passo 5 primeiro
                    </p>
                  </div>
                ) : progress.step_6_completed ? (
                  <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-semibold flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Parabéns! Fast Start Completo! 🎉
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  {journeySteps[5]?.description}
                </p>
                {!isStepLocked(6) && (
                  <div className="space-y-4 mb-8">
                    <Link href={SKOOL_FAST_START_URL} target="_blank">
                      <Button className="w-full btn-primary">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ir para o Skool — Início Rápido Forex
                      </Button>
                    </Link>
                    <div className="rounded-lg border border-mtm-primary/30 bg-mtm-primary/5 p-4 text-sm text-gray-300">
                      <p className="font-semibold text-mtm-primary mb-2">Módulos incluídos</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>Ebook — Investir sem Emoções</li>
                        <li>Introdução aos mercados financeiros</li>
                        <li>Apps a instalar · Scanner GoldKiller</li>
                        <li>Formulário de Avaliação — Fast Start</li>
                      </ul>
                    </div>
                  </div>
                )}
                {!progress.step_6_completed && !isStepLocked(6) && (
                  <Button 
                    onClick={() => markStepComplete(6)}
                    disabled={markingComplete === 6}
                    className="btn-primary w-full"
                  >
                    {markingComplete === 6 ? 'A marcar...' : 'Marcar como Concluído'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Call to Action Final */}
          <div className="max-w-4xl mx-auto mt-16">
            <Card className="card-clean text-center bg-gradient-to-r from-gray-900/50 to-gray-800/50">
              <CardContent className="p-8">
                <h2 className="text-3xl font-bold text-mtm-primary mb-4">
                  É HORA DE MUDAR A TUA VIDA
                </h2>
                <p className="text-gray-300 mb-8 text-lg">
                  A MoreThanMoney combina três elementos essenciais: Aprendizagem, Ganhos e Networking
                </p>
                
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-black" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">📚 Aprendizagem</h3>
                      <p className="text-gray-300">
                        Adquire uma mentalidade empreendedora e aprimora a tua literacia financeira
                      </p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TrendingUp className="w-8 h-8 text-black" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">💰 Ganhos</h3>
                      <p className="text-gray-300">
                        Estratégias e oportunidades para melhorares as tuas próprias finanças
                      </p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-black" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">🤝 Networking</h3>
                      <p className="text-gray-300">
                        Constrói uma rede de empreendedores e investidores sem pré-condições
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-mtm-primary/30 rounded-lg p-6">
                    <h3 className="text-2xl font-bold text-mtm-primary mb-2">
                      🎯 A TUA JORNADA COMEÇA AQUI!
                    </h3>
                    <p className="text-gray-300 text-lg">
                      Lidera uma vida autodeterminada e constrói o teu futuro financeiro com a comunidade MoreThanMoney
                    </p>
                  </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </ProtectedPage>
  )
}
