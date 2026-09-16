"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { GraduationCap } from "lucide-react"
import LeitorIntroModal from "@/components/intro/leitor-intro-modal"
import { useConfigIntro } from "@/components/intro/usar-intro"
import { destinoPorCaminho } from "@/lib/navegacao"

/**
 * «APRENDE A USAR …» — um componente, todos os destinos.
 *
 * Não está colado a nenhuma página: está montado uma vez ao lado da navbar e descobre sozinho em
 * que destino está, a partir do caminho e do registo de navegação. Ligar o vídeo do Terminal MTM
 * no /admin faz o botão aparecer no Terminal MTM sem tocar no código da página — que era o ponto:
 * um destino novo não pode obrigar a lembrar-se de ir lá pôr o botão.
 *
 * Sem vídeo ligado para o destino atual não desenha nada.
 */
export default function BotaoAprendeAUsar({ destinoFixo }: { destinoFixo?: string }) {
  const caminho = usePathname()
  const config = useConfigIntro()
  const [aberto, setAberto] = useState(false)

  const destino = destinoFixo ? { id: destinoFixo } : destinoPorCaminho(caminho)
  if (!destino || !config) return null

  const video = config.videos.find((v) => v.destino === destino.id)
  if (!video) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-5 right-4 z-[2147483630] inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/50 bg-[#0a0a0c]/95 px-4 py-2.5 text-[13px] font-semibold text-[#D2A63C] shadow-lg shadow-black/50 backdrop-blur transition hover:bg-[#D2A63C] hover:text-black sm:bottom-6 sm:right-6"
      >
        <GraduationCap className="h-4 w-4" />
        {video.texto}
      </button>

      <LeitorIntroModal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={video.texto}
        url={video.url}
        tipo={video.tipo}
      />
    </>
  )
}
