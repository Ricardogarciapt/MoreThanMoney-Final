"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Images, Image as ImgIcon } from "lucide-react"

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
    return `/api/og/social-card?${p.toString()}`
  }, [handle, hook, cta, proof, formato, fundo])

  // Um reel só faz sentido no pessoal: a marca publica no feed.
  useEffect(() => {
    if (handle === "morethanmoney.pt" && formato === "reel") setFormato("post")
  }, [handle, formato])

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

        <div>
          <label className="text-[11px] uppercase tracking-wide text-neutral-400">Fotografia de fundo</label>
          <input
            value={fundo}
            onChange={(e) => setFundo(e.target.value)}
            placeholder="endereço da imagem (opcional)"
            className={campo}
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            É assim que fica igual às tuas capas de reel. Sem foto, a tipografia aguenta sozinha.
          </p>
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
              <textarea
                key={i}
                rows={2}
                value={t}
                onChange={(e) => setTextos((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                className={`${campo} text-[12px]`}
              />
            ))}
          </div>
        )}

        {saida.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
              {saida.length} imagem(ns) guardada(s)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {saida.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="" className="w-full rounded border border-neutral-800" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pré-visualização ao vivo */}
      <div className="lg:sticky lg:top-4">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
          Como vai sair {formato === "reel" ? "· 1080×1920" : "· 1080×1350"}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previa}
          alt="pré-visualização"
          className="w-full rounded-lg border border-neutral-800"
        />
      </div>
    </div>
  )
}
