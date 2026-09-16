"use client"

import { useState } from "react"
import { GraduationCap, PlayCircle } from "lucide-react"
import LeitorIntroModal from "@/components/intro/leitor-intro-modal"
import { useConfigIntro } from "@/components/intro/usar-intro"

/**
 * O CURSO DE INTRODUÇÃO — «Como usar a MoreThanMoney».
 *
 * A playlist vive na sala «Introdução» do LMS (uma sala sem educador e sem horário, que nunca vai
 * ao ar). Aqui só se abre o mesmo leitor, com três feitios conforme o sítio onde está: o cartão do
 * lobby de sessões, o bloco do onboarding e o botão discreto das sessões gratuitas.
 *
 * Enquanto ninguém colar o link da playlist no admin, isto não desenha nada — um botão que abre um
 * leitor vazio é pior do que não haver botão.
 */

export type FeitioCurso = "cartao" | "bloco" | "botao"

export default function CursoIntroducao({
  feitio = "cartao",
  className = "",
}: {
  feitio?: FeitioCurso
  className?: string
}) {
  const config = useConfigIntro()
  const [aberto, setAberto] = useState(false)

  const curso = config?.curso
  if (!curso?.playlistUrl) return null

  const abrir = () => setAberto(true)
  const leitor = (
    <LeitorIntroModal
      aberto={aberto}
      aoFechar={() => setAberto(false)}
      titulo={curso.titulo}
      descricao={curso.descricao}
      url={curso.playlistUrl}
      tipo="playlist"
    />
  )

  if (feitio === "botao") {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={abrir}
          className="inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-5 py-2.5 text-[14px] font-bold text-black transition hover:bg-[#BB8525]"
        >
          <PlayCircle className="h-4 w-4" />
          Como começar
        </button>
        {leitor}
      </div>
    )
  }

  if (feitio === "bloco") {
    return (
      <section className={className}>
        <button
          type="button"
          onClick={abrir}
          className="group flex w-full flex-col items-start gap-4 rounded-2xl border border-[#D2A63C]/35 bg-[#D2A63C]/[0.06] p-6 text-left transition hover:border-[#D2A63C]/60 sm:flex-row sm:items-center"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#D2A63C]/15 text-[#D2A63C]">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] uppercase tracking-[0.18em] text-[#8a8a95]">
              Curso de introdução
            </span>
            <span className="mt-1 block text-lg font-semibold text-white">{curso.titulo}</span>
            <span className="mt-1 block text-[14px] leading-relaxed text-[#b9b9c3]">
              {curso.descricao ||
                "Vê o percurso inteiro antes de escolher: o que está incluído, por onde se começa e o que fazer a seguir."}
            </span>
          </span>
          <span className="shrink-0 text-[14px] font-semibold text-[#D2A63C]">Ver o curso →</span>
        </button>
        {leitor}
      </section>
    )
  }

  // "cartao" — o feitio do lobby de sessões ao vivo.
  return (
    <section className={className}>
      <button
        type="button"
        onClick={abrir}
        className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#D2A63C]/25 bg-gray-950/90 text-left transition hover:border-[#D2A63C]/50 sm:flex-row sm:items-center"
      >
        {/*
          A capa é 16:9 e tem o título desenhado. Numa faixa estreita com recorte, o título ficava
          cortado a meio («SAR A …ANMONEY»); com a proporção dela, vê-se inteira. No telemóvel vai
          por cima do texto em vez de desaparecer — é o que diz «isto é um curso» antes de se ler.
        */}
        <span className="relative block aspect-video w-full shrink-0 overflow-hidden bg-gray-900 sm:w-[45%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={curso.capa}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#D2A63C]/40 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#D2A63C]">
            <GraduationCap className="h-3 w-3" />
            Começa por aqui
          </span>
          <span className="block text-lg font-bold leading-snug text-white">{curso.titulo}</span>
          <span className="block text-[13px] leading-relaxed text-gray-400">
            {curso.descricao ||
              "O curso de introdução da MoreThanMoney: o que existe, como se usa e por onde se começa."}
          </span>
          <span className="mt-1 inline-flex items-center gap-2 text-[13px] font-semibold text-[#D2A63C]">
            <PlayCircle className="h-4 w-4" />
            Começar o curso
          </span>
        </span>
      </button>
      {leitor}
    </section>
  )
}
