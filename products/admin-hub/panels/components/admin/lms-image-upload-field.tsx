"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { avaliarRacio } from "@/lib/lms/capa-academia"

export type LmsImageScope =
  | "educator_avatar"
  | "stream_thumbnail"
  | "stream_square"
  | "playlist_cover"
  | "academy_cover"

export function LmsImageUploadField({
  label,
  description,
  value,
  onUrlChange,
  scope,
  refId,
  /**
   * A forma da pré-visualização. `"16:9"` nas capas, porque é a forma com que a secção as mostra:
   * uma miniatura quadrada deixava publicar uma capa que só se vê deformada em produção.
   */
  aspect = "square",
  /** immediate = cada alteração no campo (formulários); blur = só ao sair do campo ou após upload (evita PATCH por tecla) */
  commit = "immediate",
  /** endpoint de upload — admin por defeito; o studio passa a rota do educador */
  uploadUrl = "/api/admin/live-sessions/upload-image",
}: {
  label: string
  description?: string
  value: string
  onUrlChange: (url: string) => void
  scope: LmsImageScope
  /** UUID do educador ou do stream (opcional); organiza pastas no storage */
  refId?: string | null
  aspect?: "square" | "16:9"
  commit?: "immediate" | "blur"
  uploadUrl?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(value)
  /** O que a imagem que está à frente tem de errado sem dar erro: rácio torto ou não carregar. */
  const [avisoImagem, setAvisoImagem] = useState<string | null>(null)

  useEffect(() => {
    setDraft(value)
    setAvisoImagem(null)
  }, [value])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError(null)
    if (file.size > 5 * 1024 * 1024) {
      setError("Máximo 5 MB.")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("scope", scope)
      if (refId?.trim()) fd.append("refId", refId.trim())
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Upload falhou.")
        return
      }
      if (typeof j.url === "string" && j.url) {
        setDraft(j.url)
        onUrlChange(j.url)
      }
    } catch {
      setError("Erro de rede.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-gray-300">{label}</Label>
        {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={commit === "blur" ? draft : value}
          onChange={(e) => {
            const v = e.target.value
            if (commit === "blur") setDraft(v)
            else onUrlChange(v)
          }}
          onBlur={() => {
            if (commit === "blur" && draft !== value) onUrlChange(draft)
          }}
          placeholder="https://… ou carrega abaixo"
          className="min-w-[200px] flex-1 border-gray-700 bg-gray-950 text-white"
        />
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[#D2A63C]/40 text-gray-200 shrink-0"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "A carregar…" : "Carregar imagem"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {/* Rácio torto e imagem que não carrega são AVISOS: nenhum dos dois dá erro em sítio nenhum,
          e nenhum dos dois é razão para impedir o dono de publicar o que quer. */}
      {avisoImagem && <p className="text-xs text-[#E9C46A]">{avisoImagem}</p>}
      {(commit === "blur" ? draft : value).trim() ? (
        <div
          className={
            aspect === "16:9"
              ? "aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-gray-600 bg-black"
              : "h-24 w-24 overflow-hidden rounded-lg border border-gray-600 bg-black"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={(commit === "blur" ? draft : value).trim()}
            alt=""
            className="h-full w-full object-cover"
            onLoad={(e) => {
              // Mede-se a imagem JÁ CARREGADA, e não o ficheiro escolhido: assim também se apanha
              // um URL colado à mão, que é por onde entram as capas tortas que ninguém carregou.
              const img = e.currentTarget
              if (aspect !== "16:9") return setAvisoImagem(null)
              setAvisoImagem(avaliarRacio(img.naturalWidth, img.naturalHeight).aviso)
            }}
            onError={() => {
              setAvisoImagem("Esta imagem não carrega — o endereço aponta para um ficheiro que não existe.")
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
