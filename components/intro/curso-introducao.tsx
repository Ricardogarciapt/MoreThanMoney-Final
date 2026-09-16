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
  if (!curso) return null
  // Sem playlist, o botão e o cartão não desenham nada (um leitor vazio é pior do que nada). O
  // BLOCO do onboarding é a excepção pedida pelo dono: o lugar do curso vê-se já, em «preparação»,
  // e vira leitor quando o DVR criar a playlist na primeira gravação da sala.
  const pronto = Boolean(curso.playlistUrl)
  if (!pronto && feitio !== "bloco") return null

  const abrir = () => setAberto(true)
  const leitor = (
    <LeitorIntroModal
      aberto={aberto}
      aoFechar={() => setAberto(false)}
      titulo={curso.titulo}
      descricao={curso.descricao}
      url={curso.playlistUrl ?? ""}
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
    const corpo = (
      <>
        {/* A capa tem o título desenhado: com a proporção dela vê-se inteira. */}
        <span className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-gray-900 sm:w-[42%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={curso.capa}
            alt=""
            className={`h-full w-full object-cover transition duration-300 ${pronto ? "group-hover:scale-[1.03]" : "opacity-40 grayscale"}`}
          />
          {pronto && (
            <span className="absolute inset-0 grid place-items-center bg-black/20">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#D2A63C] text-black shadow-lg">
                <PlayCircle className="h-7 w-7" />
              </span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              pronto ? "border-[#D2A63C]/40 text-[#D2A63C]" : "border-gray-700 text-gray-400"
            }`}
          >
            <GraduationCap className="h-3 w-3" />
            {pronto ? "Curso de introdução" : "Curso em vídeo · em preparação"}
          </span>
          <span className="block text-lg font-semibold text-white">{curso.titulo}</span>
          <span className="block text-[14px] leading-relaxed text-[#b9b9c3]">
            {pronto
              ? curso.descricao ||
                "Vê o percurso inteiro antes de escolher: o que está incluído, por onde se começa e o que fazer a seguir."
              : "O curso em vídeo está a ser gravado e fica disponível aqui assim que estiver pronto."}
          </span>
          {pronto && (
            <span className="mt-1 inline-flex items-center gap-2 text-[14px] font-semibold text-[#D2A63C]">
              <PlayCircle className="h-4 w-4" />
              Ver o curso
            </span>
          )}
        </span>
      </>
    )
    const moldura = "flex w-full flex-col items-start gap-5 rounded-2xl border p-5 text-left sm:flex-row sm:items-center"
    return (
      <section className={className}>
        {pronto ? (
          <button
            type="button"
            onClick={abrir}
            className={`group ${moldura} border-[#D2A63C]/35 bg-[#D2A63C]/[0.06] transition hover:border-[#D2A63C]/60`}
          >
            {corpo}
          </button>
        ) : (
          <div className={`${moldura} border-dashed border-[#D2A63C]/25 bg-gray-950/60`}>{corpo}</div>
        )}
        {pronto && leitor}
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
