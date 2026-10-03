"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Save, GraduationCap } from "lucide-react"

/**
 * VÍDEOS «APRENDE A USAR …» — um por destino do site.
 *
 * A lista de destinos vem do registo da navbar (lib/navegacao.ts) pela rota do admin: o painel não
 * tem nenhuma lista de páginas escrita à mão. Um destino novo na navbar aparece aqui sozinho, e um
 * destino que saia da navbar deixa de mostrar botão sem ninguém ter de limpar nada.
 */

type LinhaDestino = {
  id: string
  href: string
  rotuloPt: string
  grupo: string
  url: string
  tipo: string | null
  rotulo: string
  ativo: boolean
  textoBotao: string
}

const NOMES_GRUPO: Record<string, string> = {
  topo: "Principais",
  apresentacoes: "Apresentações",
  educacao: "Educação",
  trading: "Trading",
  apps: "Apps IA",
}

const NOMES_TIPO: Record<string, string> = {
  youtube: "Vídeo YouTube",
  playlist: "Playlist YouTube",
  hls: "Gravação MTM (HLS)",
}

type Sala = {
  id: string
  title: string
  description: string | null
  thumbnail_url: string | null
  square_image_url: string | null
  playlist_url: string | null
  playlist_title: string | null
  dvr_playlist_title: string | null
  dvr_playlist_url: string | null
  stream_key: string | null
}

/**
 * A SALA «INTRODUÇÃO» edita-se aqui e não no painel das sessões.
 *
 * O painel das sessões (tab=education) está organizado por educador, e esta sala não tem educador
 * nenhum — ficaria simplesmente invisível lá. O assunto dela é este: introduções.
 */
