"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Globe, Users, Clock, Target, Shield, Award, Loader2 } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"
import ProtectedPage from "@/components/protected-page"
import OnboardingBusinessAIAgent from "@/components/onboarding-business-ai-agent"
import MentorImmersivePanel from "@/components/mentor/mentor-immersive-panel"
import { supabase } from "@/lib/supabase"

const testimonials = [
  {
    text: "O onboarding foi incrível! Em apenas uma semana já estava a operar com confiança.",
    author: "João Silva",
    role: "Trader Iniciante",
    avatar: "JS"
  },
  {
    text: "Processo muito profissional e personalizado. Recomendo a todos os iniciantes.",
    author: "Maria Santos", 
    role: "Investidora",
    avatar: "MS"
  },
  {
    text: "Excelente acompanhamento desde o primeiro dia. Equipa muito competente.",
    author: "Pedro Costa",
    role: "Empresário",
    avatar: "PC"
  },
  {
    text: "A metodologia MoreThanMoney transformou completamente a minha abordagem ao trading.",
    author: "Ana Rodrigues",
    role: "Tradder Experiente",
    avatar: "AR"
  },
  {
    text: "Suporte excecional e resultados rápidos. Vale cada minuto investido.",
    author: "Carlos Ferreira",
    role: "Investidor",
    avatar: "CF"
  }
]

