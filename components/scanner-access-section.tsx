"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useVideoManager } from "@/lib/videos-manager"

export default function ScannerAccessSection() {
  const router = useRouter()
  const videoManager = useVideoManager()
  const scannerVideo = videoManager.getVideoByLocation("scanner-access-section")

  const handleRequestAccess = () => {
    router.push("/scanner")
  }

  return (
    <section className="relative bg-black text-white overflow-hidden py-20">
      {/* Overlay para garantir a legibilidade do texto */}
      <div className="absolute inset-0 bg-black/60 z-10"></div>

      {/* Conteúdo */}
      <div className="relative z-20 max-w-6xl mx-auto px-4 text-center">
        {/* Logo */}
        <div className="mb-8">
          <Image src="/logo-official.png" alt="MoreThanMoney Logo" width={220} height={180} className="mx-auto" />
        </div>

        <h2 className="text-3xl md:text-5xl font-bold mb-6 text-gold-gradient">
          Scanner's MoreThanMoney - Acesso Exclusivo
        </h2>

        {/* Vídeo de apresentação */}
        <div className="max-w-4xl mx-auto mb-10 rounded-xl overflow-hidden shadow-2xl border-2 border-gold-500/30">
          {scannerVideo && scannerVideo.active ? (
            <div className="aspect-video">
              <iframe
                src={scannerVideo.embedUrl}
                title={scannerVideo.title}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            </div>
          ) : (
            <div className="aspect-video bg-black/50 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-gold-500/80 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-black"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-gold-500 text-lg">Conhece tudo sobre os Scanner's</p>
                <p className="text-gray-400 text-sm mt-2">Vídeo não configurado</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
          Solicita acesso ao nosso Scanner MoreThanMoney exclusivo, que identifica estruturas de mercado e níveis chave
          automaticamente.
        </p>

        <div className="mb-2">
          <Button
            onClick={handleRequestAccess}
            className="bg-gold-600 hover:bg-gold-700 text-black font-bold px-8 py-3 text-lg rounded-md transform transition-transform duration-300 hover:scale-105"
          >
            Conhece os nossos Scanners
          </Button>
        </div>

        <div className="mb-12 text-sm text-gray-400">
          <Link
            href="https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white transition-colors"
          >
            Indicador disponível apenas por aquisição de licença
          </Link>
        </div>

        <div className="mt-8 text-gray-300">
          <p className="text-sm">© 2025 MoreThanMoney. Todos os direitos reservados.</p>
        </div>
      </div>
    </section>
  )
}