function CartaoSalaIntroducao() {
  const { toast } = useToast()
  const [sala, setSala] = useState<Sala | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [aGravar, setAGravar] = useState(false)
  const [capaOmissao, setCapaOmissao] = useState("")

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch("/api/admin/sala-introducao", { credentials: "include" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || "Falha a carregar")
      setSala(j?.sala ?? null)
      setCapaOmissao(String(j?.capaPorOmissao || ""))
      setErro(j?.sala ? null : "A sala ainda não existe — falta aplicar a migração 100.")
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const gravar = async () => {
    if (!sala) return
    setAGravar(true)
    try {
      const r = await fetch("/api/admin/sala-introducao", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist_url: sala.playlist_url || "",
          playlist_title: sala.playlist_title || "",
          description: sala.description || "",
          dvr_playlist_title: sala.dvr_playlist_title || "",
          capa: sala.square_image_url || "",
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || "Falha a gravar")
      setSala(j?.sala ?? sala)
      toast({ title: "✅ Guardado", description: "Sala «Introdução» atualizada." })
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGravar(false)
    }
  }

  const mudar = (campo: keyof Sala, valor: string) =>
    setSala((s) => (s ? { ...s, [campo]: valor } : s))

  return (
    <Card className="border-mtm-primary bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-mtm-primary">
          <GraduationCap className="h-4 w-4" />
          Sala «Introdução» — o curso de arranque
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aCarregar ? (
          <p className="text-sm text-gray-400">A carregar…</p>
        ) : !sala ? (
          <p className="text-sm text-amber-400">{erro}</p>
        ) : (
          <>
            <p className="text-sm text-gray-400">
              Esta sala nunca aparece «em direto» em lado nenhum. Mostra a playlist abaixo no
              /onboarding, no lobby das sessões e no /FreeSession. Se transmitires para ela por OBS,
              a gravação segue para o DVR e sobe ao YouTube para a playlist das gravações.
            </p>

            <label className="block text-xs font-medium text-gray-400">
              Playlist do curso (o que os alunos veem)
              <Input
                value={sala.playlist_url || ""}
                onChange={(e) => mudar("playlist_url", e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=…"
                className="mt-1 border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-gray-400">
                Título do curso
                <Input
                  value={sala.playlist_title || ""}
                  onChange={(e) => mudar("playlist_title", e.target.value)}
                  placeholder="Como usar a MoreThanMoney"
                  className="mt-1 border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
                />
              </label>
              <label className="block text-xs font-medium text-gray-400">
                Playlist do YouTube que recebe as GRAVAÇÕES
                <Input
                  value={sala.dvr_playlist_title || ""}
                  onChange={(e) => mudar("dvr_playlist_title", e.target.value)}
                  placeholder="MTM Introdução"
                  className="mt-1 border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-gray-400">
              Capa da sala (vazio = {capaOmissao || "capa por omissão"})
              <Input
                value={sala.square_image_url || ""}
                onChange={(e) => mudar("square_image_url", e.target.value)}
                className="mt-1 border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
              />
            </label>

            <label className="block text-xs font-medium text-gray-400">
              Descrição (aparece no cartão e no leitor)
              <Input
                value={sala.description || ""}
                onChange={(e) => mudar("description", e.target.value)}
                className="mt-1 border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void gravar()}
                disabled={aGravar}
                className="bg-mtm-primary text-black hover:bg-mtm-primary-dark"
              >
                <Save className="mr-2 h-4 w-4" />
                {aGravar ? "A guardar…" : "Guardar sala"}
              </Button>
              {sala.stream_key && (
                <span className="text-xs text-gray-500">
                  Chave de OBS: <code className="text-gray-300">{sala.stream_key}</code>
                </span>
              )}
              {sala.dvr_playlist_url && (
                <a
                  href={sala.dvr_playlist_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-mtm-primary underline"
                >
                  Ver as gravações no YouTube
                </a>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function VideosIntroManager() {
  const { toast } = useToast()
  const [linhas, setLinhas] = useState<LinhaDestino[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aGravar, setAGravar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch("/api/admin/videos-intro", { credentials: "include" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || "Falha a carregar")
      setLinhas(Array.isArray(j?.destinos) ? j.destinos : [])
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setACarregar(false)
    }
  }, [toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const mudar = (id: string, campo: keyof LinhaDestino, valor: unknown) => {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)))
  }

  const gravar = async (linha: LinhaDestino) => {
    setAGravar(linha.id)
    try {
      const r = await fetch("/api/admin/videos-intro", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino: linha.id,
          url: linha.url,
          rotulo: linha.rotulo,
          ativo: linha.ativo,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || "Falha a gravar")
      setLinhas((atual) =>
        atual.map((l) =>
          l.id === linha.id
            ? { ...l, tipo: j?.tipo ?? null, textoBotao: j?.textoBotao ?? l.textoBotao }
            : l,
        ),
      )
      toast({
        title: "✅ Guardado",
        description: j?.removido
          ? `${linha.rotuloPt}: link removido.`
          : `${linha.rotuloPt}: ${linha.ativo ? "botão ligado" : "guardado, botão desligado"}.`,
      })
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGravar(null)
    }
  }

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, LinhaDestino[]>()
    for (const l of linhas) {
      const lista = mapa.get(l.grupo) || []
      lista.push(l)
      mapa.set(l.grupo, lista)
    }
    return Array.from(mapa.entries())
  }, [linhas])

  const ligados = linhas.filter((l) => l.ativo).length

  if (aCarregar) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
        <RefreshCw className="h-5 w-5 animate-spin text-mtm-primary" />
        A carregar destinos…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <CartaoSalaIntroducao />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">
            Cola um link (YouTube ou uma gravação nossa <code className="text-gray-300">.m3u8</code>) e liga o
            interruptor. O destino passa a mostrar o botão «Aprende a usar …» com o leitor por cima.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            A lista vem da navbar. {ligados} de {linhas.length} destinos com botão ligado.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Recarregar
        </Button>
      </div>

      {porGrupo.map(([grupo, lista]) => (
        <Card key={grupo} className="border-mtm-primary/30 bg-gray-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-mtm-primary">{NOMES_GRUPO[grupo] || grupo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lista.map((l) => (
              <div key={l.id} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{l.rotuloPt}</p>
                    <p className="truncate text-xs text-gray-500">{l.href}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.tipo && (
                      <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">
                        {NOMES_TIPO[l.tipo] || l.tipo}
                      </Badge>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={l.ativo}
                        onChange={(e) => mudar(l.id, "ativo", e.target.checked)}
                        className="h-4 w-4 accent-[#D2A63C]"
                      />
                      Mostrar botão
                    </label>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
                  <Input
                    value={l.url}
                    onChange={(e) => mudar(l.id, "url", e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=… ou https://…/playlist?list=… ou …/stream.m3u8"
                    className="border-gray-700 bg-gray-900 text-white placeholder:text-gray-600"
                  />
                  <Input
                    value={l.rotulo}
                    onChange={(e) => mudar(l.id, "rotulo", e.target.value)}
                    placeholder="texto do botão (opcional)"
                    className="border-gray-700 bg-gray-900 text-white placeholder:text-gray-600"
                  />
                  <Button
                    onClick={() => void gravar(l)}
                    disabled={aGravar === l.id}
                    className="bg-mtm-primary text-black hover:bg-mtm-primary-dark"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {aGravar === l.id ? "A guardar…" : "Guardar"}
                  </Button>
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                  <GraduationCap className="h-3.5 w-3.5 text-mtm-primary/70" />
                  O botão vai ler: <span className="text-gray-300">«{l.textoBotao}»</span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
