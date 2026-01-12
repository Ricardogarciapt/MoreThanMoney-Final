"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { 
  FolderOpen, 
  Save, 
  Trash2, 
  Copy, 
  Loader2,
  Image as ImageIcon,
  Eye
} from "lucide-react"
import { IQInsight } from "@/types/insights"
import { loadInsights, createInsight, deleteInsight, getInsight } from "@/lib/insightsStorage"
import { ScannerKey } from "@/types/layout"

interface IQInsightsPanelProps {
  currentSymbol: string
  currentTimeframe: string
  currentTheme: "light" | "dark"
  currentStudies: ScannerKey[]
  onLoadInsight: (insight: IQInsight) => void
  onCapturePreview?: () => Promise<string | null>
}

export function IQInsightsPanel({
  currentSymbol,
  currentTimeframe,
  currentTheme,
  currentStudies,
  onLoadInsight,
  onCapturePreview
}: IQInsightsPanelProps) {
  const { toast } = useToast()
  const [insights, setInsights] = useState<IQInsight[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [insightName, setInsightName] = useState("")
  const [insightDescription, setInsightDescription] = useState("")
  const [isCapturing, setIsCapturing] = useState(false)

  useEffect(() => {
    setInsights(loadInsights())
  }, [])

  const handleSaveInsight = async () => {
    if (!insightName.trim()) {
      toast({
        title: "❌ Error",
        description: "Enter a name for the Insight",
        variant: "destructive",
      })
      return
    }

    try {
      setIsCapturing(true)
      
      // Capturar preview do gráfico
      let preview: string | undefined
      if (onCapturePreview) {
        preview = await onCapturePreview() || undefined
      }

      const insight: IQInsight = {
        id: crypto.randomUUID(),
        name: insightName,
        description: insightDescription || undefined,
        author: "User", // TODO: Pegar do contexto de auth
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chart: {
          symbol: currentSymbol,
          timeframe: currentTimeframe,
          theme: currentTheme,
        },
        scanners: {
          active: currentStudies,
        },
        preview,
      }

      createInsight(insight)
      setInsights(loadInsights())
      setInsightName("")
      setInsightDescription("")
      setShowSaveDialog(false)

      toast({
        title: "✅ Insight Saved",
        description: `Insight "${insight.name}" saved successfully`,
      })
    } catch (e: any) {
      if (e.message === "LIMIT_REACHED") {
        toast({
          title: "❌ Limit Reached",
          description: "Limit of 50 insights reached. Delete an old insight.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "❌ Error",
          description: "Error saving insight",
          variant: "destructive",
        })
      }
    } finally {
      setIsCapturing(false)
    }
  }

  const handleLoadInsight = (insight: IQInsight) => {
    onLoadInsight(insight)
    setShowLoadDialog(false)
    toast({
      title: "✅ Insight Loaded",
      description: `Insight "${insight.name}" loaded successfully`,
    })
  }

  const handleDeleteInsight = (id: string) => {
    if (!confirm("Are you sure you want to delete this insight?")) return
    
    deleteInsight(id)
    setInsights(loadInsights())
    
    toast({
      title: "✅ Insight Deleted",
      description: "Insight deleted successfully",
    })
  }

  return (
    <>
      {/* Botão Salvar Insight */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
            style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1F2937'
              e.currentTarget.style.color = '#E6EAF0'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0E1428'
              e.currentTarget.style.color = '#B0B8C1'
            }}
          >
            <Save className="h-3 w-3 mr-1.5" />
            Save Insight
          </Button>
        </DialogTrigger>
        <DialogContent className="border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#E6EAF0', fontSize: '14px', fontWeight: 600 }}>IQ INSIGHTS</DialogTitle>
            <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
              Save the complete chart layout as a reusable technical Insight
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Insight Name</Label>
              <Input
                value={insightName}
                onChange={(e) => setInsightName(e.target.value)}
                placeholder="Ex: XAU/USD - Golden Zone Setup"
                className="mt-2 border rounded-lg"
                style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                autoFocus
              />
            </div>
            <div>
              <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Description (optional)</Label>
              <Textarea
                value={insightDescription}
                onChange={(e) => setInsightDescription(e.target.value)}
                placeholder="Technical description of the setup..."
                className="mt-2 border rounded-lg"
                style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                rows={3}
              />
            </div>
            <div className="text-xs" style={{ color: '#6B7280' }}>
              Saved insights: {insights.length}/50
            </div>
            <Button
              onClick={handleSaveInsight}
              disabled={isCapturing}
              className="w-full rounded-lg font-medium"
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Capturing preview...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Insight
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Botão Carregar Insights */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 px-3 text-xs font-medium border rounded-lg transition-colors"
            style={{ backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1F2937'
              e.currentTarget.style.color = '#E6EAF0'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0E1428'
              e.currentTarget.style.color = '#B0B8C1'
            }}
          >
            <FolderOpen className="h-3 w-3 mr-1.5" />
            IQ Insights
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#E6EAF0', fontSize: '14px', fontWeight: 600, letterSpacing: '0.05em' }}>IQ INSIGHTS</DialogTitle>
            <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
              Complete saved technical layouts - Load an insight to apply the exact layout
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {insights.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No saved insights
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.map((insight) => (
                  <Card
                    key={insight.id}
                    className="border rounded-lg transition-colors"
                    style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2563EB'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#1F2937'
                    }}
                  >
                    <CardContent className="p-4">
                      {insight.preview && (
                        <div className="mb-3 rounded overflow-hidden" style={{ backgroundColor: '#05060D' }}>
                          <img
                            src={insight.preview}
                            alt={insight.name}
                            className="w-full h-32 object-cover"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm" style={{ color: '#E6EAF0' }}>{insight.name}</h3>
                            {insight.description && (
                              <p className="text-xs mt-1 line-clamp-2" style={{ color: '#B0B8C1' }}>
                                {insight.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#6B7280' }}>
                          <span>{insight.chart.symbol}</span>
                          <span>•</span>
                          <span>{insight.chart.timeframe}</span>
                          <span>•</span>
                          <span>{insight.scanners.active.length} scanners</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#1F2937' }}>
                          <div className="text-xs" style={{ color: '#6B7280' }}>
                            {new Date(insight.createdAt).toLocaleDateString("pt-BR")}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => handleLoadInsight(insight)}
                              size="sm"
                              className="h-7 px-3 text-xs font-medium rounded-lg"
                              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
                            >
                              LOAD
                            </Button>
                            <Button
                              onClick={() => handleDeleteInsight(insight.id)}
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 rounded-lg"
                              style={{ color: '#FF4D4D' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#FF4D4D20'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

