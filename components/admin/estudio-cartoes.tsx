"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Images, Image as ImgIcon, Download, Upload, Sparkles, UserRound, Send, Share2, Clock, Wand2, RefreshCw, FolderOpen, Trash2, Move, X, Pencil } from "lucide-react"
import EditorArrastavel, { type Posicoes } from "@/components/mtmsocial/editor-arrastavel"

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

/** Uma peça guardada na galeria do estúdio (tabela `estudio_pecas`). */
interface PecaEstudio {
  id: string
  handle: string
  formato: "post" | "reel"
  tipo: "cartao" | "carrossel"
  urls: string[]
  textos: string[]
  params: {
    hook?: string
    cta?: string
    proof?: string
    fundo?: string
    destaque?: string
    destaquePos?: "esquerda" | "centro" | "direita"
    destaqueEscala?: number
    posicoes?: Posicoes | null
    caption?: string
  }
  created_at: string
}

/**
 * O estilo de cada conta, para o editor arrastável.
 *
 * Tem de bater com o desenho de `lib/social-card`: o pessoal é ciano com «@ricardogarciapt»
 * (ACENTO/ASSINATURA do `cartaoRicardo`); a marca é dourada.
 *
 * Só o estilo TIPOGRÁFICO (o pessoal) aceita posições — o cartão da marca tem uma composição
 * fixa, centrada, e ignora-as. Oferecer o editor aí era mostrar um arrasto que não dá em nada.
 */
