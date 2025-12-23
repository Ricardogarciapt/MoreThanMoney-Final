"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Play, Users, TrendingUp, BookOpen, Bot, UserCheck, Star, Quote } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import ParticleBackground from "@/components/particle-background"
import { getRandomTestimonials } from "@/lib/testimonials-service"
import type { Testimonial } from "@/lib/testimonials-service"
import { useVideoManager } from "@/lib/videos-manager"
import RicardoStoryCard from "@/components/ricardo-story-card"

export default function NewLandingPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const videoManager = useVideoManager()

  useEffect(() => {
    const randomTestimonials = getRandomTestimonials(6)
    setTestimonials(randomTestimonials)
  }, [])

  // Rotação automática dos testemunhos
  useEffect(() => {
    if (testimonials.length === 0) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 3
        return next >= testimonials.length ? 0 : next
      })
    }, 6000) // Trocar a cada 6 segundos

    return () => clearInterval(interval)
  }, [testimonials.length])

  const scrollToOffers = () => {
    const offersSection = document.getElementById("path-selection")
    if (offersSection) {
      offersSection.scrollIntoView({ behavior: "smooth" })
    }
  }

  const scrollToEducation = () => {
    const educationSection = document.getElementById("education-premium")
    if (educationSection) {
      educationSection.scrollIntoView({ behavior: "smooth" })
    }
  }


  // Map of testimonial images by name
  const testimonialImages: Record<string, string> = {
    "Liliana Faria":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/liliana-faria.jpg-CkCF7RiHAIUfQ1Qh6ZhVMkmmtCzJVz.jpeg",
    "Gonçalo e Vânia":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/goncalo-vania.jpg-vK3Ks3NOpCqiQgZtOj6JOfZxmiuZpm.jpeg",
    "André Dias":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/andre-dias.jpg-3Mu1TvWGku101AAsuXB00MiN9fZCgU.jpeg",
    "Rafael Bastos":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/rafael-bastos.jpg-LuZAC0FpHaJEYhWiShSMwi7SfNZX0u.jpeg",
    "Rui Rodrigues e Carla":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/rui-carla.jpg-NEMhntb1rbxuwauj5mVUNmz7pGfx6t.png",
    "Sandra Oliveira":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/sandra-oliveira.jpg-zcGxxAPaWxTvR1E194zvqZD1jKdInf.png",
    "Sandra Oliveira 2":
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/sandra-oliveira-2.jpg-qCd7jS1rZMwpBuLF6LaRJ8eJm3Eb5z.jpeg",
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      <ParticleBackground />

      {/* Hero Section com Vídeo */}
      <section className="relative min-h-screen flex items-center justify-center px-4">
        <div className="container mx-auto text-center z-10">
          <div className="max-w-4xl mx-auto">
            <Badge className="mb-6 bg-mtm-primary-dark/20 text-mtm-primary border-mtm-primary/30 px-4 py-2">🔥 ACESSO EXCLUSIVO</Badge>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-600 bg-clip-text text-transparent">
              MoreThanMoney
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
              <strong className="text-white">É hora de agir!</strong> Uma plataforma que te inspira a crescer através de <span className="text-mtm-primary">educação, ferramentas e comunidade</span>
            </p>


            {/* Vídeo de Apresentação */}
            <div className="mb-12 max-w-4xl mx-auto">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 border border-mtm-primary/30">
                <iframe
                  src="https://www.youtube.com/embed/dgd0-mLIrMw?autoplay=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3"
                  title="Apresentação MoreThanMoney"
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
              </div>
            </div>

            {/* História Pessoal */}
            <div className="bg-gradient-to-r from-mtm-primary/10 to-amber-500/10 border border-mtm-primary/30 rounded-xl p-6 mb-8 max-w-4xl mx-auto">
              <p className="text-xl md:text-2xl text-gray-300 mb-4 max-w-3xl mx-auto">
                Aos 41 anos, depois de 3 anos a usar a aprendizagem no modelo da <strong className="text-mtm-primary">IQONIC</strong> e seguir os ensinamentos de <strong>Warren Buffett</strong> e <strong>Eric Worre</strong>, 
                criei algo que transformou vidas.
              </p>
              <p className="text-lg text-gray-400 mb-4">
                <em>"Não é sobre ter mais dinheiro, é sobre ter mais <strong>liberdade</strong> para viver a vida que verdadeiramente queres."</em>
              </p>
              <p className="text-base text-gray-300 max-w-3xl mx-auto">
                A MoreThanMoney nasceu da necessidade real de combinar <strong className="text-white">educação sólida</strong> com tecnologia avançada, 
                criando um sistema que <strong>duplica resultados</strong> através de <strong>ação disciplinada</strong>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="bg-mtm-primary-dark hover:bg-amber-700 text-black font-semibold px-8 py-4 text-lg animate-pulse"
                onClick={scrollToOffers}
              >
                <Play className="mr-2 h-5 w-5" />
                🚀 QUERO COMEÇAR AGORA!
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-mtm-primary text-mtm-primary hover:bg-amber-500/10 px-8 py-4 text-lg"
                onClick={scrollToEducation}
              >
                📚 Ver Educação Premium
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Seção da História Pessoal */}
      <section className="py-20 px-4 relative z-10">
        <div className="container mx-auto">
          <RicardoStoryCard />
        </div>
      </section>

      {/* Seção de Testemunhos */}
      <section className="py-20 px-4 relative z-10">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-mtm-primary-dark/20 text-mtm-primary border-mtm-primary/30 animate-pulse">
              ⭐ Testemunhos Reais
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              O Que Dizem os Nossos Membros
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Resultados reais de pessoas que transformaram as suas vidas financeiras com a nossa plataforma
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.slice(currentIndex, currentIndex + 3).map((testimonial, index) => (
              <Card 
                key={testimonial.id} 
                className="group bg-gradient-to-br from-[#BB8525]/10 to-[#D2A63C]/5 border-[#D2A63C]/30 backdrop-blur-sm hover:border-[#F3F3E6]/50 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-[#D2A63C]/20 animate-fade-in-up"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <CardContent className="p-6 relative overflow-hidden">
                  {/* Decorative corner */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#D2A63C]/20 to-transparent rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity" />
                  
                  {/* Avatar e Info (sem imagem) */}
                  <div className="flex items-center mb-6 relative z-10">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D2A63C] to-[#BB8525] flex items-center justify-center border-4 border-[#D2A63C]/30 group-hover:border-[#D2A63C]/60 transition-all duration-300">
                        <span className="text-2xl font-bold text-black">
                          {testimonial.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                      {testimonial.verified && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-900">
                          <UserCheck className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex-1">
                      <h4 className="font-bold text-white text-lg">{testimonial.name}</h4>
                      <p className="text-sm text-gray-400">{testimonial.location}</p>
                      <p className="text-xs text-[#D2A63C]">{testimonial.role}</p>
                    </div>
                  </div>

                  {/* Rating Stars */}
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        className="w-5 h-5 fill-[#D2A63C] text-[#D2A63C] drop-shadow-lg animate-pulse" 
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>

                  {/* Quote Icon */}
                  <Quote className="w-8 h-8 text-[#D2A63C]/40 mb-3" />
                  
                  {/* Testimonial Content */}
                  <p className="text-gray-300 mb-6 italic leading-relaxed text-base">
                    "{testimonial.content}"
                  </p>

                  {/* Results */}
                  {testimonial.profit && (
                    <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/40 rounded-lg p-4 backdrop-blur-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400 font-medium">💰 Resultado:</span>
                        <span className="font-bold text-green-400 text-lg">{testimonial.profit}</span>
                      </div>
                      {testimonial.timeframe && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400 font-medium">📅 Período:</span>
                          <span className="text-sm text-white font-semibold">{testimonial.timeframe}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verified Badge */}
                  {testimonial.verified && (
                    <div className="mt-4 flex items-center justify-center">
                      <Badge className="bg-green-600/20 text-green-400 border-green-500/30 px-3 py-1">
                        <UserCheck className="w-3 h-3 mr-1" />
                        Membro Verificado
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Indicadores de navegação */}
          <div className="flex justify-center gap-2 mt-12">
            {Array.from({ length: Math.ceil(testimonials.length / 3) }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx * 3)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  idx === Math.floor(currentIndex / 3)
                    ? 'bg-[#D2A63C] w-8'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
                aria-label={`Ver testemunhos ${idx + 1}`}
              />
            ))}
          </div>

          {/* Contador de testemunhos */}
          <div className="text-center mt-6">
            <p className="text-gray-400 text-sm">
              Mostrando {currentIndex + 1}-{Math.min(currentIndex + 3, testimonials.length)} de {testimonials.length} testemunhos
            </p>
          </div>
        </div>
      </section>

      {/* Seção de Escolha de Caminho */}
      <section id="path-selection" className="py-20 px-4 relative z-10">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-mtm-primary-dark/20 text-mtm-primary border-mtm-primary/30">🎯 ESCOLHE O TEU LADO</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Vamos <span className="text-mtm-primary">Ao Que Interessa</span> 🎯
            </h2>
            <div className="bg-gradient-to-r from-mtm-primary/10 to-amber-500/10 border border-mtm-primary/30 rounded-xl p-6 mb-8 max-w-3xl mx-auto">
              <p className="text-gray-300 text-lg mb-4">
                <strong className="text-white">Vamos ser diretos.</strong> Escolhe o caminho que mais se adequa ao teu momento e objetivos.
              </p>
              <p className="text-gray-400 text-base max-w-2xl mx-auto">
                Depois de <strong>3 anos</strong> de experiência, estes são os <span className="text-mtm-primary font-bold">3 caminhos que podes explorar</span>. 
                Cada um tem o seu foco e propósito.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Caminho 1: Aprender com a IQONIC */}
            <Card className="card-modern group">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-mtm-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-mtm-primary/40 transition-colors">
                  <BookOpen className="w-8 h-8 text-mtm-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-mtm-primary">🎓 QUERO APRENDER DE VERDADE</h3>
                <p className="text-gray-300 mb-6">
                  <strong>Sabes o que me inspirou?</strong> A educação que verdadeiramente transforma mentalidades. Esta plataforma mudou a minha forma de pensar há 3 anos. 
                  <span className="text-mtm-primary">100+ cursos</span> que se focam no crescimento pessoal e desenvolvimento de competências.
                </p>
                <ul className="text-left space-y-2 mb-8 text-gray-400">
                  <li>✓ Educação em Trading e mercados</li>
                  <li>✓ Criptomoedas e tecnologia blockchain</li>
                  <li>✓ Marketing Digital e comunicação</li>
                  <li>✓ Empreendedorismo e negócios online</li>
                  <li>✓ Inteligência Artificial aplicada</li>
                  <li>✓ Comunidade de crescimento contínuo</li>
                </ul>
                <Link href="/iqonic">
                  <Button className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black font-semibold">
                    🚀 QUERO COMEÇAR A APRENDER!
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Caminho 2: Automatizar */}
            <Card className="card-modern group">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-mtm-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-mtm-primary/40 transition-colors">
                  <Bot className="w-8 h-8 text-mtm-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-mtm-primary">🤖 QUERO SIMPLICIDADE</h3>
                <p className="text-gray-300 mb-6">
                  <strong>Às vezes queremos focar no essencial.</strong> Esta opção oferece-te ferramentas automatizadas que podem ajudar-te a poupar tempo. 
                  <span className="text-mtm-primary">Tecnologia ao teu serviço.</span>
                </p>
                <ul className="text-left space-y-2 mb-8 text-gray-400">
                  <li>✓ Sistemas de análise assistida por IA</li>
                  <li>✓ Automação de processos repetitivos</li>
                  <li>✓ Acesso a estratégias de traders profissionais</li>
                  <li>✓ Notificações e alertas personalizados</li>
                  <li>✓ Interface simplificada e intuitiva</li>
                </ul>
                <Link href="/automation">
                  <Button className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black font-semibold">
                    🔧 QUERO EXPLORAR AS FERRAMENTAS!
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Caminho 3: Usa IA para Trading */}
            <Card className="card-modern group">
              <div className="absolute top-4 right-4">
                <Badge className="bg-red-500 text-white font-bold animate-pulse">🔥 MAIS POPULAR</Badge>
              </div>
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-mtm-primary-dark/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-mtm-primary-dark/30 transition-colors">
                  <Bot className="w-8 h-8 text-mtm-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-mtm-primary">🎯 QUERO EQUILÍBRIO</h3>
                <p className="text-gray-300 mb-6">
                  <strong>O melhor dos dois mundos:</strong> Tens acesso a análises avançadas e manténs o controlo das tuas decisões. 
                  <span className="text-mtm-primary">Informação + autonomia = crescimento.</span>
                </p>
                <ul className="text-left space-y-2 mb-8 text-gray-400">
                  <li>✓ Análises avançadas com IA</li>
                  <li>✓ Tu manténs o controlo das decisões</li>
                  <li>✓ Acesso a insights de traders experientes</li>
                  <li>✓ Alertas personalizados no telemóvel</li>
                  <li>✓ Gestão de tempo eficiente</li>
                  <li>✓ Configuração rápida e simples</li>
                </ul>
                <Link href="/scanner">
                  <Button className="w-full bg-mtm-primary-dark hover:bg-amber-700 text-black font-bold">
                    📊 QUERO VER AS ANÁLISES!
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Seção Educação Premium */}
      <section id="education-premium" className="py-20 px-4 relative z-10">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-mtm-primary-dark/20 text-mtm-primary border-mtm-primary/30">🎓 Educação Premium</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Educação <span className="text-mtm-primary">MoreThanMoney</span>
            </h2>
            <div className="bg-gradient-to-r from-mtm-primary/10 to-amber-500/10 border border-mtm-primary/30 rounded-xl p-6 mb-8 max-w-4xl mx-auto">
              <p className="text-gray-300 text-lg mb-4">
                <em>"Não há nada melhor para investir do que em educação"</em> - <strong className="text-mtm-primary">Warren Buffett</strong> estava certo. 
                Educação é o único investimento que nunca perde valor.
              </p>
              <p className="text-gray-400 text-base max-w-2xl mx-auto">
                Trabalho com <strong className="text-mtm-primary">parcerias estratégicas</strong> para garantir a melhor educação. Baseado em 3 anos de experiência 
                com a IQONIC e estudo dos grandes mestres. Não é só sobre dinheiro, 
                é sobre construir a <strong className="text-white">mentalidade</strong> que te leva ao próximo nível.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* AI com os GÉMEOS */}
            <Card className="bg-gray-950/50 border-mtm-primary/30 backdrop-blur-sm hover:border-mtm-primary/70 transition-all duration-300 overflow-hidden">
              <CardContent className="p-0">
                <div className="relative h-48 overflow-hidden">
                  <Image src="/ai-com-osgemeos.png" alt="AI com os GÉMEOS" fill className="object-cover" />
                  <div className="absolute top-4 right-4 bg-mtm-primary-dark text-black px-3 py-1 rounded-full text-sm font-bold">
                    $39/mês
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-400">🌟 Parceria Exclusiva MTM</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">AI com os GÉMEOS</h3>
                  <p className="text-gray-300 mb-4 text-sm leading-relaxed">
                    <strong>Parceria estratégica</strong> entre a MoreThanMoney e os Gémeos! Cada vez mais se ouve falar de IA, 
                    mas são poucos os que verdadeiramente entendem e aplicam. Esta comunidade combina o <strong className="text-mtm-primary">conhecimento técnico dos Gémeos</strong> 
                    com a <strong className="text-mtm-primary">metodologia MTM</strong> 🤖
                  </p>
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Fundamentos explicados de forma simples</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Tutoriais step-by-step com aplicação prática</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Desafios semanais com prémios em dinheiro 🏆</span>
                    </div>
                  </div>
                  <div className="text-xs text-mtm-primary mb-4 italic">🤝 Parceria Oficial MoreThanMoney × Os Gémeos</div>
                  <Button
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                    onClick={() => window.open("https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b", "_blank")}
                  >
                    🤝 Aceder à Parceria MTM × Gémeos
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Educação MoreThanMoney */}
            <Card className="bg-gray-950/50 border-mtm-primary/30 backdrop-blur-sm hover:border-mtm-primary/70 transition-all duration-300 overflow-hidden">
              <CardContent className="p-0">
                <div className="relative h-48 overflow-hidden">
                  <Image
                    src="/educacao-morethanmoney.png"
                    alt="BootCamp MoreThanMoney - Educação Forex e Scanners AI"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-4 right-4 bg-mtm-primary-dark text-black px-3 py-1 rounded-full text-sm font-bold">
                    Premium
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 bg-amber-500 rounded-full"></div>
                    <span className="text-sm text-gray-400">Metodologia Comprovada</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Bootcamp MTM - Educação Forex e Scanners AI</h3>
                  <p className="text-gray-300 mb-4 text-sm leading-relaxed">
                    A metodologia que desenvolvi após anos a estudar <strong>Grant Cardone</strong> e aplicar os princípios de <strong>Warren Buffett</strong>. 
                    Combina análise técnica tradicional com IA de ponta para <strong>maximizar resultados</strong>.
                  </p>
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Metodologia MoreThanMoney completa</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Scanners AI exclusivos</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Análise de mercado em tempo real</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="h-1 w-1 bg-amber-500 rounded-full"></div>
                      <span>Estratégias de alto desempenho</span>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-mtm-primary-dark hover:bg-amber-700 text-black"
                    onClick={() => window.open("https://www.skool.com/morethanmoney/about?ref=8e3afe86cbc7407ca7b411cece0512bd", "_blank")}
                  >
                    Aceder ao Bootcamp
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

    </div>
  )
}
