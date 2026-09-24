"use client"

import { useState, useCallback, useId, useRef, useEffect, DragEvent } from "react"
import { semCripto } from "@/lib/ios-sem-cripto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Download, RotateCcw, Wallet, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type PersonalPositionForAi = {
  symbol: string
  name: string
  quantity: number
  avg_price: number
}

type MtmSnapshotRow = {
  symbol: string
  name: string
  entry_price?: number
  current_price?: number
  category?: string
}

type Props = {
  personalPositions: PersonalPositionForAi[]
  mtmSnapshot: MtmSnapshotRow[]
  onImportToPortfolio: (rows: PersonalPositionForAi[]) => void
}

type Method = "manual" | "csv" | "image"
type PortfolioType = "crypto" | "etf" | "mixed"
type DcaFreq = "weekly" | "biweekly" | "monthly"

type ManualRow = { id: string; ticker: string; qty: string; avgPrice: string }

type PortfolioAiAsset = {
  ticker?: string
  name?: string
  qty?: number
  avgPrice?: number
  currentPrice?: number
  type?: string
}

type PortfolioAiAlloc = {
  ticker?: string
  currentPct?: number
  targetPct?: number
  action?: string
  dcaAmount?: number
  reasoning?: string
}

type PortfolioAiResult = {
  assets?: PortfolioAiAsset[]
  totalValue?: number
  totalPnL?: number
  totalPnLPct?: number
  fearGreedIndex?: number
  marketSentiment?: string
  allocations?: PortfolioAiAlloc[]
  aiAnalysis?: string
  riskScore?: number
  diversificationScore?: number
}

/** Paleta alinhada à app-mobile (dourado MTM + estados verde/azul/âmbar) */
const COLORS = [
  "#D2A63C",
  "#BB8525",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#e11d48",
]

function fileToBase64(file: File): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r !== "string") {
        reject(new Error("Leitura inválida"))
        return
      }
      const m = /^data:([^;]+);base64,(.+)$/.exec(r)
      if (m) {
        resolve({ media_type: m[1], data: m[2] })
        return
      }
      resolve({ media_type: file.type || "image/jpeg", data: btoa(r) })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function newRow(): ManualRow {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, ticker: "", qty: "", avgPrice: "" }
}