function estiloDaConta(handle: string) {
  const pessoal = handle.replace(/^@/, "").toLowerCase().includes("ricardo")
  return {
    movel: pessoal,
    cor: pessoal ? "#0097b2" : "#D2A63C",
    assinatura: pessoal ? "@ricardogarciapt" : "@morethanmoney.pt",
  }
}

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

  // ── a galeria e o editor ──────────────────────────────────────────────────
  const [galeria, setGaleria] = useState<PecaEstudio[]>([])
  /** A peça que está no estúdio agora. Mexer-lhe ACTUALIZA-A, não cria outra. */
  const [pecaId, setPecaId] = useState<string | null>(null)
  /** Como a saída actual foi gerada — é isso que decide como se refaz a capa. */
  const [saidaInfo, setSaidaInfo] = useState<{ tipo: "cartao" | "carrossel"; formato: "post" | "reel" } | null>(null)
  const [posicoes, setPosicoes] = useState<Posicoes | null>(null)
  const [aEditar, setAEditar] = useState(false)
  const [pecaAberta, setPecaAberta] = useState<PecaEstudio | null>(null)

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

  const carregarGaleria = useCallback(async () => {
    try {
      const j = await fetch("/api/admin/social/estudio-pecas", { cache: "no-store" }).then((r) => r.json())
      setGaleria(j.pecas ?? [])
    } catch {
      /* uma galeria vazia não impede criar */
    }
  }, [])

  useEffect(() => { void carregarGaleria() }, [carregarGaleria])

  /**
   * GUARDA a peça na galeria, depois de o resultado chegar.
   *
   * Recebe os valores explicitamente e não os lê do estado: logo a seguir a um `setX` o estado
   * ainda é o antigo, e guardava-se a peça com o texto de antes.
   *
   * Uma falha aqui não é um erro do estúdio — a imagem já existe e está no ecrã. Só não fica na
   * galeria.
   */
  const guardarPeca = async (peca: Omit<PecaEstudio, "id" | "created_at">, id: string | null) => {
    try {
      const r = await fetch("/api/admin/social/estudio-pecas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...peca, id: id ?? undefined }),
      })
      const j = await r.json()
      if (j.ok && j.peca) {
        const nova = j.peca as PecaEstudio
        setPecaId(nova.id)
        setGaleria((g) => [nova, ...g.filter((x) => x.id !== nova.id)].slice(0, 60))
      }
    } catch {
      /* a imagem continua no ecrã; só não entrou na galeria */
    }
  }

  /** A peça tal como está no estúdio agora, com o que se lhe quiser sobrepor. */
  const pecaActual = (sobre: Partial<Omit<PecaEstudio, "id" | "created_at">> & { params?: Partial<PecaEstudio["params"]> } = {}) => {
    const { params: pSobre, ...resto } = sobre
    return {
      handle,
      formato: saidaInfo?.formato ?? formato,
      tipo: saidaInfo?.tipo ?? (saida.length > 1 ? "carrossel" : "cartao"),
      urls: saida,
      textos,
      ...resto,
      params: {
        hook, cta, proof: proof.trim() || undefined,
        fundo: fundo.trim() || undefined,
        destaque: destaque.trim() || undefined,
        destaquePos, destaqueEscala, posicoes, caption: legenda,
        ...pSobre,
      },
    } as Omit<PecaEstudio, "id" | "created_at">
  }

  /**
   * REABRE uma peça da galeria no estúdio — textos, camadas, posições e imagens.
   * Daqui em diante, mexer-lhe actualiza essa linha.
   */
  const abrirPeca = (p: PecaEstudio, comEditor = false) => {
    const c = p.params ?? {}
    setHandle(p.handle)
    setFormato(p.formato === "reel" ? "reel" : "post")
    setHook(c.hook ?? "")
    setCta(c.cta ?? "")
    setProof(c.proof ?? "")
    setFundo(c.fundo ?? "")
    setDestaque(c.destaque ?? "")
    setDestaquePos(c.destaquePos ?? "direita")
    setDestaqueEscala(c.destaqueEscala ?? 0.92)
    setPosicoes(c.posicoes ?? null)
    setLegenda(c.caption ?? "")
    setTextos(Array.isArray(p.textos) ? p.textos : [])
    setSaida(p.urls ?? [])
    setSaidaInfo({ tipo: p.tipo, formato: p.formato })
    setPecaId(p.id)
    setPublicado(null)
    setErro(null)
    setPassos([])
    setPecaAberta(null)
    if (comEditor && estiloDaConta(p.handle).movel) setAEditar(true)
  }

  const apagarPeca = async (id: string) => {
    if (!window.confirm("Apagar esta peça da galeria? As imagens já partilhadas continuam a funcionar.")) return
    try {
      const j = await fetch(`/api/admin/social/estudio-pecas?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => r.json())
      if (!j.ok) { setErro(j.erro ?? "não consegui apagar"); return }
      setGaleria((g) => g.filter((x) => x.id !== id))
      if (pecaId === id) setPecaId(null)
      setPecaAberta(null)
    } catch {
      setErro("não consegui apagar")
    }
  }

  /**
   * APLICAR as posições arrastadas: o servidor redesenha SÓ a capa e troca-a na posição 0.
   *
   * Um cartão refaz-se como cartão (mantém o formato, reel incluído); num carrossel refaz-se a
   * lâmina 0 — as outras não têm camadas para mover e ficam como estão.
   */
  const aplicarPosicoes = async (novas: Posicoes) => {
    if (!saida.length) return
    setErro(null)
    const tipo = saidaInfo?.tipo ?? (saida.length > 1 ? "carrossel" : "cartao")
    const formatoSaida = saidaInfo?.formato ?? formato
    const camadas = {
      fundo: fundo.trim() || undefined,
      destaque: destaque.trim() || undefined,
      destaquePos,
      destaqueEscala,
    }
    try {
      const r = await fetch("/api/admin/social/cartoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tipo === "cartao"
            ? { tipo: "cartao", handle, hook, cta, proof: proof.trim() || undefined, formato: formatoSaida, ...camadas, posicoes: novas }
            : { tipo: "lamina", handle, indice: 0, total: textos.length || saida.length, hook: textos[0] ?? hook, cta, ...camadas, posicoes: novas },
        ),
      })
      const j = await r.json()
      if (j.ok && j.urls?.[0]) {
        const urls = saida.map((u, k) => (k === 0 ? (j.urls[0] as string) : u))
        setSaida(urls)
        setPosicoes(novas)
        await guardarPeca(pecaActual({ urls, tipo, formato: formatoSaida, params: { posicoes: novas } }), pecaId)
      } else setErro(j.erro ?? "não consegui redesenhar a capa")
    } catch {
      setErro("não consegui redesenhar a capa")
    }
    // Fecha sempre: um erro escondido atrás do editor é um erro que ninguém lê.
    setAEditar(false)
  }

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
    setPosicoes(null)
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
        if (j.destaque) { setDestaque(j.destaque); setDestaquePos("direita"); setDestaqueEscala(0.9) }
        // O assistente monta sempre um carrossel, e as lâminas saem sempre a 4:5.
        setSaidaInfo({ tipo: "carrossel", formato: "post" })
        if (Array.isArray(j.urls) && j.urls.length) {
          await guardarPeca({
            handle,
            formato: "post",
            tipo: "carrossel",
            urls: j.urls,
            textos: j.textos ?? [],
            params: {
              hook: j.hook ?? hook,
              cta: j.cta ?? cta,
              fundo: j.fundo || fundo.trim() || undefined,
              destaque: j.destaque || destaque.trim() || undefined,
              destaquePos: j.destaque ? "direita" : destaquePos,
              destaqueEscala: j.destaque ? 0.9 : destaqueEscala,
              posicoes: null,
              caption: j.caption ?? "",
            },
          }, null)
        }
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
          ...(i === 0 ? { fundo: fundo.trim() || undefined, destaque: destaque.trim() || undefined, destaquePos, destaqueEscala, posicoes: posicoes ?? undefined } : {}),
        }),
      })
      const j = await r.json()
      if (j.ok && j.urls?.[0]) {
        const urls = saida.map((u, k) => (k === i ? (j.urls[0] as string) : u))
        setSaida(urls)
        if (pecaId) await guardarPeca(pecaActual({ urls }), pecaId)
      } else setErro(j.erro ?? "não consegui refazer essa lâmina")
    } catch {
      setErro("não consegui refazer essa lâmina")
    }
    setARefazer(null)
  }

  const gerar = async (tipo: "cartao" | "carrossel") => {
    setAGerar(tipo)
    setErro(null)
    setSaida([])
    // Uma geração nova parte da pré-visualização, que não conhece posições arrastadas: o que se
    // vê à direita tem de ser o que sai.
    setPosicoes(null)
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
        // O carrossel sai sempre a 4:5; só o cartão respeita o formato escolhido.
        const formatoSaida = tipo === "carrossel" ? "post" : formato
        setSaidaInfo({ tipo, formato: formatoSaida })
        if (Array.isArray(j.urls) && j.urls.length) {
          await guardarPeca({
            handle,
            formato: formatoSaida,
            tipo,
            urls: j.urls,
            textos: Array.isArray(j.textos) ? j.textos : tipo === "carrossel" ? textos.filter(Boolean) : [],
            params: {
              hook, cta, proof: proof.trim() || undefined,
              fundo: fundo.trim() || undefined,
              destaque: destaque.trim() || undefined,
              destaquePos, destaqueEscala, posicoes: null, caption: legenda,
            },
          }, null)
        }
      } else setErro(j.erro ?? "não deu")
    } catch {
      setErro("não deu")
    }
    setAGerar(null)
  }

  const campo = "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100"

  const estilo = estiloDaConta(handle)

  return (
    <div className="space-y-6">
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
              {saida.length} imagem(ns) guardada(s){pecaId ? " · na galeria" : ""}
            </p>
            {!estilo.movel && (
              <p className="mb-1.5 text-[11px] text-neutral-500">
                O cartão da marca tem a composição fixa — o editor de posições só existe no pessoal.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {saida.map((u, i) => (
                <div key={u} className="group relative">
                  {/*
                    A CAPA abre o editor arrastável — é onde estão as camadas para mover. As outras
                    lâminas continuam a abrir a imagem num separador.
                  */}
                  {i === 0 && estilo.movel ? (
                    <button type="button" onClick={() => setAEditar(true)} title="Mover texto e pessoa" className="block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="w-full rounded border border-neutral-800 group-hover:border-amber-500/60" />
                      <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-1 text-[10.5px] font-semibold text-amber-300">
                        <Move className="h-3 w-3" /> Mover
                      </span>
                    </button>
                  ) : (
                    <a href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="w-full rounded border border-neutral-800" />
                    </a>
                  )}
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
                // A legenda escrita à mão também fica na peça — reabrir e perdê-la era refazê-la.
                onBlur={() => { if (pecaId && saida.length) void guardarPeca(pecaActual(), pecaId) }}
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

      {/* ── a galeria ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-neutral-800 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-neutral-200">
            <FolderOpen className="h-4 w-4 text-amber-400" />
            O que já se fez no estúdio ({galeria.length})
          </span>
          <button type="button" onClick={() => void carregarGaleria()} className="text-neutral-500 hover:text-neutral-200" title="Actualizar">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {galeria.length === 0 ? (
          <p className="text-[11.5px] text-neutral-500">Cada cartão ou carrossel gerado fica guardado aqui.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {galeria.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPecaAberta(p)}
                className={`group relative overflow-hidden rounded border text-left ${pecaId === p.id ? "border-amber-500" : "border-neutral-800 hover:border-neutral-600"}`}
              >
                {p.urls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.urls[0]} alt="" className={`w-full object-cover ${p.formato === "reel" ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4">
                  <span className="block truncate text-[10.5px] font-medium text-neutral-100">{p.params?.hook || p.textos?.[0] || "sem título"}</span>
                  <span className="block text-[9.5px] text-neutral-400">
                    {p.handle === "morethanmoney.pt" ? "marca" : "pessoal"} · {p.urls.length} {p.urls.length === 1 ? "imagem" : "imagens"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── a peça aberta ─────────────────────────────────────────────────── */}
      {pecaAberta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={() => setPecaAberta(null)}>
          <div className="flex items-center justify-between gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{pecaAberta.params?.hook || pecaAberta.textos?.[0] || "sem título"}</p>
              <p className="text-[11px] text-white/50">
                @{pecaAberta.handle} · {pecaAberta.tipo === "carrossel" ? "carrossel" : pecaAberta.formato === "reel" ? "capa de reel" : "cartão"} · {new Date(pecaAberta.created_at).toLocaleString("pt-PT")}
              </p>
            </div>
            <button type="button" onClick={() => setPecaAberta(null)} className="rounded-lg p-2 text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3">
              {pecaAberta.urls.map((u, i) => (
                <div key={u} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full rounded border border-white/10" />
                  <button
                    type="button"
                    onClick={() =>
                      void descarregar(
                        u,
                        [pecaAberta.handle.replace(/\W+/g, "-"), pecaAberta.formato, (pecaAberta.params?.hook ?? "").slice(0, 24).trim().replace(/\W+/g, "-").toLowerCase(), String(i + 1).padStart(2, "0")]
                          .filter(Boolean).join("-") + ".png",
                      )
                    }
                    title="Descarregar"
                    className="absolute right-1 top-1 rounded-md bg-black/70 p-1.5 text-neutral-200 hover:text-amber-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {pecaAberta.params?.caption && (
              <p className="mx-auto mt-3 max-w-5xl whitespace-pre-wrap text-[12px] text-white/60">{pecaAberta.params.caption}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-6 pt-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={async () => {
                const p = pecaAberta
                for (let i = 0; i < p.urls.length; i++) {
                  await descarregar(p.urls[i], `${p.handle.replace(/\W+/g, "-")}-${p.formato}-${String(i + 1).padStart(2, "0")}.png`)
                  if (i < p.urls.length - 1) await new Promise((r) => setTimeout(r, 400))
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-white/10"
            >
              <Download className="h-4 w-4" />
              Descarregar {pecaAberta.urls.length > 1 ? "todas" : ""}
            </button>
            <button
              type="button"
              onClick={() => abrirPeca(pecaAberta)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-white/10"
            >
              <Pencil className="h-4 w-4" />
              Reabrir no estúdio
            </button>
            {estiloDaConta(pecaAberta.handle).movel && (
              <button
                type="button"
                onClick={() => abrirPeca(pecaAberta, true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-[12.5px] font-bold text-black hover:bg-amber-400"
              >
                <Move className="h-4 w-4" />
                Mover texto e pessoa
              </button>
            )}
            <button
              type="button"
              onClick={() => void apagarPeca(pecaAberta.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-2 text-[12.5px] font-semibold text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Apagar
            </button>
          </div>
        </div>
      )}

      {/* ── o editor arrastável ───────────────────────────────────────────── */}
      {aEditar && saida.length > 0 && estilo.movel && (
        <EditorArrastavel
          dados={{
            hook: (saidaInfo?.tipo ?? (saida.length > 1 ? "carrossel" : "cartao")) === "carrossel" ? textos[0] || hook : hook,
            cta,
            cor: estilo.cor,
            assinatura: estilo.assinatura,
            fundo: fundo.trim() || null,
            destaque: destaque.trim() || null,
            destaqueEscala,
            logoUrl: null,
            formato: saidaInfo?.formato ?? formato,
            posicoes,
          }}
          aoAplicar={aplicarPosicoes}
          aoFechar={() => setAEditar(false)}
        />
      )}
    </div>
  )
}
