"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ProtectedPage from "@/components/protected-page"
import { 
  Bot, 
  Server, 
  ExternalLink, 
  Shield, 
  Zap, 
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"

export default function AITrader() {
  const [mounted, setMounted] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  
  // Configuração fixa do servidor n8n Contabo
  const n8nUrl = "https://vmi2877758.contaboserver.net"
  const serverInfo = {
    displayName: "Servidor N8N",
    host: "19383",
    region: "EU",
    ip: "173.249.23.54",
    ipv6: "2a02:c207:2287:7758::1/64",
    os: "Linux",
    diskSpace: "100 GB NVMe",
    plan: "Cloud VPS 20 NVMe",
    monthlyPrice: "€8.61"
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      checkAccess()
    }
  }, [mounted])

  const checkAccess = async () => {
    try {
      console.log('🔍 [AI MTM] Verificando acesso...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        console.warn('⚠️ [AI MTM] Sem sessão ativa')
        setHasAccess(false)
        setLoading(false)
        return
      }

      console.log('👤 [AI MTM] Usuário logado:', session.user.email)

      // Tentar buscar perfil
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_type, member_category, email')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.warn('⚠️ [AI MTM] Erro ao buscar perfil:', profileError)
        console.log('🔄 [AI MTM] Tentando API fallback...')
        
        // Fallback: tentar API
        try {
          const apiResponse = await fetch(`/api/profile/get?userId=${session.user.id}`)
          if (apiResponse.ok) {
            const apiData = await apiResponse.json()
            if (apiData.profile) {
              console.log('✅ [AI MTM] Perfil via API:', apiData.profile.email)
              
              const access = apiData.profile.user_type === 'admin' || 
                           apiData.profile.member_category === 'vip' ||
                           apiData.profile.email === 'ricardogarciapt@proton.me'
              
              setHasAccess(access)
              setLoading(false)
              console.log('✅ [AI MTM] Acesso:', access ? 'CONCEDIDO' : 'NEGADO')
              return
            }
          }
        } catch (apiError) {
          console.error('❌ [AI MTM] API fallback falhou:', apiError)
        }
        
        // Fallback final: verificar email
        if (session.user.email === 'ricardogarciapt@proton.me' || 
            session.user.email === 'ricardo.subtilgarcia@gmail.com') {
          console.log('✅ [AI MTM] Acesso concedido via email (fallback)')
          setHasAccess(true)
          setLoading(false)
          return
        }
        
        setHasAccess(false)
        setLoading(false)
        return
      }

      console.log('📊 [AI MTM] Perfil encontrado:', {
        email: profile.email,
        user_type: profile.user_type,
        member_category: profile.member_category
      })

      // Acesso para Admin, VIP ou email específico
      const access = profile?.user_type === 'admin' || 
                     profile?.member_category === 'vip' ||
                     profile?.email === 'ricardogarciapt@proton.me' ||
                     profile?.email === 'ricardo.subtilgarcia@gmail.com'
      
      setHasAccess(access)
      setLoading(false)

      if (access) {
        console.log('✅ [AI MTM] Acesso concedido:', profile?.email, '| Tipo:', profile?.user_type)
      } else {
        console.warn('⚠️ [AI MTM] Acesso negado')
        console.warn('   Email:', profile?.email)
        console.warn('   Tipo:', profile?.user_type)
        console.warn('   Categoria:', profile?.member_category)
      }
    } catch (error) {
      console.error('❌ [AI MTM] Erro ao verificar acesso:', error)
      setHasAccess(false)
      setLoading(false)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <ProtectedPage redirectPath="/login?redirect=/aimtm" loadingMessage="A verificar acesso AI MTM...">
        <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex items-center justify-center p-4">
          <Card className="max-w-md bg-gray-900 border-red-500/30">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Acesso Restrito
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-gray-300">
                  Esta área está disponível apenas para membros <strong>VIP</strong> e <strong>Admin</strong>.
                  <br /><br />
                  Para ter acesso ao AI MTM Trader, contacta o suporte.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/aimtm" loadingMessage="A carregar AI MTM Trader...">
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#795300] to-[#BB8525] p-6 shadow-2xl border-b-4 border-[#D2A63C]">
          <div className="container mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-black/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white">AI MTM Trader</h1>
                  <p className="text-black/70 font-medium">Automação n8n - Servidor Contabo VPS</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Badge className="bg-green-500/20 text-green-300 border-green-500/50 px-4 py-2">
                  <Server className="w-4 h-4 mr-2" />
                  VPS Ativo
                </Badge>
                
                <Button
                  onClick={() => window.open(n8nUrl, '_blank')}
                  className="bg-black/20 hover:bg-black/30 text-white border-2 border-white/30"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Nova Janela
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto p-6">

          {/* Server Info Card */}
          <Card className="mb-6 bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/10 border-[#D2A63C]/30">
            <CardHeader>
              <CardTitle className="text-[#D2A63C] flex items-center gap-2">
                <Server className="w-6 h-6" />
                Informações do Servidor VPS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Nome</p>
                  <p className="text-white font-semibold">{serverInfo.displayName}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Host ID</p>
                  <p className="text-white font-mono">{serverInfo.host}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Região</p>
                  <p className="text-white font-semibold">{serverInfo.region}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">IP Address</p>
                  <p className="text-white font-mono">{serverInfo.ip}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Sistema</p>
                  <p className="text-white font-semibold">{serverInfo.os}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Disco NVMe</p>
                  <p className="text-white font-semibold">{serverInfo.diskSpace}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-400 text-xs mb-1">Plano</p>
                  <p className="text-white font-semibold">{serverInfo.plan}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">URL n8n</p>
                  <a 
                    href={n8nUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:text-[#BB8525] font-mono text-xs flex items-center gap-1"
                  >
                    {n8nUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Automação</h3>
                    <p className="text-xs text-gray-400">Workflows n8n</p>
                  </div>
                </div>
                <p className="text-sm text-gray-300">
                  Sistema de automação avançado para trading e análise de mercado
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Bot className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">AI Trading</h3>
                    <p className="text-xs text-gray-400">Inteligência Artificial</p>
                  </div>
                </div>
                <p className="text-sm text-gray-300">
                  Algoritmos de IA para análise preditiva e otimização de estratégias
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Server className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">VPS Contabo</h3>
                    <p className="text-xs text-gray-400">100GB NVMe SSD</p>
                  </div>
                </div>
                <p className="text-sm text-gray-300">
                  Servidor VPS de alta performance na Contabo para execução 24/7
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main n8n Interface */}
          <Card className="bg-gray-900 border-[#D2A63C]/30 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#795300]/20 to-[#BB8525]/20 border-b border-[#D2A63C]/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Bot className="w-6 h-6 text-[#D2A63C]" />
                  n8n Automation Platform
                </CardTitle>
                <Button
                  onClick={() => setIframeLoaded(false)}
                  size="sm"
                  variant="outline"
                  className="border-[#D2A63C]/30 text-[#D2A63C] hover:bg-[#D2A63C]/10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recarregar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              {/* Loading Overlay */}
              {!iframeLoaded && (
                <div className="absolute inset-0 bg-gray-900/95 flex items-center justify-center z-10">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
                    <p className="text-gray-300 font-medium">A carregar ambiente n8n...</p>
                    <p className="text-sm text-gray-500 mt-2">Conectando ao VPS Contabo (EU)</p>
                    <p className="text-xs text-gray-600 mt-4">IP: {serverInfo.ip}</p>
                  </div>
                </div>
              )}

              {/* n8n iFrame - Acesso direto ao ambiente de trabalho */}
              <iframe
                src={n8nUrl}
                className="w-full border-0"
                style={{ height: 'calc(100vh - 250px)', minHeight: '700px' }}
                onLoad={() => setIframeLoaded(true)}
                title="n8n Automation Platform - AI MTM Trader"
                allow="clipboard-read; clipboard-write; fullscreen"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              />
            </CardContent>
          </Card>

          {/* Quick Access Info */}
          <div className="mt-6">
            <Card className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-amber-500/20">
              <CardContent className="p-6">
                <h3 className="text-amber-400 font-bold text-lg mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Acesso ao Ambiente n8n
                </h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <p className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Use o ambiente n8n acima para criar e gerir workflows de automação</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Servidor VPS Contabo EU com 100GB NVMe para máxima performance</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Acesso direto sem necessidade de configuração adicional</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Credenciais n8n</strong>: Usar login configurado no servidor VPS</span>
                  </p>
                </div>

                <div className="mt-4 p-4 bg-black/30 rounded-lg border border-amber-500/20">
                  <p className="text-xs text-gray-400 mb-2">Acesso direto ao servidor:</p>
                  <a 
                    href={n8nUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:text-[#BB8525] font-mono text-sm flex items-center gap-2"
                  >
                    {n8nUrl}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedPage>
  )
}

