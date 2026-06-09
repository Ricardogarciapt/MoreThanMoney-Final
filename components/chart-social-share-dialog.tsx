"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  isNativeTradingViewShareUrl,
  normalizeNativeTradingViewShareUrl,
} from "@/lib/chart-share-capture"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { CHART_SOCIAL_CATEGORIES, type ChartSocialCategory } from "@/lib/chart-social-category"
import {
  captureNativeTradingViewImage,
  copyChartImageToClipboard,
} from "@/lib/chart-share-capture"
import {
  buildSharePreviewText,
  prepareChartSocialShare,
  publishChartToSocial,
  type ChartSharePrepareInput,
} from "@/lib/chart-social-share-service"
import type { ChartShareTradeDraft, TradeDirection } from "@/lib/chart-share-trade"
import type { ChartUrlFallback } from "@/lib/chart-share-capture"

type DialogPhase = "idle" | "loading" | "ready" | "publishing" | "success" | "error"

export type ChartSocialSharePrefetch = {
  image: string | null
  chartUrl: string | null
}

type ChartSocialShareDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol: string
  widgetLoaded: boolean
  getChart: () => unknown
  getWidget: () => unknown
  chartContainer?: HTMLElement | null
  urlFallback: ChartUrlFallback
  captureChartImage?: () => Promise<string | null>
  /** Captura feita antes de abrir (snapshot já na área de transferência) */
  prefetch?: ChartSocialSharePrefetch | null
  onPublished?: (redirectUrl: string) => void
}