export default function OnboardingPage() {
  const [currentTestimonial, setCurrentTestimonial] = useState(0)
  const [userId, setUserId] = useState<string>("")
  const [memberCategory, setMemberCategory] = useState<string | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const [onboardingPlatform, setOnboardingPlatform] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadUserInfo()
  }, [])

  const loadUserInfo = async () => {
    try {
      // Usar cache para velocidade
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserId(session.user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('member_category, user_type, onboarding_platform')
          .eq('id', session.user.id)
          .single()
        
        if (profile) {
          setMemberCategory(profile.member_category || null)
          setUserType(profile.user_type || null)
          setOnboardingPlatform(profile.onboarding_platform || null)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar categoria:', error)
    }
  }

  // Função para determinar se mostra ambos os cards
  const showBothOnboarding = () => {
    return userType === 'admin' || userType === 'vip'
  }

  // Função para determinar qual onboarding mostrar (baseado em onboarding_platform ou member_category)
  const shouldShowVXA = () => {
    if (showBothOnboarding()) return true // Admins e VIPs vêem ambos
    
    // Se tem plataforma forçada, usar isso
    if (onboardingPlatform === 'vxa') return true
    if (onboardingPlatform === 'rfg') return false
    
    // Caso contrário, usar lógica padrão baseada em member_category
    return memberCategory !== 'iq'
  }

  const shouldShowRFG = () => {
    if (showBothOnboarding()) return true // Admins e VIPs vêem ambos
    
    // Se tem plataforma forçada, usar isso
    if (onboardingPlatform === 'rfg') return true
    if (onboardingPlatform === 'vxa') return false
    
    // Caso contrário, usar lógica padrão baseada em member_category
    return memberCategory === 'iq'
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/onboarding" loadingMessage="A verificar acesso ao onboarding...">
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <section className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-mtm-primary">Bem-vindo à</span> MoreThanMoney
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Transforma-te num trader profissional com o nosso processo de onboarding personalizado e acompanhamento especializado
          </p>
          <Link href="https://calendly.com/morethanmoneypt/onboarding-de-novos-membros" target="_blank">
            <Button className="btn-primary text-lg px-8 py-4">
              <Clock className="w-5 h-5 mr-2" />
              Agendar Onboarding
            </Button>
          </Link>
        </div>

        {/* Video Section */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="rounded-2xl overflow-hidden border border-mtm-primary/30">
            <YouTubeEmbed 
              videoId="q-23MppHFDI"
              title="Vídeo de Onboarding"
              autoplay={false}
            />
          </div>
        </div>

        {/* O Nosso Processo */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-4">
            O Nosso Processo
          </h2>
          <p className="text-gray-300 text-center mb-12">
            Um processo estruturado e personalizado para maximizar o teu sucesso
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="card-clean hover-lift">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <Badge className="bg-amber-500/20 text-mtm-primary border-mtm-primary/30">5 min</Badge>
                  </div>
                </div>
                <CardTitle className="text-mtm-primary">Bem-vindo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Este será o Teu Onboarding e será feito por um membro da Equipa a acompanhar-te
                </p>
                <p className="text-gray-400 text-sm">
                  Apresentação da plataforma e dos nossos valores fundamentais
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">10 min</Badge>
                  </div>
                </div>
                <CardTitle className="text-blue-400">Análise do Teu Perfil</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Compreensão das tuas necessidades e objetivos
                </p>
                <p className="text-gray-400 text-sm">
                  Questionário personalizado para definir a melhor estratégia
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">15 min</Badge>
                  </div>
                </div>
                <CardTitle className="text-green-400">Configuração da Conta</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Preparação para começar a operar
                </p>
                <p className="text-gray-400 text-sm">
                  Configuração de segurança e verificação da conta
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">30 min</Badge>
                  </div>
                </div>
                <CardTitle className="text-purple-400">Primeira Sessão de Trading</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Experiência prática com supervisão
                </p>
                <p className="text-gray-400 text-sm">
                  Sessão guiada com um trader experiente
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift md:col-span-2 lg:col-span-1">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">20 min</Badge>
                  </div>
                </div>
                <CardTitle className="text-orange-400">Plano de Desenvolvimento</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Criação do seu roadmap personalizado
                </p>
                <p className="text-gray-400 text-sm">
                  Definição dos próximos passos e objetivos
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Por Que Escolher o Nosso Onboarding */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-4">
            Por Que Escolher o Nosso Onboarding
          </h2>
          <p className="text-gray-300 text-center mb-12">
            Vantagens exclusivas que fazem a diferença na tua jornada
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <Card className="card-clean text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-black" />
                </div>
                <h3 className="text-xl font-semibold text-mtm-primary mb-2">Acompanhamento Personalizado</h3>
                <p className="text-gray-300">Um mentor dedicado para guiar a tua jornada</p>
              </CardContent>
            </Card>

            <Card className="card-clean text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-green-400 mb-2">Acesso Imediato</h3>
                <p className="text-gray-300">Começa a aprender e a operar em menos de 24h</p>
              </CardContent>
            </Card>

            <Card className="card-clean text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-blue-400 mb-2">Suporte 24/7</h3>
                <p className="text-gray-300">Equipa de especialistas sempre disponível</p>
              </CardContent>
            </Card>

            <Card className="card-clean text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-purple-400 mb-2">Certificação</h3>
                <p className="text-gray-300">Certificado oficial ao completar o fast Start de Cada Area</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bloco imersivo de execução (antes dos testemunhos) */}
        <div className="max-w-4xl mx-auto mb-16 space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-mtm-primary mb-3">Diagnóstico e Mentor Automático</h2>
            <p className="text-gray-300">
              Responde ao diagnóstico, recebe plano personalizado e executa o roadmap de 72h.
            </p>
          </div>
          <OnboardingBusinessAIAgent context="onboarding" userKey={userId} />
          <MentorImmersivePanel />
        </div>

        {/* Testimonials */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-4">
            O Que Dizem os Nossos Membros
          </h2>
          <p className="text-gray-300 text-center mb-12">
            Experiências reais de quem completou o nosso processo de onboarding
          </p>
          
          <div className="max-w-4xl mx-auto">
            <Card className="card-clean">
              <CardContent className="p-8 text-center">
                <div className="mb-6">
                  <div className="w-20 h-20 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-black">
                      {testimonials[currentTestimonial].avatar}
                    </span>
                  </div>
                  <blockquote className="text-xl text-gray-300 italic mb-6">
                    "{testimonials[currentTestimonial].text}"
                  </blockquote>
                  <div>
                    <p className="text-lg font-semibold text-mtm-primary">
                      {testimonials[currentTestimonial].author}
                    </p>
                    <p className="text-gray-400">
                      {testimonials[currentTestimonial].role}
                    </p>
                  </div>
                </div>
                
                {/* Testimonial Indicators */}
                <div className="flex justify-center gap-2">
                  {testimonials.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentTestimonial(index)}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        index === currentTestimonial 
                          ? 'bg-amber-500' 
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Onboarding Internacional */}
        <div className="max-w-4xl mx-auto space-y-6">
          {/* VXA Onboarding - Mostrar baseado em lógica melhorada */}
          {shouldShowVXA() && (
            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="text-mtm-primary flex items-center">
                  <Globe className="w-6 h-6 mr-2" />
                  Onboarding Internacional - Vision X Ambition
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-6">
                  Para membros da equipa internacional, aceda à plataforma Vision X Ambition para um onboarding completo e acesso às ferramentas globais.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="https://www.visionxambition.com" target="_blank">
                    <Button className="w-full sm:w-auto bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Aceder à Equipa Internacional
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Vision X Ambition</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* RFG Onboarding - Mostrar baseado em lógica melhorada */}
          {shouldShowRFG() && (
            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center">
                  <Globe className="w-6 h-6 mr-2" />
                  Onboarding Internacional - RFG
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-6">
                  Para membros da equipa internacional RFG, aceda à plataforma Revolution to Free Generations para um onboarding completo e acesso às ferramentas globais.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="https://www.rfg.life" target="_blank">
                    <Button className="w-full sm:w-auto bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Aceder à Equipa RFG
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Revolution to Free Generations</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Ponte para execução gamificada */}
        <div className="max-w-4xl mx-auto mt-12">
          <Card className="card-clean border-[#D2A63C]/30">
            <CardContent className="p-6 md:p-8 text-center">
              <h3 className="text-2xl font-bold text-mtm-primary mb-3">
                Próximo passo: entrar no Fast Start
              </h3>
              <p className="text-gray-300 mb-6">
                Desbloqueia missões, marca progresso por etapas e acelera a tua execução com acompanhamento.
              </p>
              <Link href="/fast-start">
                <Button className="btn-primary">
                  Continuar para Fast Start
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
    </ProtectedPage>
  )
}