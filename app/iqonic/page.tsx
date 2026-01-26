"use client"

import { useState } from "react"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

export default function IQONICPage() {
  // Slideshow states
  const [academyIndex, setAcademyIndex] = useState(0)
  const [socialIndex, setSocialIndex] = useState(0)
  const [insightsIndex, setInsightsIndex] = useState(0)
  
  const academyImages = ["/images/iqonic/Acedemia IQ.png"]
  const socialImages = ["/images/iqonic/Imagem IQ Social.png"]
  const insightsImages = ["/images/iqonic/IQ Insights.png"]
  
  const nextSlide = (setIndex: (val: number) => void, length: number, current: number) => {
    setIndex((current + 1) % length)
  }
  
  const prevSlide = (setIndex: (val: number) => void, length: number, current: number) => {
    setIndex((current - 1 + length) % length)
  }
  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <section className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Principal */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-mtm-primary">IQONIC</span>
          </h1>
          <p className="text-3xl md:text-4xl font-bold text-white mb-4">
            RISE ABOVE ORDINARY
          </p>
          <p className="text-xl text-gray-300 mb-8">
            Eleva a forma como pensas, sentes e lideras. Desperta o potencial dentro de ti.
          </p>
        </div>

        {/* Vídeo de Apresentação */}
        <div className="max-w-5xl mx-auto mb-16">
          <YouTubeEmbed 
            videoId="RQIimjljeMI"
            title="Apresentação IQONIC"
            className="border border-mtm-primary/30"
          />
        </div>

        {/* A Nossa Missão */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-mtm-primary/30 rounded-2xl p-8 md:p-12">
            <h2 className="text-3xl md:text-4xl font-bold text-mtm-primary mb-6 text-center">
              A Nossa Missão
            </h2>
            <p className="text-lg text-gray-300 leading-relaxed text-center">
              A <strong className="text-white">IQONIC</strong> não é apenas sobre sucesso financeiro; é sobre a <strong className="text-mtm-primary">elevação</strong> da forma como pensamos, sentimos e lideramos. O nosso propósito é despertar o potencial dentro de cada ser humano, construindo caminhos que superam limitações através de educação, tecnologia e experiências de vida.
            </p>
          </div>
        </div>

        {/* A Filosofia: O Sistema dos 3 C's */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">
            A Filosofia: <span className="text-mtm-primary">O Sistema dos 3 C's</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-2 border-blue-500/30 rounded-xl p-6 text-center">
              <div className="text-5xl mb-4">🎯</div>
              <h3 className="text-2xl font-bold text-white mb-3">Compromisso</h3>
              <p className="text-gray-300">
                Uma mentalidade de trabalho focada em objetivos claros.
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 border-2 border-green-500/30 rounded-xl p-6 text-center">
              <div className="text-5xl mb-4">📈</div>
              <h3 className="text-2xl font-bold text-white mb-3">Consistência</h3>
              <p className="text-gray-300">
                O progresso diário como juro composto para o desenvolvimento pessoal.
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-2 border-purple-500/30 rounded-xl p-6 text-center">
              <div className="text-5xl mb-4">⚡</div>
              <h3 className="text-2xl font-bold text-white mb-3">Complacência (Combate)</h3>
              <p className="text-gray-300">
                Humildade extrema e determinação constante para nunca estagnar.
              </p>
            </div>
          </div>
        </div>

        {/* Ecossistema Integrado de Inteligência */}
        <div className="max-w-7xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Um <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Ecossistema Integrado</span> de Inteligência
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Três plataformas poderosas que trabalham em conjunto para elevar o teu conhecimento e resultados
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* IQ Academy */}
            <div className="bg-gradient-to-br from-blue-900/40 via-mtm-primary/5 to-cyan-900/40 border-2 border-blue-500/30 rounded-2xl p-6 hover:border-blue-500/60 transition-all duration-300 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-blue-500/20 via-mtm-primary/10 to-cyan-500/20 rounded-lg p-3 border border-blue-500/30">
                  <span className="text-2xl">🎓</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ Academy</h3>
              </div>
              
              {/* Slideshow - MacBook Mockup */}
              <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-700/50 relative group">
                <div className="aspect-video bg-gradient-to-br from-blue-950 to-cyan-950 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src={academyImages[academyIndex]}
                      alt="IQ Academy Interface"
                      fill
                      className="object-cover rounded-lg transition-opacity duration-500"
                      unoptimized
                    />
                  </div>
                  {/* Navigation Arrows */}
                  <button
                    onClick={() => prevSlide(setAcademyIndex, academyImages.length, academyIndex)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => nextSlide(setAcademyIndex, academyImages.length, academyIndex)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                  {/* Dots Indicator */}
                  {academyImages.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                      {academyImages.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setAcademyIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            idx === academyIndex ? 'bg-blue-400 w-4' : 'bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <a
                href="https://iqonic.vip"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Aceder à Academy
              </a>
            </div>

            {/* IQ Social */}
            <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all duration-300 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-500/20 rounded-lg p-3 border border-purple-500/30">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ Social</h3>
              </div>
              
              {/* Slideshow - Phone Mockup */}
              <div className="bg-gray-900 rounded-xl p-3 mb-4 border border-gray-700/50 relative group">
                <div className="aspect-[9/19] bg-gradient-to-br from-purple-950 to-pink-950 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src={socialImages[socialIndex]}
                      alt="IQ Social Interface"
                      fill
                      className="object-cover rounded-lg transition-opacity duration-500"
                      unoptimized
                    />
                  </div>
                  {/* Navigation Arrows */}
                  <button
                    onClick={() => prevSlide(setSocialIndex, socialImages.length, socialIndex)}
                    className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronLeft className="w-3 h-3 text-white" />
                  </button>
                  <button
                    onClick={() => nextSlide(setSocialIndex, socialImages.length, socialIndex)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronRight className="w-3 h-3 text-white" />
                  </button>
                  {/* Dots Indicator */}
                  {socialImages.length > 1 && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                      {socialImages.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSocialIndex(idx)}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                            idx === socialIndex ? 'bg-purple-400 w-3' : 'bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <a
                href="https://iqonic.vip"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Aceder ao Social
              </a>
            </div>

            {/* IQ Insights */}
            <div className="bg-gradient-to-br from-cyan-900/40 via-mtm-primary/5 to-blue-900/40 border-2 border-cyan-500/30 rounded-2xl p-6 hover:border-cyan-500/60 transition-all duration-300 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-cyan-500/20 via-mtm-primary/10 to-blue-500/20 rounded-lg p-3 border border-cyan-500/30">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ Insights</h3>
              </div>
              
              {/* Slideshow - Tablet/Desktop Mockup */}
              <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-700/50 relative group">
                <div className="aspect-video bg-gradient-to-br from-cyan-950 to-blue-950 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src={insightsImages[insightsIndex]}
                      alt="IQ Insights Interface"
                      fill
                      className="object-cover rounded-lg transition-opacity duration-500"
                      unoptimized
                    />
                  </div>
                  {/* Navigation Arrows */}
                  <button
                    onClick={() => prevSlide(setInsightsIndex, insightsImages.length, insightsIndex)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => nextSlide(setInsightsIndex, insightsImages.length, insightsIndex)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                  {/* Dots Indicator */}
                  {insightsImages.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                      {insightsImages.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setInsightsIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            idx === insightsIndex ? 'bg-cyan-400 w-4' : 'bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <a
                href="https://iqonic.vip"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-cyan-600 via-mtm-primary to-blue-600 hover:from-cyan-500 hover:via-mtm-primary hover:to-blue-500 text-white font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Ver Insights
              </a>
            </div>
          </div>

          {/* IQ Center - Ecossistema Integrado */}
          <div className="mt-12 max-w-5xl mx-auto">
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border-2 border-mtm-primary/30 rounded-2xl p-8 md:p-12">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-cyan-500/20 rounded-xl p-4 border-2 border-mtm-primary/30">
                    <span className="text-4xl">🌐</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold text-white">
                    IQ Center
                  </h3>
                </div>
                <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-6">
                  A tua plataforma educacional tudo-em-um. Academias, aulas ao vivo e masterclasses exclusivas num só lugar.
                </p>
              </div>

              {/* Imagem IQ Center */}
              <div className="mb-8">
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-700/50">
                  <div className="aspect-video bg-gradient-to-br from-blue-950 via-purple-950 to-cyan-950 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0">
                      <Image
                        src="/images/iqonic/Ecosistema IQ Center.png"
                        alt="IQ Center - Ecossistema Integrado"
                        fill
                        className="object-cover rounded-lg"
                        unoptimized
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <a
                  href="https://iqonic.vip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gradient-to-r from-mtm-primary to-amber-600 hover:from-amber-500 hover:to-mtm-primary text-black font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  Explorar IQ Center
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Packs Digitais */}
        <div className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Packs Digitais: <span className="text-mtm-primary">Domínio e Tecnologia</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              <em>O pack Basic foi descontinuado para focar em soluções de alta performance.</em>
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* IQ PRO */}
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border-2 border-mtm-primary/30 rounded-2xl p-6 hover:border-mtm-primary/60 transition-all duration-300 hover:scale-105">
              {/* Imagem do Pack */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-video bg-gradient-to-br from-mtm-primary/20 to-amber-500/20 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Preços Pack Elite-Promo-Prime.png"
                      alt="IQ PRO Pack"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">IQ PRO</h3>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-1">Ativação</div>
                  <span className="text-3xl font-bold text-mtm-primary">$199.99</span>
                </div>
                <div className="mb-2">
                  <div className="text-sm text-gray-400 mb-1">Mensal</div>
                  <span className="text-2xl font-bold text-white">$149.99</span>
                </div>
                <div className="bg-mtm-primary/20 rounded-lg px-3 py-1 mt-3">
                  <span className="text-sm font-semibold text-mtm-primary">CV 80</span>
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-mtm-primary mb-3 uppercase">Educação Total</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span><strong className="text-blue-400">IQ Academy (IQA)</strong> - Todas as academias</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span><strong className="text-purple-400">IQ Live</strong> - Transmissões ao vivo</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span><strong className="text-cyan-400">IQ Social</strong> - Educadores e networking</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span><strong className="text-green-400">IQ Charts</strong> - Estratégias e análises</span>
                  </li>
                </ul>
                <h4 className="text-sm font-semibold text-mtm-primary mb-2 mt-4 uppercase">Bónus</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span>Telegram Goldmine</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span>Educação de Marketing Digital</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span>IQ Vault</span>
                  </li>
                </ul>
              </div>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-mtm-primary to-amber-600 hover:from-amber-500 hover:to-mtm-primary text-black font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Escolher IQ PRO
              </a>
            </div>

            {/* IQ PRIME */}
            <div className="bg-gradient-to-br from-mtm-primary/20 to-amber-500/20 border-2 border-mtm-primary rounded-2xl p-6 hover:border-mtm-primary/80 transition-all duration-300 hover:scale-105 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-mtm-primary text-black px-3 py-1 rounded-full text-xs font-bold z-10">
                RECOMENDADO
              </div>
              {/* Imagem do Pack */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-video bg-gradient-to-br from-mtm-primary/20 to-amber-500/20 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Preços Pack Elite-Promo-Prime.png"
                      alt="IQ PRIME Pack"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">IQ PRIME</h3>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-1">Ativação</div>
                  <span className="text-3xl font-bold text-mtm-primary">$249.99</span>
                </div>
                <div className="mb-2">
                  <div className="text-sm text-gray-400 mb-1">Mensal</div>
                  <span className="text-2xl font-bold text-white">$174.99</span>
                </div>
                <div className="bg-mtm-primary/20 rounded-lg px-3 py-1 mt-3">
                  <span className="text-sm font-semibold text-mtm-primary">CV 100</span>
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-mtm-primary mb-3 uppercase">Execução Semi-Automática</h4>
                <ul className="space-y-2 text-sm text-gray-300 mb-4">
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span>Tudo do IQ PRO</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-mtm-primary mr-2">✓</span>
                    <span><strong className="text-mtm-primary">IQ SYNC</strong> - Execução manual de ideias de mercado em tempo real</span>
                  </li>
                </ul>
              </div>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-mtm-primary to-amber-600 hover:from-amber-500 hover:to-mtm-primary text-black font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Escolher IQ PRIME
              </a>
            </div>

            {/* IQ ELITE */}
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 border-2 border-purple-500/50 rounded-2xl p-6 hover:border-purple-500/80 transition-all duration-300 hover:scale-105 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold z-10">
                O PACK DEFINITIVO
              </div>
              {/* Imagem do Pack */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-video bg-gradient-to-br from-purple-950/20 to-pink-950/20 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Preços Pack Elite-Promo-Prime.png"
                      alt="IQ ELITE Pack"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">IQ ELITE</h3>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-1">Ativação</div>
                  <span className="text-3xl font-bold text-purple-400">$299.99</span>
                </div>
                <div className="mb-2">
                  <div className="text-sm text-gray-400 mb-1">Mensal</div>
                  <span className="text-2xl font-bold text-white">$214.99</span>
                </div>
                <div className="bg-purple-500/20 rounded-lg px-3 py-1 mt-3">
                  <span className="text-sm font-semibold text-purple-400">CV 115</span>
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-purple-400 mb-3 uppercase">Automação Total</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span>Todo o ecossistema digital e educacional</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span><strong className="text-purple-400">IQ AUTO (Full Auto)</strong> - Mantém a conta alinhada com estratégias dos educadores de forma 100% automática em segundo plano</span>
                  </li>
                </ul>
              </div>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Escolher IQ ELITE
              </a>
            </div>

            {/* IQ MAX LIFESTYLE */}
            <div className="bg-gradient-to-br from-amber-600/20 to-orange-600/20 border-2 border-amber-500/50 rounded-2xl p-6 hover:border-amber-500/80 transition-all duration-300 hover:scale-105">
              {/* Imagem do Pack */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-video bg-gradient-to-br from-amber-950/20 to-orange-950/20 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Preços Emerging MaxLife-Elite.png"
                      alt="IQ MAX LIFESTYLE Pack"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">IQ MAX LIFESTYLE</h3>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-1">Ativação</div>
                  <span className="text-3xl font-bold text-amber-400">$299.99</span>
                </div>
                <div className="mb-2">
                  <div className="text-sm text-gray-400 mb-1">Mensal</div>
                  <span className="text-2xl font-bold text-white">$199.99</span>
                </div>
                <div className="bg-amber-500/20 rounded-lg px-3 py-1 mt-3">
                  <span className="text-sm font-semibold text-amber-400">CV 115</span>
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-amber-400 mb-3 uppercase">Combo Lifestyle</h4>
                <ul className="space-y-2 text-sm text-gray-300 mb-4">
                  <li className="flex items-start">
                    <span className="text-amber-400 mr-2">✓</span>
                    <span>Todas as ferramentas do IQ Prime</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-amber-400 mr-2">✓</span>
                    <span><strong className="text-amber-400">Add-on Atlas</strong> (MTM integrada)</span>
                  </li>
                </ul>
                <h4 className="text-sm font-semibold text-amber-400 mb-2 uppercase">Benefícios Lifestyle</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start">
                    <span className="text-amber-400 mr-2">✓</span>
                    <span>Portal de viagens VIP com preços de venda por grosso</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-amber-400 mr-2">✓</span>
                    <span>Resorts, cruzeiros e hotéis</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-amber-400 mr-2">✓</span>
                    <span>Viagens em grupo (IQONIC Escapes)</span>
                  </li>
                </ul>
              </div>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-center px-4 py-3 rounded-xl transition-all duration-300 hover:scale-105 text-sm"
              >
                Escolher LIFESTYLE
              </a>
            </div>
          </div>
        </div>

        {/* Tecnologia que Liberta */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">
            Tecnologia que <span className="text-mtm-primary">Liberta</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* IQ SYNC Card */}
            <div className="bg-gradient-to-br from-blue-600/20 via-mtm-primary/10 to-cyan-600/20 border-2 border-blue-500/30 rounded-xl p-8 hover:border-blue-500/60 transition-all duration-300 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-blue-500/30 via-mtm-primary/20 to-cyan-500/30 rounded-xl p-4 border-2 border-blue-500/50">
                  <span className="text-4xl">🔄</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ SYNC</h3>
              </div>
              {/* Imagem Horizontal */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-[16/9] bg-gradient-to-br from-blue-950 to-cyan-950 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Imagem Iq Sync.png"
                      alt="IQ SYNC"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Sistema <strong className="text-blue-400">"Receive → Review → Confirm"</strong>, garantindo que manténs sempre o controlo final de cada decisão. Execução manual de ideias de mercado em tempo real.
              </p>
            </div>
            {/* IQ AUTO Card */}
            <div className="bg-gradient-to-br from-purple-600/20 via-mtm-primary/10 to-pink-600/20 border-2 border-purple-500/30 rounded-xl p-8 hover:border-purple-500/60 transition-all duration-300 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-purple-500/30 via-mtm-primary/20 to-pink-500/30 rounded-xl p-4 border-2 border-purple-500/50">
                  <span className="text-4xl">🤖</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ AUTO</h3>
              </div>
              {/* Imagem Horizontal */}
              <div className="mb-4 bg-gray-900 rounded-xl p-3 border border-gray-700/50">
                <div className="aspect-[16/9] bg-gradient-to-br from-purple-950 to-pink-950 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Imagem Iq Auto.png"
                      alt="IQ AUTO"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Experiência <strong className="text-purple-400">"set-it-once"</strong> com proteção <strong className="text-purple-400">SafeGuard</strong> (gestão de risco e limites de capital). Mantém a conta alinhada com estratégias dos educadores de forma 100% automática em segundo plano.
              </p>
            </div>
          </div>
        </div>

        {/* IQ Atlas - Lifestyle Section */}
        <div className="max-w-7xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              <span className="bg-gradient-to-r from-teal-400 via-green-400 to-emerald-400 bg-clip-text text-transparent">IQ Atlas</span>
            </h2>
            <p className="text-2xl text-teal-400 font-semibold mb-2">
              O Mundo ao Teu Alcance
            </p>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Acesso a preços de atacado que o público não vê
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* IQ Atlas Platform */}
            <div className="bg-gradient-to-br from-teal-900/40 to-green-900/40 border-2 border-teal-500/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-teal-500/20 rounded-lg p-3 border border-teal-500/30">
                  <span className="text-2xl">🌍</span>
                </div>
                <h3 className="text-2xl font-bold text-white">IQ Atlas</h3>
              </div>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Plataforma de viagens com acesso exclusivo a preços de atacado em hotéis, cruzeiros e resorts de luxo.
              </p>

              {/* App Interface Mockup */}
              <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-700/50">
                <div className="bg-gradient-to-br from-teal-950 to-green-950 rounded-lg overflow-hidden relative aspect-video">
                  <div className="absolute inset-0">
                    <Image
                      src="/images/iqonic/Atlas 1.png"
                      alt="IQ Atlas Platform Interface"
                      fill
                      className="object-cover rounded-lg"
                      unoptimized
                    />
                  </div>
                  {/* Fallback if image doesn't exist */}
                  <div className="absolute inset-0 z-[-1]">
                  {/* Header */}
                  <div className="bg-teal-600/30 px-4 py-3 border-b border-teal-500/30">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-teal-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">IQ</span>
                      </div>
                      <span className="text-white font-semibold text-sm">IQ Atlas</span>
                    </div>
                  </div>
                  
                  {/* Search Section */}
                  <div className="p-4 space-y-3">
                    <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400">
                      Q Destino
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                        <span>📅</span>
                        <span>Zerx - 2023</span>
                      </div>
                      <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                        <span>👤</span>
                        <span>4 Viajantes</span>
                      </div>
                    </div>
                    {/* Labels */}
                    <div className="flex justify-between px-1">
                      <span className="text-gray-400 text-[10px]">Hotels</span>
                      <span className="text-gray-400 text-[10px]">Pricing tiers</span>
                    </div>
                  </div>

                  {/* Hotel Listings */}
                  <div className="px-4 pb-4 space-y-3">
                    <div className="bg-gray-800/60 rounded-lg p-3 border border-teal-500/20">
                      <div className="text-white text-xs font-semibold mb-1">Premium Suite</div>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-[10px]">Público: $400</div>
                        <div className="bg-green-600/30 rounded px-2 py-1 border border-green-500/30">
                          <div className="text-green-400 text-xs font-bold">$250/noite</div>
                          <div className="text-green-300 text-[9px]">Poupança: $400</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-3 border border-teal-500/20">
                      <div className="text-white text-xs font-semibold mb-1">Ocean View Villa</div>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-[10px]">Público: $700</div>
                        <div className="bg-green-600/30 rounded px-2 py-1 border border-green-500/30">
                          <div className="text-green-400 text-xs font-bold">$450/noite</div>
                          <div className="text-green-300 text-[9px]">Poupança: $700</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-3 border border-teal-500/20">
                      <div className="text-white text-xs font-semibold mb-1">Luxury Retreat</div>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-[10px]">Público: $950</div>
                        <div className="bg-green-600/30 rounded px-2 py-1 border border-green-500/30">
                          <div className="text-green-400 text-xs font-bold">$600/noite</div>
                          <div className="text-green-300 text-[9px]">Poupança: $950</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3 bg-teal-600/10 rounded-lg border border-teal-500/20">
                  <div className="text-2xl mb-1">💰</div>
                  <div className="text-teal-400 text-xs font-semibold">Poupança Real</div>
                </div>
                <div className="text-center p-3 bg-teal-600/10 rounded-lg border border-teal-500/20">
                  <div className="text-2xl mb-1">🌐</div>
                  <div className="text-teal-400 text-xs font-semibold">1.9M+ Hotéis</div>
                </div>
                <div className="text-center p-3 bg-teal-600/10 rounded-lg border border-teal-500/20">
                  <div className="text-2xl mb-1">🛡️</div>
                  <div className="text-teal-400 text-xs font-semibold">Garantia</div>
                </div>
              </div>

              <ul className="space-y-2 text-sm text-gray-300 mb-6">
                <li className="flex items-start">
                  <span className="text-teal-400 mr-2">✓</span>
                  <span>Descontos em hotéis, cruzeiros e aluguer de carros</span>
                </li>
                <li className="flex items-start">
                  <span className="text-teal-400 mr-2">✓</span>
                  <span>Acesso a mais de 1.9 milhões de hotéis e resorts globais</span>
                </li>
                <li className="flex items-start">
                  <span className="text-teal-400 mr-2">✓</span>
                  <span>Garantia de preço: Se encontrares mais barato, cobrimos 110% da diferença</span>
                </li>
              </ul>
            </div>

            {/* IQ Atlas Concierge & Escapes */}
            <div className="space-y-6">
              {/* Concierge Services */}
              <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border-2 border-cyan-500/30 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-cyan-500/20 rounded-lg p-3 border border-cyan-500/30">
                    <span className="text-2xl">🎩</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">IQ Atlas Concierge</h3>
                    <p className="text-cyan-400 text-sm">A tua viagem. À tua maneira.</p>
                  </div>
                </div>
                {/* Imagem Concierge */}
                <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-700/50">
                  <div className="aspect-video bg-gradient-to-br from-cyan-950 to-blue-950 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0">
                      <Image
                        src="/images/iqonic/Atlas Concierge.png"
                        alt="IQ Atlas Concierge"
                        fill
                        className="object-cover rounded-lg"
                        unoptimized
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ICONIC ESCAPES */}
              <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border-2 border-emerald-500/30 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-emerald-500/20 rounded-lg p-3 border border-emerald-500/30">
                    <span className="text-2xl">🏝️</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">ICONIC ESCAPES</h3>
                    <p className="text-emerald-400 text-sm">Acesso VIP a viagens inesquecíveis</p>
                  </div>
                </div>
                {/* Imagem Escapes */}
                <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-700/50">
                  <div className="aspect-video bg-gradient-to-br from-emerald-950 to-teal-950 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0">
                      <Image
                        src="/images/iqonic/AtlasEscapes.png"
                        alt="ICONIC ESCAPES"
                        fill
                        className="object-cover rounded-lg"
                        unoptimized
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* IQ Access Pass */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border-2 border-green-500/50 rounded-2xl p-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Porta de Entrada: <span className="text-green-400">IQ Access Pass</span>
            </h2>
            <p className="text-xl text-gray-300 mb-6">
              Experimenta a potência da Elite Pack com o nosso trial educativo de 7 dias.
            </p>
            <div className="mb-8">
              <div className="text-5xl font-bold text-green-400 mb-2">$19.99</div>
              <div className="text-gray-400">USD/EUR</div>
              <div className="mt-4 bg-green-500/20 rounded-lg px-4 py-2 inline-block">
                <span className="text-green-400 font-mono font-bold">Código: IQACCESSPASS</span>
              </div>
            </div>
            <a
              href="https://iqonic.life/morethanmoney"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105"
            >
              Experimentar Agora
            </a>
          </div>
        </div>

        {/* CTA Section - Redesenhada */}
        <div className="max-w-6xl mx-auto mt-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pronto para <span className="text-mtm-primary">Elevar</span> a Tua Vida?
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-6">
              Junta-te à comunidade IQONIC e começa a construir o teu caminho para o sucesso.
            </p>
            <div className="inline-block bg-gradient-to-r from-mtm-primary/20 to-amber-500/20 border-2 border-mtm-primary/50 rounded-2xl p-6 mb-8">
              <p className="text-2xl font-bold text-mtm-primary">
                ✨ Condições especiais exclusivas para membros MoreThanMoney!
              </p>
            </div>
          </div>

          {/* Recomendação Pessoal - Destaque Melhorado */}
          <div className="bg-gradient-to-br from-blue-600/20 via-mtm-primary/10 to-purple-600/20 border-2 border-blue-500/50 rounded-2xl p-8 mb-8 text-center hover:border-blue-500/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-gradient-to-br from-blue-500/30 via-mtm-primary/20 to-purple-500/30 rounded-full p-4 border-2 border-blue-500/50">
                <span className="text-5xl">💬</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Recomendação Pessoal</h3>
            <p className="text-lg text-gray-200 max-w-2xl mx-auto">
              Contacta-me diretamente para te explicar tudo e aproveitar as <strong className="text-mtm-primary">melhores condições!</strong>
            </p>
          </div>
          
          {/* CTAs Principais - Grid Simétrico Melhorado */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* CTA 1 - WhatsApp */}
            <div className="bg-gradient-to-br from-green-600/20 via-mtm-primary/10 to-emerald-600/20 border-2 border-green-500/50 rounded-2xl p-8 hover:border-green-500/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-green-500/30">
              <div className="flex justify-center mb-6">
                <div className="bg-gradient-to-br from-green-500/30 via-mtm-primary/20 to-emerald-500/30 rounded-full p-6 border-2 border-green-500/50">
                  <span className="text-6xl">🚀</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Fala Comigo Agora</h3>
              <p className="text-gray-300 mb-8 text-center leading-relaxed">
                Manda-me mensagem no WhatsApp! Vou-te explicar <strong className="text-mtm-primary">tudo sobre como criar o teu negócio global</strong> e as melhores condições
              </p>
              <a
                href="https://wa.me/message/5NMUP53HEXVMB1"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-green-600 via-mtm-primary to-emerald-600 hover:from-green-500 hover:via-mtm-primary hover:to-emerald-500 text-white font-bold text-lg px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/50 text-center"
              >
                💬 Falar no WhatsApp Agora
              </a>
            </div>

            {/* CTA 2 - Registo Direto */}
            <div className="bg-gradient-to-br from-orange-600/20 via-mtm-primary/10 to-red-600/20 border-2 border-orange-500/50 rounded-2xl p-8 hover:border-orange-500/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/30">
              <div className="flex justify-center mb-6">
                <div className="bg-gradient-to-br from-orange-500/30 via-mtm-primary/20 to-red-500/30 rounded-full p-6 border-2 border-orange-500/50">
                  <span className="text-6xl">⚡</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Registo Direto</h3>
              <p className="text-gray-300 mb-8 text-center leading-relaxed">
                Se já sabes o que queres, clica aqui e <strong className="text-mtm-primary">regista-te diretamente</strong> na plataforma IQONIC
              </p>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-orange-600 via-mtm-primary to-red-600 hover:from-orange-500 hover:via-mtm-primary hover:to-red-500 text-white font-bold text-lg px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/50 text-center"
              >
                🎯 Faz o Teu Registo Aqui
              </a>
            </div>
          </div>

          {/* Recursos Adicionais - Simétrico */}
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-mtm-primary/30 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-mtm-primary mb-6 text-center">
              Queres Saber Mais?
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <a
                href="https://iqonic.vip"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center bg-gray-800/50 border border-mtm-primary/30 hover:border-mtm-primary/60 hover:bg-gray-800 p-6 rounded-xl transition-all duration-300 hover:scale-105 group"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📚</div>
                <h4 className="text-xl font-semibold text-white mb-2">IQonic Academy</h4>
                <p className="text-gray-400 text-center text-sm">Dá uma olhadela na plataforma de educação</p>
              </a>
              
              <a
                href="https://user.iqonic.life"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center bg-gray-800/50 border border-mtm-primary/30 hover:border-mtm-primary/60 hover:bg-gray-800 p-6 rounded-xl transition-all duration-300 hover:scale-105 group"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">💼</div>
                <h4 className="text-xl font-semibold text-white mb-2">Backoffice</h4>
                <p className="text-gray-400 text-center text-sm">Vê como funciona o backoffice IQONIC</p>
              </a>
            </div>

            {/* Urgency Message */}
            <div className="mt-8 pt-6 border-t border-mtm-primary/30 text-center">
              <div className="inline-block bg-amber-500/10 border border-amber-500/30 rounded-xl px-8 py-4">
                <p className="text-lg text-amber-300 font-semibold flex items-center gap-3 justify-center">
                  <span className="text-2xl">⏰</span>
                  <span>
                    <strong>Olha, não percas tempo:</strong> Estas condições especiais são só para membros MoreThanMoney como tu!
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Aviso Legal e Compliance */}
        <div className="max-w-4xl mx-auto mt-16 mb-12">
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-gray-300 mb-4 text-center">
              ⚠️ Aviso Legal e Compliance
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed text-center">
              A <strong className="text-gray-300">IQONIC</strong> é uma plataforma de subscrição focada em educação e ferramentas tecnológicas. A participação não garante sucesso financeiro e o trading envolve riscos. Os resultados dependem do esforço, competências e disciplina de cada indivíduo.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}