export default function ChartSocialShareDialog({
  open,
  onOpenChange,
  symbol,
  widgetLoaded,
  getChart,
  getWidget,
  chartContainer,
  urlFallback,
  captureChartImage,
  prefetch,
  onPublished,
}: ChartSocialShareDialogProps) {
  const { toast } = useToast()
  const loadGenRef = useRef(0)
  const wasOpenRef = useRef(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<DialogPhase>("idle")
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [chartLinkInput, setChartLinkInput] = useState("")
  const [shareSymbol, setShareSymbol] = useState(symbol)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [copyingImage, setCopyingImage] = useState(false)
  const [attachChartSnapshot, setAttachChartSnapshot] = useState(false)
  const [postMedias, setPostMedias] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [publishSuccess, setPublishSuccess] = useState<{ redirectUrl: string; category: string } | null>(
    null
  )

  const [category, setCategory] = useState<ChartSocialCategory>("forex")
  const [description, setDescription] = useState("")
  const [direction, setDirection] = useState<TradeDirection>("")
  const [entry, setEntry] = useState("")
  const [stopLoss, setStopLoss] = useState("")
  const [takeProfits, setTakeProfits] = useState<[string, string, string, string, string]>([
    "",
    "",
    "",
    "",
    "",
  ])
  const [draftFromChart, setDraftFromChart] = useState(false)

  const hasPrefetchImage = Boolean(prefetch?.image && prefetch.image.length > 80)

  const prepareInput: ChartSharePrepareInput = useMemo(
    () => ({
      symbol,
      widgetLoaded,
      getChart,
      getWidget,
      chartContainer,
      urlFallback,
      captureChartImage,
      captureDelayMs: hasPrefetchImage ? 0 : 500,
      prefetchImage: prefetch?.image ?? null,
      prefetchChartUrl: prefetch?.chartUrl ?? null,
      skipImageCapture: hasPrefetchImage,
    }),
    [
      symbol,
      widgetLoaded,
      getChart,
      getWidget,
      chartContainer,
      urlFallback,
      captureChartImage,
      prefetch?.image,
      prefetch?.chartUrl,
      hasPrefetchImage,
    ]
  )

  const applyTradeDraft = useCallback((draft: ChartShareTradeDraft) => {
    setDirection(draft.direction)
    setEntry(draft.entry)
    setStopLoss(draft.stopLoss)
    setTakeProfits([...draft.takeProfits])
    setDraftFromChart(draft.detectedFromChart)
  }, [])

  const resetForm = useCallback(() => {
    setPhase("idle")
    setPreviewImage(null)
    setChartLinkInput("")
    setShareSymbol(symbol)
    setBannerError(null)
    setWarnings([])
    setDescription("")
    setDirection("")
    setEntry("")
    setStopLoss("")
    setTakeProfits(["", "", "", "", ""])
    setDraftFromChart(false)
    setPublishSuccess(null)
    setCopyingImage(false)
    setAttachChartSnapshot(false)
    setPostMedias([])
    setMediaPreviews([])
  }, [symbol])

  const loadPreview = useCallback(async () => {
    const gen = ++loadGenRef.current
    setPhase("loading")
    setBannerError(null)

    try {
      const prepared = await prepareChartSocialShare(prepareInput)
      if (gen !== loadGenRef.current) return

      setPreviewImage(prepared.snapshot.image)
      setShareSymbol(prepared.snapshot.symbol)
      setCategory(prepared.category)
      setWarnings(
        prepared.snapshot.warnings.filter((w) => !/link nativo|getChartUrl|Share chart/i.test(w))
      )

      const prefUrl = prefetch?.chartUrl?.trim() || ""
      if (prefUrl && isNativeTradingViewShareUrl(prefUrl)) {
        setChartLinkInput(normalizeNativeTradingViewShareUrl(prefUrl))
      }
      applyTradeDraft(prepared.trade)
      setPhase("ready")

      if (prepared.snapshot.image && !attachChartSnapshot) {
        setAttachChartSnapshot(true)
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return
      const msg = e instanceof Error ? e.message : "Erro ao preparar partilha."
      setBannerError(msg)
      setPhase("error")
      toast({ title: "Erro na captura", description: msg, variant: "destructive" })
    }
  }, [prepareInput, applyTradeDraft, toast, prefetch?.chartUrl])

  const refreshTradeFromChart = useCallback(async () => {
    try {
      const prepared = await prepareChartSocialShare({ ...prepareInput, captureDelayMs: 0 })
      applyTradeDraft(prepared.trade)
      toast({
        title: prepared.trade.detectedFromChart ? "Níveis atualizados" : "Sem níveis automáticos",
        description: prepared.trade.detectedFromChart
          ? "Valores lidos dos indicadores MTM."
          : "Preenche Entrada, SL e TPs manualmente.",
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível ler os níveis."
      toast({ title: "Erro", description: msg, variant: "destructive" })
    }
  }, [prepareInput, applyTradeDraft, toast])

  const handleCopyImage = useCallback(async () => {
    setCopyingImage(true)
    try {
      const image = await captureNativeTradingViewImage(
        getChart,
        captureChartImage,
        getWidget,
        chartContainer ?? null
      )
      if (!image) {
        toast({
          title: "Snapshot indisponível",
          description:
            "Usa o botão de câmara na barra do TradingView ou tenta «Atualizar captura».",
          variant: "destructive",
        })
        return
      }
      setPreviewImage(image)
      setPhase("ready")
      await copyChartImageToClipboard(image)
      toast({
        title: "Snapshot copiado",
        description: "Mesma captura que «Take a snapshot» — imagem na área de transferência.",
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao copiar imagem."
      toast({ title: "Erro ao copiar", description: msg, variant: "destructive" })
    } finally {
      setCopyingImage(false)
    }
  }, [getChart, getWidget, chartContainer, captureChartImage, toast])

  const handleMediaSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setPostMedias((prev) => [...prev, ...files])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setMediaPreviews((prev) => [...prev, reader.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }, [])

  const removeMediaAt = useCallback((idx: number) => {
    setMediaPreviews((prev) => prev.filter((_, i) => i !== idx))
    setPostMedias((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const uploadPostMedias = useCallback(async (): Promise<string[]> => {
    if (postMedias.length === 0) return []
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) throw new Error("Sessão expirada. Inicia sessão novamente.")

    const urls: string[] = []
    for (const file of postMedias) {
      const fileExt = file.name.split(".").pop() || "bin"
      const fileName = `${session.user.id}-chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`
      const filePath = `posts/${fileName}`
      const { error: uploadError } = await supabase.storage.from("uploads").upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      })
      if (uploadError) throw new Error(uploadError.message || "Erro ao enviar mídia.")
      const {
        data: { publicUrl },
      } = supabase.storage.from("uploads").getPublicUrl(filePath)
      urls.push(publicUrl)
    }
    return urls
  }, [postMedias])

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!open) return
    if (justOpened) {
      resetForm()
      void loadPreview()
    }
  }, [open, resetForm, loadPreview])

  const tradeDraft: ChartShareTradeDraft = {
    direction,
    entry,
    stopLoss,
    takeProfits,
    symbol: shareSymbol,
    detectedFromChart: draftFromChart,
  }

  const chartLinkForPreview = chartLinkInput.trim() || null
  const postPreview = buildSharePreviewText(
    shareSymbol,
    chartLinkForPreview,
    description,
    tradeDraft
  )

  const handlePublish = async () => {
    setPhase("publishing")
    setBannerError(null)

    const rawUrl = chartLinkInput.trim()
    const urlToPost = isNativeTradingViewShareUrl(rawUrl)
      ? normalizeNativeTradingViewShareUrl(rawUrl)
      : rawUrl

    try {
      const mediaUrls = await uploadPostMedias()

      let chartImageToPost: string | null = null
      if (attachChartSnapshot && mediaUrls.length === 0) {
        chartImageToPost =
          previewImage && previewImage.length > 200
            ? previewImage
            : await captureNativeTradingViewImage(
                getChart,
                captureChartImage,
                getWidget,
                chartContainer ?? null
              )
      }

      const result = await publishChartToSocial({
        symbol: shareSymbol,
        chartUrl: urlToPost,
        chartImage: chartImageToPost,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        category,
        description,
        trade: tradeDraft,
      })

      if (!result.success) {
        setBannerError(result.error || "Erro ao publicar.")
        setPhase("ready")
        toast({ title: "Publicação falhou", description: result.error, variant: "destructive" })
        return
      }

      setPublishSuccess({ redirectUrl: result.redirectUrl, category: result.category })
      setPhase("success")

      toast({
        title: "Publicado no Social",
        description: result.mediaUrl
          ? `Post com imagem na categoria ${result.category}.`
          : `Post criado na categoria ${result.category}.`,
      })

      onPublished?.(result.redirectUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede."
      setBannerError(msg)
      setPhase("ready")
      toast({ title: "Erro de rede", description: msg, variant: "destructive" })
    }
  }

  const handleClose = (next: boolean) => {
    if (!next) {
      loadGenRef.current++
      resetForm()
    }
    onOpenChange(next)
  }

  const isLoading = phase === "loading"
  const isPublishing = phase === "publishing"
  const hasPreviewImage = Boolean(previewImage && previewImage.length > 80)
  const canPublish = !isLoading && !isPublishing && phase !== "error"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-[#D2A63C]/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#D2A63C] flex items-center">
            <Share2 className="h-6 w-6 mr-2" />
            Partilhar no Social MTM
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Cola o link do gráfico (TradingView). Mídia e snapshot são opcionais.
          </DialogDescription>
        </DialogHeader>

        {isLoading && !previewImage ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {bannerError && (
              <Alert className="bg-red-500/15 border-red-500/50">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-200 text-sm">{bannerError}</AlertDescription>
              </Alert>
            )}

            {warnings.length > 0 && !bannerError && (
              <Alert className="bg-amber-500/10 border-amber-500/40">
                <AlertDescription className="text-amber-200/90 text-xs">
                  {warnings.join(" ")}
                </AlertDescription>
              </Alert>
            )}

            {/* Publicação */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-[#D2A63C]/30 pb-2">
                Publicação no Social
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Categoria</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as ChartSocialCategory)}
                    disabled={isPublishing}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {CHART_SOCIAL_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-gray-300 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[#D2A63C]" />
                  Link do gráfico (opcional)
                </Label>
                <Input
                  value={chartLinkInput}
                  onChange={(e) => setChartLinkInput(e.target.value)}
                  placeholder="https://www.tradingview.com/x/… ou link do gráfico"
                  disabled={isPublishing}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cola o link do TradingView (Share chart / ⌥S). Só este link aparece no post — não é gerado automaticamente.
                </p>
              </div>
              <div>
                <Label className="text-gray-300">Descrição / comentário</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Comentário para o feed…"
                  disabled={isPublishing}
                  className="bg-gray-800 border-gray-700 text-white min-h-[80px] mt-1"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-gray-300">Mídia do post (opcional)</Label>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  id="chart-share-media-upload"
                  onChange={handleMediaSelect}
                  disabled={isPublishing}
                />
                <label
                  htmlFor="chart-share-media-upload"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-300 hover:bg-gray-800 cursor-pointer ${isPublishing ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Plus className="h-4 w-4 text-[#D2A63C]" />
                  Adicionar mídia
                </label>
                {mediaPreviews.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {mediaPreviews.map((preview, idx) => (
                      <div key={idx} className="relative rounded-lg border border-gray-700 overflow-hidden">
                        {postMedias[idx]?.type.startsWith("video/") ? (
                          <video src={preview} className="w-full max-h-32 object-cover" controls />
                        ) : (
                          <img src={preview} alt="" className="w-full max-h-32 object-cover" />
                        )}
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 bg-black/70 rounded-full"
                          onClick={() => removeMediaAt(idx)}
                          disabled={isPublishing}
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Com mídia anexada, o snapshot do gráfico não é enviado.
                </p>
              </div>
              <p className="text-xs text-gray-500">Símbolo: {shareSymbol}</p>
            </div>

            {/* Snapshot do gráfico (opcional) */}
            <div className="space-y-4 rounded-lg border border-gray-800/80 p-4 bg-gray-950/40">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-base font-semibold text-gray-300 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-gray-500" />
                    Snapshot do gráfico
                    <span className="text-xs font-normal text-gray-500">(opcional)</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Só é anexado ao post se não houveres mídia acima e ativares a opção.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachChartSnapshot}
                    onChange={(e) => setAttachChartSnapshot(e.target.checked)}
                    disabled={isPublishing || postMedias.length > 0}
                    className="rounded border-gray-600"
                  />
                  Incluir no post
                </label>
              </div>
              {attachChartSnapshot && postMedias.length === 0 && (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoading || isPublishing || copyingImage || !widgetLoaded}
                      className="border-gray-600 text-gray-300 h-8 text-xs"
                      onClick={() => void handleCopyImage()}
                    >
                      {copyingImage ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1" />
                      )}
                      Snapshot (copiar)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoading || isPublishing || !widgetLoaded}
                      className="border-gray-600 text-gray-300 h-8 text-xs"
                      onClick={() => void loadPreview()}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Atualizar captura
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="relative rounded-lg border border-gray-700 bg-black/60 overflow-hidden min-h-[120px] max-h-[240px]">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt={`Snapshot ${shareSymbol}`}
                        className="w-full max-h-[240px] object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-gray-500 py-8 text-xs">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                        Atualizar captura se quiseres imagem no post
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Níveis do trade */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-[#D2A63C]/30 pb-2 flex items-center justify-between gap-2">
                Níveis do trade (scanners)
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading || isPublishing || !widgetLoaded}
                  className="border-gray-600 text-gray-300 h-8 text-xs font-normal"
                  onClick={() => void refreshTradeFromChart()}
                >
                  Ler do gráfico
                </Button>
              </h3>

              {draftFromChart && (
                <p className="text-xs text-amber-400/90 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  Níveis dos indicadores MTM — confirma antes de publicar.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label className="text-gray-300">Ideia</Label>
                  <Select
                    value={direction || "none"}
                    onValueChange={(v) =>
                      setDirection(v === "none" ? "" : (v as TradeDirection))
                    }
                    disabled={isPublishing}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="none">Não indicar</SelectItem>
                      <SelectItem value="bullish">Bullish (Long)</SelectItem>
                      <SelectItem value="bearish">Bearish (Short)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-300">Entrada</Label>
                  <Input
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    disabled={isPublishing}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Stop Loss</Label>
                  <Input
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    disabled={isPublishing}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                {takeProfits.map((tp, i) => (
                  <div key={i}>
                    <Label className="text-gray-300">TP{i + 1}</Label>
                    <Input
                      value={tp}
                      onChange={(e) => {
                        const next = [...takeProfits] as [
                          string,
                          string,
                          string,
                          string,
                          string,
                        ]
                        next[i] = e.target.value
                        setTakeProfits(next)
                      }}
                      disabled={isPublishing}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Pré-visualização */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-[#D2A63C]/30 pb-2">
                Pré-visualização do post
              </h3>
              <div className="rounded-lg border border-gray-700 bg-gray-950/50 p-3">
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed break-words">
                  {postPreview || `📊 ${shareSymbol}`}
                </p>
              </div>
            </div>

            {publishSuccess && (
              <Alert className="bg-emerald-500/15 border-emerald-500/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription className="text-emerald-100 text-sm">
                  Publicado na categoria {publishSuccess.category}.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[#D2A63C]/30">
              {publishSuccess ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleClose(false)}
                    className="border-gray-700 text-gray-300 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                    onClick={() =>
                      window.open(publishSuccess.redirectUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Abrir Social
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPublishing}
                    onClick={() => handleClose(false)}
                    className="border-gray-700 text-gray-300 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={!canPublish}
                    onClick={() => void handlePublish()}
                    className="bg-[#D2A63C] hover:bg-[#BB8525] text-black disabled:opacity-50"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        A publicar…
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4 mr-2" />
                        Publicar no Social
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
