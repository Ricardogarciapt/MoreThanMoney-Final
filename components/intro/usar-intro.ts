"use client"

import { useEffect, useState } from "react"
import type { TipoLeitorIntro } from "@/components/intro/leitor-intro-modal"

export type VideoIntroCliente = {
  destino: string
  tipo: TipoLeitorIntro
  url: string
  texto: string
}

export type CursoIntroducao = {
  salaId: string
  titulo: string
  capa: string
  descricao: string | null
  playlistUrl: string | null
}

export type ConfigIntro = {
  videos: VideoIntroCliente[]
  curso: CursoIntroducao | null
}

/**
 * A configuração das introduções, pedida UMA vez por separador.
 *
 * O botão «Aprende a usar …» está em todas as páginas; sem isto seria um pedido por navegação. A
 * promessa é partilhada (dois componentes na mesma página fazem um pedido só) e o resultado fica
 * no sessionStorage, por isso navegar pelo site não volta a tocar no servidor. A configuração muda
 * de semanas a semanas; um separador com dados de há cinco minutos não é um problema.
 */
const CHAVE_SESSAO = "mtm-intro-config-v1"
let promessa: Promise<ConfigIntro> | null = null
let memoria: ConfigIntro | null = null

function lerSessao(): ConfigIntro | null {
  try {
    const cru = window.sessionStorage.getItem(CHAVE_SESSAO)
    if (!cru) return null
    const { em, valor } = JSON.parse(cru) as { em: number; valor: ConfigIntro }
    if (!valor || Date.now() - em > 5 * 60 * 1000) return null
    return valor
  } catch {
    return null
  }
}

export function carregarConfigIntro(): Promise<ConfigIntro> {
  if (memoria) return Promise.resolve(memoria)
  const daSessao = typeof window !== "undefined" ? lerSessao() : null
  if (daSessao) {
    memoria = daSessao
    return Promise.resolve(daSessao)
  }
  if (promessa) return promessa

  promessa = fetch("/api/videos-intro")
    .then((r) => (r.ok ? r.json() : { videos: [], curso: null }))
    .then((j) => {
      const valor: ConfigIntro = {
        videos: Array.isArray(j?.videos) ? j.videos : [],
        curso: j?.curso ?? null,
      }
      memoria = valor
      try {
        window.sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ em: Date.now(), valor }))
      } catch {
        /* armazenamento bloqueado — fica só em memória */
      }
      return valor
    })
    .catch(() => ({ videos: [], curso: null }))
    .finally(() => {
      promessa = null
    })

  return promessa
}

export function useConfigIntro(): ConfigIntro | null {
  const [config, setConfig] = useState<ConfigIntro | null>(memoria)

  useEffect(() => {
    if (config) return
    let vivo = true
    carregarConfigIntro().then((c) => {
      if (vivo) setConfig(c)
    })
    return () => {
      vivo = false
    }
  }, [config])

  return config
}
