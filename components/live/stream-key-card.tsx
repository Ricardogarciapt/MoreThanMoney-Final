"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Copy, Check, RefreshCw, Video } from "lucide-react"

export type StreamKeyCardProps = {
  /** URL do servidor (sem chave) — ex.: rtmp://stream.exemplo.pt/live */
  rtmpUrl: string | null | undefined
  /** Chave única da sala (OBS cola em "Chave de transmissão") */
  streamKey: string | null | undefined
  /** Gera ou atualiza chave se ainda não existir (equivalente a "Gerar chave") */
  onGenerateOrRefresh?: () => void | Promise<void>
  /** Nova chave — invalida a anterior no servidor de ingestão */
  onRegenerate?: () => void | Promise<void>
  loading?: boolean
  className?: string
  /** Título do bloco (por defeito: configuração genérica OBS) */
  title?: string
  /** Texto introdutório (ex.: aviso Restream vs MTM) */
  intro?: string
  /** Rótulo do botão de sincronizar */
  syncButtonLabel?: string
  syncButtonLabelWhenHasKey?: string
  /** Esconder nota de variáveis LMS_INGEST_URL no rodapé */
  hideDeployHint?: boolean
}

/**
 * Cartão de configuração OBS / Streamlabs — alinhado com a arquitetura:
 * Next.js (LMS) gere URL + chave; o software de stream aponta para o servidor RTMP externo.
 */
export default function StreamKeyCard({
  rtmpUrl,
  streamKey,
  onGenerateOrRefresh,
  onRegenerate,
  loading = false,
  className = "",
  title = "Configuração de stream (OBS / Streamlabs)",
  intro,
  syncButtonLabel = "Gerar chave de stream",
  syncButtonLabelWhenHasKey = "Atualizar URL / gerar chave se faltar",
  hideDeployHint = false,
}: StreamKeyCardProps) {
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState<"" | "url" | "key">("")

  const url = (rtmpUrl || "").trim()
  const key = (streamKey || "").trim()
  const hasKey = Boolean(key)

  const copy = async (text: string, field: "url" | "key") => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(field)
      setTimeout(() => setCopied(""), 2000)
    } catch {
      alert("Não foi possível copiar. Seleciona o texto manualmente.")
    }
  }

  return (
    <div
      className={`rounded-xl border border-[#D2A63C]/20 bg-gradient-to-br from-black/60 via-gray-950/80 to-black/40 p-4 space-y-4 ${className}`}
    >
      <div className="flex items-center gap-2 text-[#D2A63C]">
        <Video className="h-4 w-4 shrink-0" />
        <h4 className="text-sm font-semibold text-white">Configuração de stream (OBS / Streamlabs)</h4>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        No OBS: <strong className="text-gray-400">Definições → Stream → Serviço: Personalizado</strong>. Cola o{" "}
        <em>servidor</em> e a <em>chave</em> em campos <strong>separados</strong> (não numa única linha).
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-800 text-xs">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-800 bg-black/40 text-gray-500">
              <th className="p-2 font-medium">Campo OBS</th>
              <th className="p-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="text-gray-300">
            <tr className="border-b border-gray-800/80">
              <td className="p-2 whitespace-nowrap text-gray-500">Servidor</td>
              <td className="p-2 font-mono text-[11px] break-all">{url || "— gera chave abaixo ou pede ao admin —"}</td>
            </tr>
            <tr>
              <td className="p-2 whitespace-nowrap text-gray-500">Chave</td>
              <td className="p-2 font-mono text-[11px] break-all">
                {hasKey ? (keyVisible ? key : "•".repeat(Math.min(key.length, 32))) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-gray-500">URL do servidor RTMP</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} className="border-gray-700 bg-black/50 font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-gray-600 text-gray-200"
              disabled={!url}
              onClick={() => copy(url, "url")}
            >
              {copied === "url" ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied === "url" ? "Copiado" : "Copiar"}</span>
            </Button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-gray-500">Chave de transmissão</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              type={keyVisible ? "text" : "password"}
              value={key}
              placeholder="Ainda sem chave — gera uma abaixo"
              className="border-gray-700 bg-black/50 font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-gray-600 text-gray-200"
                disabled={!hasKey}
                onClick={() => setKeyVisible((v) => !v)}
              >
                {keyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-gray-600 text-gray-200"
                disabled={!hasKey}
                onClick={() => copy(key, "key")}
              >
                {copied === "key" ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {onGenerateOrRefresh && (
          <Button
            type="button"
            size="sm"
            disabled={loading}
            className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
            onClick={() => onGenerateOrRefresh()}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {hasKey ? syncButtonLabelWhenHasKey : syncButtonLabel}
          </Button>
        )}
        {onRegenerate && hasKey && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            className="border-amber-700/50 text-amber-200"
            onClick={() => onRegenerate()}
          >
            Regenerar chave (invalida a anterior)
          </Button>
        )}
      </div>

      {onRegenerate && hasKey && (
        <p className="text-[11px] text-amber-200/80">
          Ao regenerar, o OBS deixa de autenticar até colares a nova chave. O servidor externo (RTMP) deve aceitar a nova key.
        </p>
      )}

      {!hideDeployHint && (
        <p className="text-[11px] text-gray-600">
          Variáveis no deploy: <code className="text-gray-500">LMS_INGEST_URL</code> (URL completa) ou{" "}
          <code className="text-gray-500">RTMP_SERVER_HOST</code> (hostname → <code className="text-gray-500">rtmp://HOST/live</code>).
        </p>
      )}
    </div>
  )
}
