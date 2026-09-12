"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Images, Image as ImgIcon, Download, Upload, Sparkles, UserRound, Send, Share2, Clock, Wand2, RefreshCw } from "lucide-react"

/**
 * Estúdio de cartões — ver antes de publicar, e mexer.
 *
 * A imagem era feita por um cron e não havia forma de a rever nem de a alterar: quem escrevia o
 * post via o texto, e a imagem só aparecia no fim. Uma imagem que não se pode rever é uma imagem
 * que se publica à sorte.
 *
 * A pré-visualização usa a MESMA rota que publica, com os mesmos parâmetros — o que se vê aqui é
 * o ficheiro que sai, e não uma aproximação.
 */

const CONTAS = [
  { handle: "morethanmoney.pt", nome: "@morethanmoney.pt · marca" },
  { handle: "ricardogarciapt", nome: "@ricardogarciapt · pessoal" },
]

export function EstudioCartoes() {
  const [handle, setHandle] = useState("ricardogarciapt")
  const [hook, setHook] = useState("Muda o mindset")
  const [cta, setCta] = useState("MUNDO")
  const [proof, setProof] = useState("")
  const [formato, setFormato] = useState<"post" | "reel">("reel")
  const [fundo, setFundo] = useState("")

  const [aGerar, setAGerar] = useState<"cartao" | "carrossel" | null>(null)
  const [aSubir, setASubir] = useState(false)
  const [porCima, setPorCima] = useState(false)
  const [retrato, setRetrato] = useState<string | null>(null)
  const [temIA, setTemIA] = useState(false)
  const [descricaoIA, setDescricaoIA] = useState("")
  const [comRicardo, setComRicardo] = useState(false)
  const [aPublicar, setAPublicar] = useState(false)
  const [publicado, setPublicado] = useState<string | null>(null)
  const [legenda, setLegenda] = useState("")
  const [destaque, setDestaque] = useState("")
  const [destaquePos, setDestaquePos] = useState<"esquerda" | "centro" | "direita">("direita")
  const [destaqueEscala, setDestaqueEscala] = useState(0.92)
  const [recortes, setRecortes] = useState<string[]>([])
  // Qual camada recebe o que for arrastado ou gerado. Sem isto, largar uma foto no cartão
  // teria de adivinhar se era cenário ou pessoa — e adivinharia mal metade das vezes.
  const [camada, setCamada] = useState<"fundo" | "destaque">("fundo")
  const [tema, setTema] = useState("")
  const [aAssistir, setAAssistir] = useState(false)
  const [passos, setPassos] = useState<string[]>([])
  const [aRefazer, setARefazer] = useState<number | null>(null)
  const [saida, setSaida] = useState<string[]>([])
  const [textos, setTextos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  /**
   * O endereço da pré-visualização.
   *
   * Reconstrói-se a cada tecla — é uma imagem estática do lado do servidor, e vê-la mudar
   * enquanto se escreve é a diferença entre desenhar e adivinhar.
   */
  const previa = useMemo(() => {
    const p = new URLSearchParams({ handle, hook, cta })
    if (proof.trim()) p.set("proof", proof.trim())
    else p.set("proof", "0")
    if (formato === "reel") p.set("formato", "reel")
    if (fundo.trim()) p.set("fundo", fundo.trim())
    if (destaque.trim()) {
      p.set("destaque", destaque.trim())
      p.set("destaquePos", destaquePos)
      p.set("destaqueEscala", String(destaqueEscala))
    }
    return `/api/og/social-card?${p.toString()}`
  }, [handle, hook, cta, proof, formato, fundo, destaque, destaquePos, destaqueEscala])

  // Um reel só faz sentido no pessoal: a marca publica no feed.
  useEffect(() => {
    if (handle === "morethanmoney.pt" && formato === "reel") setFormato("post")
  }, [handle, formato])

  // Saber se já há retrato decide se a opção «com o Ricardo» faz sentido oferecer.
  useEffect(() => {
    fetch("/api/admin/social/estudio-media", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRetrato(j.retrato ?? null); setTemIA(Boolean(j.temIA)); setRecortes(j.recortes ?? []) })
      .catch(() => undefined)
  }, [])

  /**
   * Sobe a fotografia arrastada e põe-na no fundo.
   *
   * `comoRetrato` guarda a MESMA imagem como referência das gerações futuras. É a fotografia
   * dele: serve de fundo agora e evita a pergunta «manda-me outra vez a tua foto» depois.
   */
  const subir = async (ficheiro: File, comoRetrato = false) => {
    setASubir(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("ficheiro", ficheiro)
      if (comoRetrato) fd.append("comoRetrato", "1")
      const r = await fetch("/api/admin/social/estudio-media", { method: "POST", body: fd })
      const j = await r.json()
      if (j.ok) {
        if (comoRetrato) setRetrato(j.url)
        // Uma fotografia largada na camada do destaque é RECORTADA antes de entrar: com fundo,
        // tapava a imagem de baixo e as três camadas voltavam a ser duas.
        if (camada === "destaque" && !comoRetrato) {
          const rr = await fetch("/api/admin/social/estudio-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recortar: j.url }),
          })
          const rj = await rr.json()
          if (rj.ok) { setDestaque(rj.url); setRecortes((x) => [rj.url, ...x]) }
          else { setDestaque(j.url); setErro(rj.erro ?? "não consegui recortar — ficou a foto inteira") }
        } else {
          setFundo(j.url)
        }
      } else setErro(j.erro ?? "a imagem não subiu")
    } catch {
      setErro("a imagem não subiu")
    }
    setASubir(false)
  }

  const pedirFundoIA = async () => {
    setASubir(true)
    setErro(null)
    try {
      const r = await fetch("/api/admin/social/estudio-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricaoIA, formato, comRicardo, camada }),
      })
      const j = await r.json()
      if (j.ok) { if (camada === "destaque") setDestaque(j.url); else setFundo(j.url) }
      else setErro(j.erro ?? "a geração falhou")
    } catch {
      setErro("a geração falhou")
    }
    setASubir(false)
  }

  /**
   * DESCARREGAR.
   *
   * A imagem vive noutra origem, e um `<a download>` para fora do domínio é ignorado pelo
   * browser — abre o separador em vez de guardar. Traz-se o ficheiro para memória e guarda-se
   * a partir daqui, que é a única forma de o nome e a acção serem os que se pediram.
   */
  const descarregar = async (url: string, nome: string) => {
    try {
      const bin = await fetch(url).then((r) => r.blob())
      const obj = URL.createObjectURL(bin)
      const a = document.createElement("a")
      a.href = obj
      a.download = nome
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Sem isto, cada descarga deixa o ficheiro inteiro preso em memória até recarregar a página.
      setTimeout(() => URL.revokeObjectURL(obj), 1000)
    } catch {
      setErro("não consegui descarregar essa imagem")
    }
  }

  const nomeDoFicheiro = (i?: number) =>
    [handle.replace(/\W+/g, "-"), formato, hook.slice(0, 24).trim().replace(/\W+/g, "-").toLowerCase(), i != null ? String(i + 1).padStart(2, "0") : null]
      .filter(Boolean).join("-") + ".png"

  /** Descarrega tudo de uma vez, com uma pausa para o browser não bloquear a segunda. */
  const descarregarTudo = async () => {
    for (let i = 0; i < saida.length; i++) {
      await descarregar(saida[i], nomeDoFicheiro(i))
      if (i < saida.length - 1) await new Promise((r) => setTimeout(r, 400))
    }
  }

  /**
   * PUBLICAR daqui.
   *
   * Entra na MESMA fila que tudo o resto, já aprovada e marcada para agora — o cron apanha-a na
   * passagem seguinte, dentro de cinco minutos. Não é um atalho que salta a fila: é a fila com o
   * passo da aprovação já dado, porque quem carrega neste botão é quem aprovaria.
   *
   * Vai sempre para a conta que está escolhida em cima. Uma imagem desenhada com o desenho da
   * marca publicada na conta pessoal sai errada — e ao contrário também.
   */
  const publicar = async (destino: "funil" | "manual") => {
    if (!saida.length) return
    setAPublicar(true)
    setErro(null)
    setPublicado(null)
    try {
      const r = await fetch("/api/admin/social/estudio-publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          urls: saida,
          caption: legenda.trim() || undefined,
          hook,
          cta,
          destino,
        }),
      })
      const j = await r.json()
      if (j.ok) setPublicado(j.mensagem ?? "na fila — sai dentro de minutos")
      else setErro(j.erro ?? "não foi possível publicar")
    } catch {
      setErro("não foi possível publicar")
    }
    setAPublicar(false)
  }

  /**
   * A PARTILHA DO SISTEMA — o caminho para o Instagram sem API.
   *
   * O Instagram não deixa publicar do browser, e a conta pessoal não recebe automação por
   * decisão da marca. O que resta, e chega, é entregar os ficheiros à folha de partilha do
   * telemóvel: daí escolhe-se o Instagram e publica-se à mão, com a legenda já copiada.
   *
   * `navigator.share` com ficheiros só existe em telemóvel e em HTTPS. No computador não há
   * folha nenhuma para abrir — por isso aí descarrega, que é o mesmo resultado por outro
   * caminho, em vez de um botão que não faz nada.
   */
  const partilhar = async () => {
    if (!saida.length) return
    setErro(null)
    try {
      const ficheiros = await Promise.all(
        saida.map(async (u, i) => {
          const b = await fetch(u).then((r) => r.blob())
          return new File([b], nomeDoFicheiro(i), { type: b.type || "image/png" })
        }),
      )
      const texto = legenda.trim() || hook
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean
        share?: (d: ShareData) => Promise<void>
      }
      if (nav.share && nav.canShare?.({ files: ficheiros })) {
        // A legenda vai junto E para a área de transferência: o Instagram costuma ignorar o
        // texto partilhado, e colar é mais rápido do que voltar aqui buscá-la.
        await navigator.clipboard?.writeText(texto).catch(() => undefined)
        await nav.share({ files: ficheiros, text: texto })
        setPublicado("partilhado — a legenda ficou copiada")
      } else {
        await descarregarTudo()
        setPublicado("o computador não tem folha de partilha — descarreguei em vez disso")
      }
    } catch (e) {
      // Cancelar a folha de partilha lança, e cancelar não é um erro.
      if ((e as Error)?.name !== "AbortError") setErro("não consegui partilhar")
    }
  }

  /**
   * O ASSISTENTE: um clique e sai tudo.
   *
   * Escrever o gancho, escolher a palavra do CTA, pedir o fundo, esperar, gerar as lâminas,
   * escrever a legenda — seis esperas e seis decisões, e a primeira condiciona as outras cinco.
   * Aqui dá-se um tema (ou nem isso) e volta montado. O que continua humano é a decisão final:
   * nada disto se publica sozinho.
   *
   * Os passos aparecem à medida que voltam porque a chamada demora perto de dois minutos, e um
   * botão a girar durante dois minutos parece avariado.
   */
  const assistente = async () => {
    setAAssistir(true)
    setErro(null)
    setPassos([])
    setSaida([])
    try {
      const r = await fetch("/api/admin/social/estudio-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema: tema.trim(), handle, formato, comRicardo }),
      })
      const j = await r.json()
      setPassos(j.passos ?? [])
      if (j.ok) {
        setSaida(j.urls ?? [])
        setTextos(j.textos ?? [])
        setHook(j.hook ?? hook)
        setCta(j.cta ?? cta)
        setLegenda(j.caption ?? "")
        if (j.fundo) setFundo(j.fundo)
        if (j.destaque) setDestaque(j.destaque)
      } else setErro(j.erro ?? "o assistente falhou")
    } catch {
      setErro("o assistente falhou")
    }
    setAAssistir(false)
  }

  /**
   * REFAZER UMA LÂMINA depois de lhe mexer no texto.
   *
   * Só aquela. Gerar o carrossel inteiro por causa de uma palavra na terceira lâmina pedia um
   * fundo NOVO à IA, e a capa mudava por causa de uma correcção no meio.
   */
  const refazerLamina = async (i: number) => {
    setARefazer(i)
    setErro(null)
    try {
      const r = await fetch("/api/admin/social/cartoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "lamina",
          handle,
          indice: i,
          total: textos.length || saida.length,
          hook: textos[i] ?? hook,
          cta,
          // As imagens só existem na capa — refazer uma do meio com elas mudava o desenho.
          ...(i === 0 ? { fundo: fundo.trim() || undefined, destaque: destaque.trim() || undefined, destaquePos, destaqueEscala } : {}),
        }),
      })
      const j = await r.json()
      if (j.ok && j.urls?.[0]) setSaida((x) => x.map((u, k) => (k === i ? j.urls[0] : u)))
      else setErro(j.erro ?? "não consegui refazer essa lâmina")
    } catch {
      setErro("não consegui refazer essa lâmina")
    }
    setARefazer(null)
  }

  const gerar = async (tipo: "cartao" | "carrossel") => {
    setAGerar(tipo)
    setErro(null)
    setSaida([])
    try {
      const r = await fetch("/api/admin/social/cartoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          handle,
          hook,
          cta,
          proof: proof.trim() || undefined,
          formato,
          fundo: fundo.trim() || undefined,
          destaque: destaque.trim() || undefined,
          destaquePos,
          destaqueEscala,
          textos: textos.filter(Boolean),
        }),
      })
      const j = await r.json()
      if (j.ok) {
        setSaida(j.urls ?? [])
        if (Array.isArray(j.textos)) setTextos(j.textos)
      } else setErro(j.erro ?? "não deu")
    } catch {
      setErro("não deu")
    }
    setAGerar(null)
  }

  const campo = "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100"

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Controlos */}
      <div className="space-y-3">
        {/* ── O ASSISTENTE ──────────────────────────────────────────────── */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
          <div className="flex items-center gap-1.5">
            <Wand2 className="h-4 w-4 text-amber-400" />
            <span className="text-[12.5px] font-semibold text-amber-300">Fazer tudo com IA</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-neutral-400">
            Escreve o gancho, as lâminas e a legenda, gera o fundo e monta o carrossel. Depois
            revês e mudas o que quiseres — nada sai sem tu mandares.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !aAssistir && void assistente()}
              placeholder="tema (vazio = escolhe ele)"
              className={campo}
            />
            <button
              type="button"
              onClick={() => void assistente()}
              disabled={aAssistir || aGerar !== null}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-1.5 text-[12.5px] font-bold text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {aAssistir ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {aAssistir ? "A montar…" : "Criar"}
            </button>
          </div>
          {/* Demora perto de dois minutos: um botão a girar todo esse tempo parece avariado. */}
          {passos.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {passos.map((p, i) => (
                <li key={i} className="text-[11.5px] text-neutral-400">· {p}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-neutral-400">Conta</label>
          <select value={handle} onChange={(e) => setHandle(e.target.value)} className={campo}>
            {CONTAS.map((c) => (
              <option key={c.handle} value={c.handle}>{c.nome}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-neutral-500">
            A conta decide o desenho inteiro: a marca sai preta e dourada; o pessoal sai com a
            tipografia em duas faixas.
          </p>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-neutral-400">Frase</label>
          <textarea rows={2} value={hook} onChange={(e) => setHook(e.target.value)} className={campo} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-400">Palavra do CTA</label>
            <input value={cta} onChange={(e) => setCta(e.target.value.toUpperCase())} className={campo} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-400">Formato</label>
            <select
              value={formato}
              onChange={(e) => setFormato(e.target.value as "post" | "reel")}
              disabled={handle === "morethanmoney.pt"}
              className={`${campo} disabled:opacity-40`}
            >
              <option value="post">Post · 4:5</option>
              <option value="reel">Capa de reel · 9:16</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 p-3">
          {/*
            AS TRÊS CAMADAS: fundo, pessoa, texto.
            O texto é sempre o de cima, por isso não se escolhe — o que se escolhe é para onde
            vai a próxima imagem. Sem este interruptor, largar uma foto no cartão teria de
            adivinhar se era cenário ou pessoa, e adivinharia mal metade das vezes.
          */}
          <div className="mb-3 flex gap-1 rounded-md bg-neutral-900 p-1">
            {([["fundo", "Fundo"], ["destaque", "Destaque"]] as const).map(([k, r]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCamada(k)}
                className={`flex-1 rounded px-2 py-1.5 text-[12px] font-semibold transition ${
                  camada === k ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {r}
                {(k === "fundo" ? fundo : destaque) && <span className="ml-1 opacity-60">•</span>}
              </button>
            ))}
          </div>

          {camada === "destaque" && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] uppercase tracking-wide text-neutral-400">
                  Pessoa recortada
                </label>
                {destaque && (
                  <button
                    type="button"
                    onClick={() => setDestaque("")}
                    className="text-[11px] font-medium text-neutral-400 hover:text-red-400 hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={destaquePos}
                  onChange={(e) => setDestaquePos(e.target.value as "esquerda" | "centro" | "direita")}
                  className={`${campo} flex-1`}
                >
                  <option value="esquerda">À esquerda</option>
                  <option value="centro">Ao centro</option>
                  <option value="direita">À direita</option>
                </select>
                <input
                  type="range" min={0.4} max={1.1} step={0.02}
                  value={destaqueEscala}
                  onChange={(e) => setDestaqueEscala(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                  title="Tamanho"
                />
              </div>

              {recortes.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-neutral-500">Já recortados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recortes.slice(0, 12).map((u) => (
                      <button key={u} type="button" onClick={() => setDestaque(u)}
                        className={`h-14 w-14 overflow-hidden rounded border ${destaque === u ? "border-amber-500" : "border-neutral-700"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-neutral-500">
                A foto que largares aqui é recortada antes de entrar. A primeira palavra fica
                atrás da pessoa, a segunda à frente — é isso que dá a profundidade.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-wide text-neutral-400">
              {camada === "destaque" ? "Endereço do recorte" : "Fundo"}
            </label>
            {fundo && (
              <button
                type="button"
                onClick={() => setFundo("")}
                className="text-[11px] font-medium text-neutral-400 underline-offset-2 hover:text-red-400 hover:underline"
              >
                Remover
              </button>
            )}
          </div>

          {/* O endereço continua a poder escrever-se à mão — é como se reaproveita um fundo que
              já existe sem o voltar a subir. */}
          <input
            value={camada === "destaque" ? destaque : fundo}
            onChange={(e) => (camada === "destaque" ? setDestaque(e.target.value) : setFundo(e.target.value))}
            placeholder="arrasta uma imagem para o cartão, ou cola aqui um endereço"
            className={`${campo} mt-1.5`}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] font-medium text-neutral-200 hover:bg-neutral-800">
              <Upload className="h-3.5 w-3.5" />
              {(camada === "destaque" ? destaque : fundo) ? "Trocar" : "Escolher"} imagem
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void subir(f)
                  // Sem isto, escolher o MESMO ficheiro duas vezes seguidas não dispara nada.
                  e.target.value = ""
                }}
              />
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] font-medium text-neutral-200 hover:bg-neutral-800">
              <UserRound className="h-3.5 w-3.5" />
              {retrato ? "Trocar retrato" : "Guardar o meu retrato"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void subir(f, true)
                  e.target.value = ""
                }}
              />
            </label>

            {aSubir && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          </div>

          <p className="mt-2 text-[11px] text-neutral-500">
            Arrasta a fotografia para cima do cartão, à direita — ela entra como fundo. Sem foto,
            a tipografia aguenta sozinha.
          </p>

          {/* ── pedir o fundo à IA ─────────────────────────────────────────── */}
          {temIA && (
            <div className="mt-3 border-t border-neutral-800 pt-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                  Pedir {camada === "destaque" ? "a pessoa" : "o fundo"} à IA
                </span>
              </div>
              <input
                value={descricaoIA}
                onChange={(e) => setDescricaoIA(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !aSubir && descricaoIA.trim().length > 7 && void pedirFundoIA()}
                placeholder={camada === "destaque" ? "ex.: de fato, a falar num palco" : "ex.: escritório escuro ao amanhecer, ecrãs de gráficos ao fundo"}
                className={`${campo} mt-1.5`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex items-center gap-1.5 text-[12px] ${retrato ? "cursor-pointer text-neutral-200" : "cursor-not-allowed text-neutral-600"}`}
                  title={retrato ? "" : "Guarda primeiro um retrato teu"}
                >
                  <input
                    type="checkbox"
                    checked={comRicardo}
                    disabled={!retrato}
                    onChange={(e) => setComRicardo(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  Comigo na imagem
                </label>
                <button
                  type="button"
                  onClick={() => void pedirFundoIA()}
                  disabled={aSubir || descricaoIA.trim().length < 8}
                  className="rounded-md bg-amber-500/90 px-3 py-1.5 text-[12px] font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
                >
                  Gerar {camada === "destaque" ? "pessoa" : "fundo"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500">
                {camada === "destaque"
                  ? "Sai já recortada, pronta a entrar como camada."
                  : "O fundo sai de propósito escuro e vazio ao centro — é onde a frase vai assentar."}
                {!retrato && " Para saíres na imagem, guarda primeiro um retrato teu."}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-neutral-400">Linha de prova</label>
          <input
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder="vazio = sem linha"
            className={campo}
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            Só números que existam. Um número inventado num cartão é uma promessa falsa a circular.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => void gerar("cartao")}
            disabled={aGerar !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {aGerar === "cartao" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImgIcon className="h-4 w-4" />}
            Guardar este cartão
          </button>
          <button
            onClick={() => void gerar("carrossel")}
            disabled={aGerar !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800 disabled:opacity-40"
          >
            {aGerar === "carrossel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
            Gerar carrossel (6+)
          </button>
        </div>

        {erro && <p className="text-xs text-red-400">{erro}</p>}

        {/* As lâminas escritas ficam editáveis: a IA acerta na estrutura e falha no tom, e o tom
            é o que distingue um carrossel dele de um carrossel qualquer. */}
        {textos.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-neutral-800 p-3">
            <p className="text-[11px] uppercase tracking-wide text-neutral-400">
              Lâminas ({textos.length}) — edita e gera outra vez
            </p>
            {textos.map((t, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <textarea
                  rows={2}
                  value={t}
                  onChange={(e) => setTextos((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                  className={`${campo} flex-1 text-[12px]`}
                />
                {/* Refaz SÓ esta. O carrossel inteiro pedia um fundo novo à IA, e a capa mudava
                    por causa de uma correcção no meio. */}
                {saida[i] && (
                  <button
                    type="button"
                    onClick={() => void refazerLamina(i)}
                    disabled={aRefazer !== null}
                    title="Refazer esta lâmina"
                    className="mt-1 shrink-0 rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                  >
                    {aRefazer === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {saida.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
              {saida.length} imagem(ns) guardada(s)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {saida.map((u, i) => (
                <div key={u} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" className="w-full rounded border border-neutral-800" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void descarregar(u, nomeDoFicheiro(i))}
                    title="Descarregar"
                    className="absolute right-1 top-1 rounded-md bg-black/70 p-1.5 text-neutral-200 opacity-0 transition group-hover:opacity-100 hover:text-amber-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <label className="text-[11px] uppercase tracking-wide text-neutral-400">
                Legenda da publicação
              </label>
              <textarea
                rows={3}
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                placeholder="vazio = escrita a partir da frase e da palavra do CTA"
                className={`${campo} mt-1`}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void descarregarTudo()}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] font-medium text-neutral-200 hover:bg-neutral-800"
              >
                <Download className="h-3.5 w-3.5" />
                Descarregar {saida.length > 1 ? "todas" : ""}
              </button>
              {/*
                QUATRO CAMINHOS, e a conta decide quais fazem sentido.

                A conta pessoal não recebe automação — por decisão da marca, não por limitação
                técnica. Por isso os dois botões que escrevem na fila desaparecem nela, e ficam
                os dois que passam pelas mãos dele: descarregar e a folha de partilha do
                telemóvel. Mostrá-los desactivados era oferecer uma coisa que não vai acontecer.
              */}
              {handle !== "ricardogarciapt" && (
                <>
                  <button
                    type="button"
                    onClick={() => void publicar("funil")}
                    disabled={aPublicar}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                    title="Entra na fila já aprovada e sai dentro de minutos"
                  >
                    {aPublicar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Publicar agora
                  </button>
                  <button
                    type="button"
                    onClick={() => void publicar("manual")}
                    disabled={aPublicar}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-[12px] font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                    title="Fica em rascunho para reveres no separador Publicações"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Guardar para rever
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void partilhar()}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-[12px] font-semibold text-neutral-200 hover:bg-neutral-800"
                title="Abre a folha de partilha do telemóvel — daí escolhes o Instagram"
              >
                <Share2 className="h-3.5 w-3.5" />
                Partilhar
              </button>
              {publicado && (
                <span className="text-[12px] text-emerald-400">{publicado}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pré-visualização ao vivo — e o sítio onde se larga a fotografia */}
      <div className="lg:sticky lg:top-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">
            Como vai sair {formato === "reel" ? "· 1080×1920" : "· 1080×1350"}
          </p>
          <button
            type="button"
            onClick={() => void descarregar(previa, nomeDoFicheiro())}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-amber-400"
          >
            <Download className="h-3.5 w-3.5" />
            Descarregar
          </button>
        </div>

        {/*
          LARGAR A FOTOGRAFIA EM CIMA DO CARTÃO.

          É o gesto que toda a gente tenta primeiro — arrastar para cima da coisa que se quer
          mudar, não para um campo de texto ao lado. `onDragOver` tem de chamar `preventDefault`
          ou o browser abre a imagem num separador e perde-se o que se estava a fazer.

          Colar também funciona: uma captura de ecrã vai para a área de transferência e não tem
          ficheiro nenhum para arrastar.
        */}
        <div
          onDragOver={(e) => { e.preventDefault(); setPorCima(true) }}
          onDragLeave={() => setPorCima(false)}
          onDrop={(e) => {
            e.preventDefault()
            setPorCima(false)
            const f = e.dataTransfer.files?.[0]
            if (f?.type.startsWith("image/")) void subir(f)
            else if (f) setErro("isso não é uma imagem")
          }}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files ?? [])[0]
            if (f?.type.startsWith("image/")) void subir(f)
          }}
          tabIndex={0}
          className={`relative overflow-hidden rounded-lg border transition ${
            porCima ? "border-amber-400 ring-2 ring-amber-400/40" : "border-neutral-800"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt="pré-visualização" className="w-full" />

          {(porCima || aSubir) && (
            <div className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[2px]">
              <div className="text-center">
                {aSubir ? (
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-400" />
                ) : (
                  <Upload className="mx-auto h-6 w-6 text-amber-400" />
                )}
                <p className="mt-2 text-[13px] font-semibold text-white">
                  {aSubir ? "A subir…" : camada === "destaque" ? "Larga para recortar a pessoa" : "Larga para pôr no fundo"}
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-neutral-500">
          Arrasta uma fotografia para aqui, ou cola uma captura de ecrã.
        </p>
      </div>
    </div>
  )
}