export function PortfolioRebalanceAssistant({ personalPositions, mtmSnapshot, onImportToPortfolio }: Props) {
  const csvInputId = useId()
  const imgInputId = useId()

  const [method, setMethod] = useState<Method>("manual")
  // App iOS: sem a opção cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
  const [iosSemCripto] = useState(() => semCripto())
  const [portfolioType, setPortfolioType] = useState<PortfolioType>(() => (semCripto() ? "etf" : "crypto"))
  const [rows, setRows] = useState<ManualRow[]>(() => [newRow(), newRow(), newRow()])
  const [csvText, setCsvText] = useState("")
  const [csvName, setCsvName] = useState<string | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [dcaCapital, setDcaCapital] = useState("")
  const [dcaFreq, setDcaFreq] = useState<DcaFreq>("monthly")
  const [notes, setNotes] = useState("")
  const [includeMtm, setIncludeMtm] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PortfolioAiResult | null>(null)
  const [typedAnalysis, setTypedAnalysis] = useState("")
  const csvDropRef = useRef<HTMLDivElement>(null)
  const imgDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const txt = result?.aiAnalysis
    if (!txt) {
      setTypedAnalysis("")
      return
    }
    let i = 0
    setTypedAnalysis("")
    const id = setInterval(() => {
      i += 3
      if (i >= txt.length) {
        setTypedAnalysis(txt)
        clearInterval(id)
      } else {
        setTypedAnalysis(txt.slice(0, i))
      }
    }, 14)
    return () => clearInterval(id)
  }, [result?.aiAnalysis])

  const addRow = () => setRows((r) => [...r, newRow()])
  const delRow = (id: string) => setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.id !== id)))
  const patchRow = (id: string, patch: Partial<ManualRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const loadFromDevicePortfolio = () => {
    if (personalPositions.length === 0) return
    setMethod("manual")
    setRows(
      personalPositions.map((p) => ({
        id: `${Date.now()}_${p.symbol}_${Math.random().toString(36).slice(2, 6)}`,
        ticker: p.symbol,
        qty: String(p.quantity),
        avgPrice: String(p.avg_price),
      }))
    )
  }

  const processCsvFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      setCsvText(text)
      setCsvName(file.name)
      setMethod("csv")
    }
    reader.readAsText(file)
  }

  const processImageFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 6)
    setImageFiles(list)
    setImagePreviews([])
    list.forEach((f) => {
      const r = new FileReader()
      r.onload = () => {
        // Por um local: dentro do callback do setState o TS volta a ler `r.result`
        // (string | ArrayBuffer | null) e perde o estreitamento do typeof.
        const dados = r.result
        if (typeof dados === "string") setImagePreviews((p) => [...p, dados])
      }
      r.readAsDataURL(f)
    })
    setMethod("image")
  }

  const onCsvDrop = (e: DragEvent) => {
    e.preventDefault()
    csvDropRef.current?.classList.remove("border-[#D2A63C]", "bg-[#D2A63C]/10")
    const f = e.dataTransfer.files[0]
    if (f) processCsvFile(f)
  }

  const onImgDrop = (e: DragEvent) => {
    e.preventDefault()
    imgDropRef.current?.classList.remove("border-[#D2A63C]", "bg-[#D2A63C]/10")
    if (e.dataTransfer.files.length) processImageFiles(e.dataTransfer.files)
  }

  const runAnalyze = useCallback(async () => {
    setError(null)
    setResult(null)
    setTypedAnalysis("")
    const cap = parseFloat(dcaCapital.replace(",", ".")) || 0

    let inputKind: Method = method
    let manualAssets: { ticker: string; qty: number; avgPrice: number; name?: string }[] = []
    let payload: Record<string, unknown> = {
      mode: "analyze_portfolio_ai",
      portfolioType,
      dcaCapitalUsd: cap,
      dcaFrequency: dcaFreq,
      inputKind,
      notes: notes.trim() || undefined,
      mtmSnapshot: includeMtm && mtmSnapshot.length ? mtmSnapshot : undefined,
    }

    if (method === "manual") {
      manualAssets = rows
        .map((row) => ({
          ticker: row.ticker.trim().toUpperCase(),
          qty: parseFloat(row.qty.replace(",", ".")),
          avgPrice: parseFloat(row.avgPrice.replace(",", ".")) || 0,
        }))
        .filter((a) => a.ticker && a.qty > 0)
      if (manualAssets.length === 0) {
        setError("Adiciona pelo menos um ativo com ticker e quantidade.")
        return
      }
      payload.manualAssets = manualAssets
    } else if (method === "csv") {
      if (!csvText.trim()) {
        setError("Carrega ou cola um CSV.")
        return
      }
      payload.csvText = csvText
    } else {
      if (imageFiles.length === 0) {
        setError("Carrega pelo menos uma imagem.")
        return
      }
      const imageParts = await Promise.all(imageFiles.map((f) => fileToBase64(f)))
      payload.imageParts = imageParts
    }

    setLoading(true)
    try {
      const res = await fetch("/api/portfolio/rebalance-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erro na análise.")
        return
      }
      const pa = data.portfolioAi as PortfolioAiResult
      if (!pa) {
        setError("Resposta inválida.")
        return
      }
      setResult(pa)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede.")
    } finally {
      setLoading(false)
    }
  }, [
    method,
    portfolioType,
    rows,
    csvText,
    imageFiles,
    dcaCapital,
    dcaFreq,
    notes,
    includeMtm,
    mtmSnapshot,
  ])

  const exportCsv = () => {
    if (!result?.assets?.length) return
    const allocMap: Record<string, PortfolioAiAlloc> = {}
    ;(result.allocations || []).forEach((a) => {
      if (a.ticker) allocMap[String(a.ticker).toUpperCase()] = a
    })
    const header = ["Ticker", "Nome", "Qtd", "Preço médio", "Preço atual", "Valor", "P&L", "Alocação %", "Alvo %", "Ação", "DCA $"]
    const lines = [header.join(",")]
    for (const a of result.assets) {
      const t = String(a.ticker || "")
      const al = allocMap[t.toUpperCase()] || {}
      const qty = Number(a.qty || 0)
      const cur = Number(a.currentPrice || 0)
      const avg = Number(a.avgPrice || 0)
      const val = qty * cur
      const pnl = val - qty * avg
      lines.push(
        [
          t,
          `"${String(a.name || t).replace(/"/g, '""')}"`,
          qty,
          avg,
          cur,
          val.toFixed(2),
          pnl.toFixed(2),
          Number(al.currentPct || 0).toFixed(2),
          Number(al.targetPct || 0).toFixed(2),
          al.action || "hold",
          Number(al.dcaAmount || 0).toFixed(2),
        ].join(",")
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `portfolio-ai-mtm-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyToMyPortfolio = () => {
    if (!result?.assets?.length) return
    const rowsOut: PersonalPositionForAi[] = result.assets
      .filter((x) => x.ticker && (x.qty || 0) > 0 && (x.avgPrice || 0) > 0)
      .map((a) => ({
        symbol: String(a.ticker).toUpperCase(),
        name: String(a.name || a.ticker),
        quantity: Number(a.qty),
        avg_price: Number(a.avgPrice),
      }))
    if (rowsOut.length === 0) return
    onImportToPortfolio(rowsOut)
  }

  const resetResults = () => {
    setResult(null)
    setTypedAnalysis("")
    setError(null)
  }

  const pnlColor = (result?.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
  const fg = result?.fearGreedIndex
  const fgColor =
    fg == null ? "text-white" : fg <= 25 ? "text-red-400" : fg >= 75 ? "text-green-400" : "text-amber-300"

  const allocs = result?.allocations || []
  const maxC = Math.max(...allocs.map((a) => Number(a.currentPct || 0)), 1)
  const maxT = Math.max(...allocs.map((a) => Number(a.targetPct || 0)), 1)

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/30 overflow-hidden shadow-lg">
      <CardHeader className="py-3 px-4 space-y-0 border-b border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-[#D2A63C] shrink-0 animate-pulse shadow-[0_0_8px_#D2A63C]" />
            <div className="min-w-0">
              <CardTitle className="text-base font-black text-white tracking-tight truncate">
                Assistente IA · Reequilíbrio
              </CardTitle>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-0.5 hidden sm:block">
                Claude · servidor MTM
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0 border-[#D2A63C]/50 text-white hover:bg-[#D2A63C]/15 hover:text-white"
            onClick={loadFromDevicePortfolio}
            disabled={personalPositions.length === 0}
          >
            <Wallet className="w-3.5 h-3.5 mr-1" />
            Meu Portfolio
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="text-center py-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#D2A63C] border border-[#D2A63C]/35 bg-[#D2A63C]/10 px-3 py-1 rounded-full mb-2">
            <Sparkles className="w-3 h-3" /> Powered by Claude
          </div>
          <h2 className="text-lg font-black text-white leading-tight">
            Reequilibra e recupera o <span className="text-[#D2A63C]">preço médio</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
            Importação manual, CSV ou screenshot — análise no nosso backend (chave segura). Complemento ao teu portfólio
            na app.
          </p>
        </div>

        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Método de importação</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(
            [
              ["manual", "⌨️", "Manual", "Ticker, quantidade e preço médio."],
              ["csv", "📄", "CSV / Excel", "Exportações Binance, Coinbase, T212, DEGIRO…"],
              ["image", "🖼️", "Imagem", "Screenshots — a IA extrai os dados."],
            ] as const
          ).map(([m, icon, title, desc]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "text-left rounded-2xl p-3 border-2 transition-all",
                method === m
                  ? "border-[#D2A63C] bg-[#D2A63C]/10 shadow-[0_0_20px_rgba(210,166,60,0.12)]"
                  : "border-white/10 bg-black/30 hover:border-[#D2A63C]/40",
              )}
            >
              <div className="text-xl mb-1">{icon}</div>
              <div className="text-sm font-black text-white">{title}</div>
              <div className="text-[11px] text-gray-400 leading-snug mt-0.5">{desc}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {(iosSemCripto ? (["etf"] as const) : (["crypto", "etf", "mixed"] as const)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPortfolioType(t)}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors",
                portfolioType === t
                  ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
                  : "border-white/10 bg-black/25 text-gray-400",
              )}
            >
              {t === "crypto" ? "₿ Cripto" : t === "etf" ? "📈 ETFs" : "⚡ Misto"}
            </button>
          ))}
        </div>

        {method === "manual" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_72px_72px_36px] gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-bold px-1">
              <span>Ticker</span>
              <span className="text-center">Qtd</span>
              <span className="text-center">PM $</span>
              <span />
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_72px_72px_36px] gap-1.5 items-center">
                <Input
                  className="h-9 bg-black/40 border-white/15 text-white text-xs uppercase rounded-lg placeholder:text-gray-500"
                  placeholder={portfolioType === "etf" ? "IWDA" : "ETH"}
                  value={row.ticker}
                  onChange={(e) => patchRow(row.id, { ticker: e.target.value.toUpperCase() })}
                />
                <Input
                  className="h-9 bg-black/40 border-white/15 text-white text-xs px-1 rounded-lg placeholder:text-gray-500"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.qty}
                  onChange={(e) => patchRow(row.id, { qty: e.target.value })}
                />
                <Input
                  className="h-9 bg-black/40 border-white/15 text-white text-xs px-1 rounded-lg placeholder:text-gray-500"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.avgPrice}
                  onChange={(e) => patchRow(row.id, { avgPrice: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-500 hover:text-red-400"
                  onClick={() => delRow(row.id)}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed border-[#D2A63C]/35 text-gray-300 text-xs h-9 rounded-xl hover:bg-[#D2A63C]/10 hover:text-white"
              onClick={addRow}
            >
              + Adicionar ativo
            </Button>
          </div>
        )}

        {method === "csv" && (
          <div className="space-y-2">
            <div
              ref={csvDropRef}
              onDragOver={(e) => {
                e.preventDefault()
                csvDropRef.current?.classList.add("border-[#D2A63C]", "bg-[#D2A63C]/10")
              }}
              onDragLeave={() =>
                csvDropRef.current?.classList.remove("border-[#D2A63C]", "bg-[#D2A63C]/10")
              }
              onDrop={onCsvDrop}
              className="rounded-3xl border-2 border-dashed border-white/15 bg-black/30 p-6 text-center cursor-pointer transition-colors hover:border-[#D2A63C]/50"
              onClick={() => document.getElementById(csvInputId)?.click()}
            >
              <input
                id={csvInputId}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && processCsvFile(e.target.files[0])}
              />
              <div className="text-3xl mb-2 opacity-70">📊</div>
              <p className="text-sm font-black text-white">Arrasta CSV ou toca para escolher</p>
              <p className="text-xs text-gray-400 mt-1">Também podes colar abaixo</p>
            </div>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Ou cola aqui o conteúdo do ficheiro…"
              className="min-h-[100px] bg-black/40 border-white/15 text-xs text-gray-200 rounded-xl placeholder:text-gray-500"
            />
            {csvName && (
              <p className="text-[11px] text-[#D2A63C] font-semibold">✓ {csvName} carregado</p>
            )}
          </div>
        )}

        {method === "image" && (
          <div className="space-y-2">
            <div
              ref={imgDropRef}
              onDragOver={(e) => {
                e.preventDefault()
                imgDropRef.current?.classList.add("border-[#D2A63C]", "bg-[#D2A63C]/10")
              }}
              onDragLeave={() =>
                imgDropRef.current?.classList.remove("border-[#D2A63C]", "bg-[#D2A63C]/10")
              }
              onDrop={onImgDrop}
              className="rounded-3xl border-2 border-dashed border-white/15 bg-black/30 p-6 text-center cursor-pointer transition-colors hover:border-[#D2A63C]/50"
              onClick={() => document.getElementById(imgInputId)?.click()}
            >
              <input
                id={imgInputId}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && processImageFiles(e.target.files)}
              />
              <div className="text-3xl mb-2 opacity-70">📸</div>
              <p className="text-sm font-black text-white">Screenshot do portfólio</p>
              <p className="text-xs text-gray-400 mt-1">Várias imagens (máx. 6)</p>
            </div>
            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imagePreviews.map((src, i) => (
                  <img key={i} src={src} alt="" className="h-20 rounded-xl border border-[#D2A63C]/30" />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Capital DCA ($)</Label>
            <Input
              className="mt-1 h-9 bg-black/40 border-white/15 text-white text-xs rounded-lg placeholder:text-gray-500"
              inputMode="decimal"
              placeholder="500"
              value={dcaCapital}
              onChange={(e) => setDcaCapital(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Frequência</Label>
            <Select value={dcaFreq} onValueChange={(v) => setDcaFreq(v as DcaFreq)}>
              <SelectTrigger className="mt-1 h-9 bg-black/40 border-white/15 text-white text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="biweekly">Quinzenal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeMtm}
            onChange={(e) => setIncludeMtm(e.target.checked)}
            className="rounded border-[#D2A63C]/50 text-[#D2A63C] accent-[#D2A63C]"
          />
          Incluir referência MTM Pro (contexto)
        </label>

        <div>
          <Label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Notas (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 min-h-[52px] bg-black/40 border-white/15 text-xs text-gray-200 rounded-xl placeholder:text-gray-500"
            placeholder="Objetivos, horizonte, restrições…"
          />
        </div>

        <Button
          type="button"
          disabled={loading}
          className="w-full h-12 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-black text-sm rounded-xl shadow-lg shadow-[#D2A63C]/20"
          onClick={runAnalyze}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "✦ Analisar portfólio com IA"}
        </Button>

        {error && <p className="text-xs text-red-400 text-center font-medium">{error}</p>}

        {result && (
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Resultados</p>
                <h3 className="text-base font-black text-white">Análise do portfólio</h3>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] border-[#D2A63C]/40 text-white hover:bg-[#D2A63C]/15 rounded-lg"
                  onClick={exportCsv}
                >
                  <Download className="w-3 h-3 mr-1" />
                  CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[10px] text-gray-500 hover:text-white"
                  onClick={resetResults}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Novo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border-2 border-white/10 bg-gradient-to-br from-gray-900/90 to-black/80 p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Valor total</p>
                <p className="text-xl font-black text-white">
                  ${Number(result.totalValue || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-400">{result.assets?.length ?? 0} ativos</p>
              </div>
              <div className="rounded-2xl border-2 border-white/10 bg-gradient-to-br from-gray-900/90 to-black/80 p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">P&amp;L total</p>
                <p className={cn("text-xl font-black", pnlColor)}>
                  {(result.totalPnL ?? 0) >= 0 ? "+" : ""}$
                  {Number(result.totalPnL || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-400">
                  {(result.totalPnLPct ?? 0) >= 0 ? "+" : ""}
                  {Number(result.totalPnLPct || 0).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-2xl border-2 border-white/10 bg-gradient-to-br from-gray-900/90 to-black/80 p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Fear &amp; Greed</p>
                <p className={cn("text-xl font-black", fgColor)}>{fg ?? "—"}</p>
                <p className="text-[11px] text-gray-400 line-clamp-2">{result.marketSentiment || ""}</p>
              </div>
              <div className="rounded-2xl border-2 border-white/10 bg-gradient-to-br from-gray-900/90 to-black/80 p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Risco / Diversif.</p>
                <p className="text-xl font-black text-amber-300">
                  {result.riskScore ?? "—"}
                  <span className="text-sm text-gray-500">/10</span>
                </p>
                <p className="text-[11px] text-gray-400">Div. {result.diversificationScore ?? "—"}/10</p>
              </div>
            </div>

            <div className="rounded-3xl border-2 border-[#D2A63C]/25 bg-gradient-to-br from-gray-900/90 via-black/80 to-gray-900/90 p-4 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#D2A63C] via-[#BB8525] to-amber-500" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-black text-white">Análise IA</span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#D2A63C]/20 text-[#D2A63C] px-2 py-0.5 rounded-full border border-[#D2A63C]/35">
                  Claude
                </span>
              </div>
              <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{typedAnalysis}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border-2 border-white/10 bg-black/30 p-3">
                <p className="text-xs font-black text-white mb-3">Alocação atual</p>
                <div className="space-y-2">
                  {[...allocs].sort((a, b) => (b.currentPct || 0) - (a.currentPct || 0)).slice(0, 8).map((a, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-bold text-white">{a.ticker}</span>
                        <span className="text-gray-400 tabular-nums">{Number(a.currentPct || 0).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(Number(a.currentPct || 0) / maxC) * 100}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border-2 border-white/10 bg-black/30 p-3">
                <p className="text-xs font-black text-white mb-3">Alocação recomendada</p>
                <div className="space-y-2">
                  {[...allocs].sort((a, b) => (b.targetPct || 0) - (a.targetPct || 0)).slice(0, 8).map((a, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-bold text-white">{a.ticker}</span>
                        <span className="text-gray-400 tabular-nums">{Number(a.targetPct || 0).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(Number(a.targetPct || 0) / maxT) * 100}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Detalhes por ativo</p>
            <div className="overflow-x-auto rounded-2xl border-2 border-white/10 bg-black/20">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-white/10 uppercase tracking-wider text-[10px] font-bold">
                    <th className="p-2">Ativo</th>
                    <th className="p-2 text-right">Qtd</th>
                    <th className="p-2 text-right">PM</th>
                    <th className="p-2 text-right">Atual</th>
                    <th className="p-2 text-right">P&amp;L</th>
                    <th className="p-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.assets || []).map((a, i) => {
                    const t = String(a.ticker || "")
                    const al = allocs.find((x) => String(x.ticker || "").toUpperCase() === t.toUpperCase())
                    const qty = Number(a.qty || 0)
                    const cur = Number(a.currentPrice || 0)
                    const avg = Number(a.avgPrice || 0)
                    const val = qty * cur
                    const cost = qty * avg
                    const pnl = val - cost
                    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
                    const action = (al?.action || "hold").toLowerCase()
                    const pill =
                      action === "buy"
                        ? "bg-green-500/20 text-green-300 border border-green-500/40"
                        : action === "sell"
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : action === "reduce"
                            ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                            : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    const label =
                      action === "buy"
                        ? "Comprar"
                        : action === "sell"
                          ? "Vender"
                          : action === "reduce"
                            ? "Reduzir"
                            : "Manter"
                    return (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border border-white/10"
                              style={{ background: `${COLORS[i % COLORS.length]}22`, color: COLORS[i % COLORS.length] }}
                            >
                              {t.slice(0, 2)}
                            </div>
                            <div>
                              <div className="text-white font-bold text-[11px]">{a.name || t}</div>
                              <div className="text-gray-500 text-[10px]">{t}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 text-right text-gray-300 tabular-nums">{qty.toLocaleString("pt-PT", { maximumSignificantDigits: 6 })}</td>
                        <td className="p-2 text-right text-gray-300 tabular-nums">${avg.toLocaleString("pt-PT", { maximumFractionDigits: 4 })}</td>
                        <td className="p-2 text-right text-[#D2A63C] font-semibold tabular-nums">${cur.toLocaleString("pt-PT", { maximumFractionDigits: 4 })}</td>
                        <td className={cn("p-2 text-right tabular-nums", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                          <span className="text-[10px] opacity-80"> ({pnlPct >= 0 ? "+" : ""}
                          {pnlPct.toFixed(1)}%)</span>
                        </td>
                        <td className="p-2 text-right">
                          <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold", pill)}>
                            {label}
                          </span>
                          {al?.dcaAmount != null && Number(al.dcaAmount) > 0 && (
                            <div className="text-[10px] text-[#D2A63C] mt-0.5 font-semibold">DCA ${Number(al.dcaAmount).toFixed(0)}</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-black text-sm rounded-xl"
              onClick={applyToMyPortfolio}
              disabled={!result.assets?.some((a) => a.ticker && (a.qty || 0) > 0 && (a.avgPrice || 0) > 0)}
            >
              Guardar ativos analisados em «Meu Portfolio»
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
