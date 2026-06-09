"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, BarChart2, Play } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import ScannerPricing from "@/components/scanner-pricing"
import { videoManager } from "@/lib/videos-manager"

export default function ScannerSection() {
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoConfig, setVideoConfig] = useState<any>(null)

  useEffect(() => {
    // Carregar configuração do vídeo
    const config = videoManager.getVideoByLocation("home-scanner-section")
    setVideoConfig(config)
  }, [])

  const handlePlayVideo = () => {
    setVideoPlaying(true)
  }

  return (
    <>
      <section className="relative py-20" role="region" aria-labelledby="scanner-title">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2
              className="text-3xl md:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600"
              id="scanner-title"
            >
              Conhece tudo sobre os Scanner&apos;s
            </h2>
            <p className="text-xl text-gray-300 mb-12">
              Acesso aos nossos scanners exclusivos com tecnologia de inteligência artificial para identificar as
              melhores oportunidades de mercado.
            </p>
          </div>

          <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm max-w-4xl mx-auto">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2">
                  <div className="h-20 w-20 rounded-full bg-gold-500/20 flex items-center justify-center mb-6 mx-auto md:mx-0">
                    <BarChart2 className="h-10 w-10 text-gold-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-center md:text-left">Scanner MTM V3.4</h3>
                  <p className="text-gray-300 mb-6">
                    Os Nossos scanners proprietários identificam estruturas de mercado e pontos de entrada com alta
                    probabilidade de sucesso. Ideal para traders de todos os níveis.
                  </p>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-start">
                      <span className="text-gold-500 mr-2">•</span>
                      <span>Análise em tempo real de múltiplos pares</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gold-500 mr-2">•</span>
                      <span>Identificação automática de padrões</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gold-500 mr-2">•</span>
                      <span>Alertas de oportunidades de entrada com sinais Visuais</span>
                    </li>
                  </ul>
                </div>

                <div className="md:w-1/2 space-y-6">
                  {!videoPlaying ? (
                    <div
                      className="relative rounded-lg overflow-hidden border border-gold-500/30 cursor-pointer"
                      onClick={handlePlayVideo}
                    >
                      <div className="aspect-video bg-gray-900 relative">
                        <Image
                          src="/scanner-preview.png"
                          alt="Scanner MTM Preview"
                          fill
                          className="object-cover opacity-70"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-gold-600 hover:bg-gold-700 text-black rounded-full p-4 transition-colors">
                            <Play className="h-8 w-8" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video rounded-lg overflow-hidden border border-gold-500/30">
                      {videoConfig ? (
                        <iframe
                          src={`${videoConfig.embedUrl}?autoplay=1`}
                          title={videoConfig.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        ></iframe>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <p className="text-gray-400">Carregando vídeo...</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col space-y-4">
                    <Link href="/scanner">
                      <Button className="bg-gold-600 hover:bg-gold-700 text-black w-full" aria-label="Acessar Scanner">
                        Acessar Scanner <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>

                    <Link href="/scanner-access">
                      <Button
                        variant="outline"
                        className="border-gold-500 text-gold-400 hover:bg-gold-500/10 w-full"
                        aria-label="Solicitar Acesso ao Scanner"
                      >
                        Solicitar Acesso <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <ScannerPricing />
    </>
  )
}
