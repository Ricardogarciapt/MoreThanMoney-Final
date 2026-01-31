"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Minimize, BarChart3, Coins } from "lucide-react"

type AssetCategoryKey = "crypto" | "indices"

const assetCategories: Record<
  AssetCategoryKey,
  { label: string; icon: any; defaultScreener: "stocks_heatmap" | "crypto_bubbles" }
> = {
  crypto: {
    label: "Cripto",
    icon: Coins,
    defaultScreener: "crypto_bubbles",
  },
  indices: {
    label: "Índices / ETFs",
    icon: BarChart3,
    defaultScreener: "stocks_heatmap",
  },
}

const screenerUrls: Record<"crypto_bubbles" | "stocks_heatmap", string> = {
  crypto_bubbles: "https://cryptobubbles.net",
  stocks_heatmap:
    "https://www.tradingview.com/embed-widget/stock-heatmap/?locale=br&blockSize=market_cap_basic&blockColor=change&dataSource=SPX500&grouping=sector&marketColor=%230db1ac&showToolbar=true&size=large&symbols=%5B%5D&colorTheme=dark&hasTopBar=true&isDataSetEnabled=false&isZoomEnabled=true&hasSymbolTooltip=true&isMonoSize=false&width=100%25&height=400",
}

interface ScannerScreenerProps {
  mode?: "desktop" | "mobile"
}

export default function ScannerScreener({ mode = "desktop" }: ScannerScreenerProps) {
  const [selectedCategory, setSelectedCategory] = useState<AssetCategoryKey>("crypto")
  const [screenerZoom, setScreenerZoom] = useState(1)
  const [screenerPosition, setScreenerPosition] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastTouch, setLastTouch] = useState<{ x: number; y: number } | null>(null)

  const currentCategory = assetCategories[selectedCategory]
  const currentScreener = currentCategory.defaultScreener
  const screenerUrl = screenerUrls[currentScreener]

  const height = mode === "mobile" ? "400px" : "460px"

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY * -0.001
    const newZoom = Math.min(Math.max(0.5, screenerZoom + delta), 3)
    setScreenerZoom(newZoom)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true)
      setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY })
    } else if (e.touches.length === 2) {
      setIsPanning(false)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isPanning && lastTouch) {
      const deltaX = e.touches[0].clientX - lastTouch.x
      const deltaY = e.touches[0].clientY - lastTouch.y

      setScreenerPosition((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))

      setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY })
    } else if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
      )

      const newZoom = Math.min(Math.max(0.5, distance / 200), 3)
      setScreenerZoom(newZoom)
    }
  }

  const handleTouchEnd = () => {
    setIsPanning(false)
    setLastTouch(null)
  }

  const handleDoubleClick = () => {
    setScreenerZoom(1)
    setScreenerPosition({ x: 0, y: 0 })
  }

  const zoomIn = () => {
    setScreenerZoom((prev) => Math.min(prev + 0.2, 3))
  }

  const zoomOut = () => {
    setScreenerZoom((prev) => Math.max(prev - 0.2, 0.5))
  }

  const resetZoom = () => {
    setScreenerZoom(1)
    setScreenerPosition({ x: 0, y: 0 })
  }

  return (
    <div className="bg-gradient-to-br from-[#111111] to-[#050505] border border-[#D2A63C]/40 rounded-lg p-3 md:p-4 shadow-[0_0_25px_rgba(210,166,60,0.15)]">
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
        {(Object.keys(assetCategories) as AssetCategoryKey[]).map((key) => {
          const CatIcon = assetCategories[key].icon
          const isActive = selectedCategory === key
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-all ${
                isActive
                  ? "bg-[#D2A63C] text-black font-semibold shadow-[0_0_12px_rgba(210,166,60,0.65)]"
                  : "bg-gray-900/70 text-gray-300 hover:bg-gray-800"
              }`}
            >
              <CatIcon className="w-3 h-3" />
              <span>{assetCategories[key].label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] text-gray-400">
          {currentScreener === "crypto_bubbles" ? "Mapa de bolhas cripto (variação %)" : "Stocks Heatmap S&P 500"}
        </span>
        <div className="flex gap-2">
          <Button
            onClick={zoomOut}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gray-800 border-[#D2A63C]/30 hover:bg-[#D2A63C]/20"
          >
            <ZoomOut className="h-4 w-4 text-[#D2A63C]" />
          </Button>
          <Button
            onClick={resetZoom}
            size="sm"
            variant="outline"
            className="h-8 px-2 bg-gray-800 border-[#D2A63C]/30 hover:bg-[#D2A63C]/20"
          >
            <Minimize className="h-4 w-4 text-[#D2A63C]" />
            <span className="text-xs text-[#D2A63C] ml-1">{Math.round(screenerZoom * 100)}%</span>
          </Button>
          <Button
            onClick={zoomIn}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gray-800 border-[#D2A63C]/30 hover:bg-[#D2A63C]/20"
          >
            <ZoomIn className="h-4 w-4 text-[#D2A63C]" />
          </Button>
        </div>
      </div>

      <div
        className="bg-gray-800 rounded-lg overflow-hidden relative touch-none"
        style={{ height }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
      >
        <div
          style={{
            transform: `scale(${screenerZoom}) translate(${screenerPosition.x}px, ${screenerPosition.y}px)`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.1s ease-out",
            width: "100%",
            height: "100%",
          }}
        >
          <iframe
            src={screenerUrl}
            title={`${currentCategory.label} Screener`}
            className="w-full h-full border-0"
            loading="lazy"
            style={{ pointerEvents: screenerZoom === 1 ? "auto" : "none" }}
          />
        </div>
      </div>

      <div className="mt-2 text-center">
        <p className="text-[11px] text-gray-400">
          💡 Usa scroll, pinch‑to‑zoom ou os botões acima para ajustar a visualização do screener.
        </p>
      </div>
    </div>
  )
}


