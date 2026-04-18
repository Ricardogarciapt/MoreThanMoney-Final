"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Play, Download, Users, Brain, TrendingUp, Target, CheckCircle, ExternalLink, Lock } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"
import ProtectedPage from "@/components/protected-page"
import OnboardingBusinessAIAgent from "@/components/onboarding-business-ai-agent"
import MentorImmersivePanel from "@/components/mentor/mentor-immersive-panel"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"

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

  // Função para adicionar XP diretamente
  const addXP = async (stepNumber: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('⚠️ [FAST_START] Sem sessão para adicionar XP')
        return null
      }

      console.log(`🎮 [FAST_START] Adicionando XP para passo ${stepNumber}...`)
      console.log(`👤 [FAST_START] User ID: ${session.user.id}`)

      // Buscar configuração de XP
      const { data: xpConfig, error: xpConfigError } = await supabase
        .from('xp_config')
        .select('xp_amount')
        .eq('action_type', 'onboarding_step_completed')
        .single()

      if (xpConfigError) {
        console.error('❌ [FAST_START] Erro ao buscar config XP:', xpConfigError)
        console.log('ℹ️ [FAST_START] Usando valor padrão: 50 XP')
      }

      const xpAmount = xpConfig?.xp_amount || 50
      console.log(`💰 [FAST_START] XP a atribuir: ${xpAmount}`)

      // Buscar XP atual do usuário
      const { data: existingXP, error: existingXPError } = await supabase
        .from('user_xp')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      console.log(`📊 [FAST_START] XP existente:`, existingXP)

      if (existingXPError && existingXPError.code !== 'PGRST116') {
        console.error('❌ [FAST_START] Erro ao buscar XP existente:', existingXPError)
        toast({
          title: "Erro",
          description: `Erro ao buscar XP: ${existingXPError.message}`,
          variant: "destructive"
        })
        return null
      }

      let newTotalXP = 0
      let newLevel = 1

      if (existingXP) {
        // Se existe, somar o XP (mesmo que seja 0, somar normalmente)
        newTotalXP = (existingXP.total_xp || 0) + xpAmount
        newLevel = Math.floor(newTotalXP / 1000) + 1

        console.log(`📊 [FAST_START] XP atual: ${existingXP.total_xp || 0}, Novo total: ${newTotalXP}, Novo nível: ${newLevel}`)

        const { data: updatedXP, error: updateError } = await supabase
          .from('user_xp')
          .update({
            total_xp: newTotalXP,
            current_level: newLevel,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', session.user.id)
          .select()
          .single()

        if (updateError) {
          console.error('❌ [FAST_START] Erro ao atualizar XP:', updateError)
          toast({
            title: "Erro",
            description: `Erro ao atualizar XP: ${updateError.message}`,
            variant: "destructive"
          })
          throw updateError
        }

        console.log(`✅ [FAST_START] XP atualizado:`, updatedXP)
      } else {
        // Criar novo registro
        newTotalXP = xpAmount
        newLevel = 1

        console.log(`📊 [FAST_START] Criando novo registro de XP: ${newTotalXP}, Nível: ${newLevel}`)

        const { data: newXP, error: insertError } = await supabase
          .from('user_xp')
          .insert({
            user_id: session.user.id,
            total_xp: newTotalXP,
            current_level: newLevel
          })
          .select()
          .single()

        if (insertError) {
          console.error('❌ [FAST_START] Erro ao inserir XP:', insertError)
          toast({
            title: "Erro",
            description: `Erro ao criar XP: ${insertError.message}`,
            variant: "destructive"
          })
          throw insertError
        }

        console.log(`✅ [FAST_START] XP criado:`, newXP)
      }

      // Adicionar log de XP
      const { error: logError } = await supabase
        .from('xp_log')
        .insert({
          user_id: session.user.id,
          xp_amount: xpAmount,
          action_type: 'onboarding_step_completed',
          action_description: `Passo ${stepNumber} do Fast Start concluído`
        })

      if (logError) {
        console.error('⚠️ [FAST_START] Erro ao inserir log de XP (não crítico):', logError)
      } else {
        console.log(`📝 [FAST_START] Log de XP criado`)
      }

      console.log(`✅ [FAST_START] XP adicionado com sucesso: +${xpAmount} XP (Total: ${newTotalXP}, Nível: ${newLevel})`)

      // Forçar atualização do user dropdown através de um evento customizado
      window.dispatchEvent(new CustomEvent('xpUpdated', { detail: { total_xp: newTotalXP, level: newLevel } }))

      return { xp_gained: xpAmount, total_xp: newTotalXP, level: newLevel }
    } catch (error: any) {
      console.error('❌ [FAST_START] Erro ao adicionar XP:', error)
      toast({
        title: "Erro ao adicionar XP",
        description: error.message || "Não foi possível adicionar XP. Verifica o console para mais detalhes.",
        variant: "destructive"
      })
      return null
    }
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

      console.log('🔄 [FAST_START] Completando passo 1 automaticamente...')

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('fast_start_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      let newProgress
      
      if (existing) {
        if (existing.step_1_completed) {
          console.log('✅ Passo 1 já estava concluído')
          return
        }
        
        // Atualizar
        const updatedProgress = {
          ...existing,
          step_1_completed: true,
          updated_at: new Date().toISOString()
        }
        const calculatedProgress = calculateProgress(updatedProgress)
        
        const { data, error } = await supabase
          .from('fast_start_progress')
          .update({
            step_1_completed: true,
            progress_percent: calculatedProgress,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', session.user.id)
          .select()
          .single()

        if (error) throw error
        newProgress = data
      } else {
        // Criar novo
        const { data, error } = await supabase
          .from('fast_start_progress')
          .insert({
            user_id: session.user.id,
            step_1_completed: true,
            progress_percent: Math.round(100 / 6) // ~16.67%
          })
          .select()
          .single()

        if (error) throw error
        newProgress = data
      }

      // Atualizar estado
      setProgress({
        step_1_completed: newProgress.step_1_completed || false,
        step_2_completed: newProgress.step_2_completed || false,
        step_3_completed: newProgress.step_3_completed || false,
        step_4_completed: newProgress.step_4_completed || false,
        step_5_completed: newProgress.step_5_completed || false,
        step_6_completed: newProgress.step_6_completed || false,
        progress_percent: newProgress.progress_percent || 0
      })

      toast({
        title: "🎉 Bem-vindo!",
        description: "Passo 1 completado automaticamente! Continua com os próximos passos.",
      })

      // Adicionar XP
      const xpResult = await addXP(1)
      if (xpResult) {
        console.log(`✅ XP atribuído automaticamente: ${xpResult.xp_gained} XP`)
      }
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

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('fast_start_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      const updateField = `step_${stepNumber}_completed`
      let wasAlreadyCompleted = false

      if (existing) {
        wasAlreadyCompleted = existing[updateField] === true

        if (wasAlreadyCompleted) {
          console.log('ℹ️ [FAST_START] Passo já estava concluído')
          toast({
            title: "ℹ️ Info",
            description: `Passo ${stepNumber} já estava concluído`,
          })
          setMarkingComplete(0)
          return
        }
      }

      // Preparar dados de atualização
      const updatedData: any = {
        [updateField]: true,
        updated_at: new Date().toISOString()
      }

      let updatedProgress
      
      if (existing) {
        // Atualizar
        const tempProgress = {
          ...existing,
          [updateField]: true
        }
        const calculatedProgress = calculateProgress(tempProgress)
        updatedData.progress_percent = calculatedProgress

        const { data, error } = await supabase
          .from('fast_start_progress')
          .update(updatedData)
          .eq('user_id', session.user.id)
          .select()
          .single()

        if (error) throw error
        updatedProgress = data
      } else {
        // Criar novo
        const calculatedProgress = Math.round((stepNumber * 100) / 6)
        const { data, error } = await supabase
          .from('fast_start_progress')
          .insert({
            user_id: session.user.id,
            [updateField]: true,
            progress_percent: calculatedProgress
          })
          .select()
          .single()

        if (error) throw error
        updatedProgress = data
      }

      // Atualizar estado
      const newProgress = {
        step_1_completed: updatedProgress.step_1_completed || false,
        step_2_completed: updatedProgress.step_2_completed || false,
        step_3_completed: updatedProgress.step_3_completed || false,
        step_4_completed: updatedProgress.step_4_completed || false,
        step_5_completed: updatedProgress.step_5_completed || false,
        step_6_completed: updatedProgress.step_6_completed || false,
        progress_percent: updatedProgress.progress_percent || 0
      }

      setProgress(newProgress)

      // Adicionar XP apenas se não estava concluído antes
      let xpResult = null
      if (!wasAlreadyCompleted) {
        xpResult = await addXP(stepNumber)
      }

      // Mostrar mensagem de sucesso
      let toastDescription = `Passo ${stepNumber} marcado como completo. ${newProgress.progress_percent}% do Fast Start concluído!`
      
      if (xpResult && xpResult.xp_gained > 0) {
        toastDescription += ` 🎉 +${xpResult.xp_gained} XP!`
        if (xpResult.level) {
          toastDescription += ` Nível ${xpResult.level}`
        }
        console.log(`✅ [FAST_START] XP adicionado: ${xpResult.xp_gained}, Total: ${xpResult.total_xp}, Nível: ${xpResult.level}`)
      }
      
      toast({
        title: "✅ Passo Concluído!",
        description: toastDescription
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
              <span className="text-mtm-primary">Início Rápido</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Começa a tua jornada para o sucesso financeiro com a MoreThanMoney em 6 passos simples
            </p>
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
                      <CardTitle className="text-mtm-primary">Iniciar com a Visão Certa</CardTitle>
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
                  Percebe o teu porquê e como vais usar o sistema para prosperar. A tua mentalidade é a chave.
                </p>
                <div className="mb-6">
                  <h4 className="text-white font-semibold mb-3">O sistema que vais usar</h4>
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
                      <CardTitle className={isStepLocked(2) ? 'text-gray-500' : 'text-mtm-primary'}>Instalar e Entrar na Comunidade</CardTitle>
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
                  Instala o WhatsApp e entra já no nosso grupo de apoio direto.
                </p>
                {!isStepLocked(2) && (
                  <Link href="https://chat.whatsapp.com/CBBUkRWAJnfJgFseTaoSFT?mode=wwt" target="_blank">
                    <Button className="btn-primary mb-4">
                      <Users className="w-4 h-4 mr-2" />
                      Entrar na Comunidade
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
                      <CardTitle className={isStepLocked(3) ? 'text-gray-500' : 'text-mtm-primary'}>Copiar e Colar</CardTitle>
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
                  Aprende a copiar e colar para começares a ter lucros reais ou em demo desde o início.
                </p>
                {!isStepLocked(3) && (
                  <div className="grid md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-3">
                      <h4 className="text-white font-semibold">Baixar Iqonic</h4>
                      <div className="space-y-2">
                        <Button 
                          onClick={() => window.open('https://play.google.com/store/apps/details?id=com.enigmalabs.iqsync', '_blank')}
                          className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-white"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Iqonic (Android)
                        </Button>
                        <Button 
                          onClick={() => window.open('https://apps.apple.com/us/app/iq-sync/id6753764389', '_blank')}
                          className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-white"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Iqonic (iOS)
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-white font-semibold">Baixar MT5</h4>
                      <div className="space-y-2">
                        <Button className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-white">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar MT5 (Android)
                        </Button>
                        <Button className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-white">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar MT5 (iOS)
                        </Button>
                      </div>
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
                      <CardTitle className={isStepLocked(4) ? 'text-gray-500' : 'text-mtm-primary'}>Modo Mentor / 3-Way Calls</CardTitle>
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
                  Participa na chamada semanal, pratica com um mentor e usa o formato 3-Way para acelerar confiança e resultados.
                </p>
                {!isStepLocked(4) && (
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h4 className="text-white font-semibold mb-3">Chamada Semanal (Execução)</h4>
                      <YouTubeEmbed 
                        videoId="w8y_wzJGTcA"
                        title="Chamada Semanal MTM"
                        className="border border-mtm-primary/30 mb-4"
                      />
                      <Button className="w-full btn-primary">
                        <Play className="w-4 h-4 mr-2" />
                        Ver Vídeo
                      </Button>
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-3">Fast Start Educativo (Base)</h4>
                      
                      <div className="mb-6 p-4 bg-amber-500/10 border border-mtm-primary/30 rounded-lg">
                        <h5 className="text-mtm-primary font-semibold mb-2">Introdução aos mercados financeiros</h5>
                        <div className="text-gray-300 text-sm mb-4">
                          <p className="font-semibold mb-2">🎯 FAST START FOREX - Primeiros Passos | BootCamp de Iniciação</p>
                          <p className="mb-3">
                            Esta série de vídeos foi criada para te dar um arranque rápido e sólido no mundo do FOREX e mercados financeiros. 
                            É ideal para quem está a começar do zero ou deseja estruturar melhor os seus conhecimentos iniciais antes de entrar 
                            num BootCamp mais avançado.
                          </p>
                        </div>
                      </div>

                      <YouTubeEmbed 
                        videoId="RQ0CI0jWAnM"
                        playlist="PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu"
                        title="Fast Start Educativo - Playlist Completa"
                        className="border border-mtm-primary/30 mb-4"
                      />
                      <Button className="w-full btn-primary">
                        <Play className="w-4 h-4 mr-2" />
                        Ver Playlist Completa
                      </Button>
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
                      <CardTitle className={isStepLocked(5) ? 'text-gray-500' : 'text-mtm-primary'}>Tracking Leads & Conversões</CardTitle>
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
                      Parabéns! Fast Start Completo! 🎉
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  Organiza os teus leads, define follow-up e mede conversões. Crescimento previsível vem de processo, não de sorte.
                </p>
                {!isStepLocked(5) && (
                  <div className="mb-6">
                    <div className="mb-4 rounded-lg border border-mtm-primary/20 bg-mtm-primary/5 p-4 text-sm text-gray-300">
                      <p>Checklist rápido:</p>
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        <li>10 novos leads registados</li>
                        <li>3 follow-ups concluídos</li>
                        <li>1 conversa de qualificação finalizada</li>
                      </ul>
                    </div>
                    <Link href="https://docs.google.com/presentation/d/1dgfNVp4J4ok6ZrkLk3q54rux_0rSCVfanRYITXC1_pI/edit?slide=id.g3401419a59b_0_233#slide=id.g3401419a59b_0_233" target="_blank">
                      <Button className="btn-primary mb-4">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Percebe aqui como o podes fazer
                      </Button>
                    </Link>
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
                      <CardTitle className={isStepLocked(6) ? 'text-gray-500' : 'text-mtm-primary'}>Mindset Milionário</CardTitle>
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
                      Passo 6 Concluído!
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-300 mb-6">
                  Desenvolve a mentalidade de sucesso e literacia financeira necessárias para alcançares os teus objetivos. 
                  Este conteúdo vai-te ajudar a transformar a tua forma de pensar sobre dinheiro e negócios.
                </p>
                {!isStepLocked(6) && (
                  <div className="grid md:grid-cols-2 gap-8 mb-8">
                    <div>
                      <h4 className="text-white font-semibold mb-3 flex items-center">
                        <Brain className="w-5 h-5 mr-2 text-mtm-primary" />
                        🧠 Mindset Milionário
                      </h4>
                      <YouTubeEmbed 
                        videoId="videoseries"
                        playlist="PLEk9jgCKa4hpix5-_CqEx0eOIrWLOvZUr"
                        title="Mindset Milionário - Playlist Completa"
                        className="border border-mtm-primary/30 mb-4"
                      />
                      <Link href="https://youtube.com/playlist?list=PLEk9jgCKa4hpix5-_CqEx0eOIrWLOvZUr&si=6W3LzuBDPte7W22b" target="_blank">
                        <Button className="w-full btn-primary">
                          Ver Playlist Completa
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                      <p className="text-sm text-gray-400 mt-2">Desenvolve a mentalidade empreendedora e literacia financeira</p>
                    </div>

                    <div>
                      <h4 className="text-white font-semibold mb-3 flex items-center">
                        <Play className="w-5 h-5 mr-2 text-mtm-primary" />
                        🎥 Apresentação Completa
                      </h4>
                      <YouTubeEmbed 
                        videoId="HemX7AlLhqg"
                        title="Apresentação Completa MoreThanMoney"
                        className="border border-mtm-primary/30 mb-4"
                      />
                      <Link href="https://www.youtube.com/watch?v=HemX7AlLhqg&t=3s" target="_blank">
                        <Button className="w-full btn-primary">
                          Ver Apresentação Completa
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                      <p className="text-sm text-gray-400 mt-2">Vídeo completo com todos os detalhes do negócio MoreThanMoney</p>
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
