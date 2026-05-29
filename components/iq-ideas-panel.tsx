"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { 
  MessageSquare, 
  Heart, 
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2
} from "lucide-react"
import { IQIdea } from "@/types/insights"
import { loadIdeas, createIdea, deleteIdea, toggleLikeIdea } from "@/lib/ideasStorage"

interface IQIdeasPanelProps {
  currentSymbol?: string
  onCaptureImage?: () => Promise<string | null>
  showPostButton?: boolean
  showFeed?: boolean
}

export function IQIdeasPanel({
  currentSymbol,
  onCaptureImage,
  showPostButton = true,
  showFeed = true
}: IQIdeasPanelProps) {
  const { toast } = useToast()
  const [ideas, setIdeas] = useState<IQIdea[]>([])
  const [showPostDialog, setShowPostDialog] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState("")
  const [ideaContent, setIdeaContent] = useState("")
  const [ideaBias, setIdeaBias] = useState<"Bullish" | "Bearish" | "Neutral">("Neutral")
  const [isCapturing, setIsCapturing] = useState(false)

  useEffect(() => {
    setIdeas(loadIdeas())
  }, [])

  const handlePostIdea = async () => {
    if (!ideaTitle.trim() || !ideaContent.trim()) {
      toast({
        title: "❌ Error",
        description: "Fill in title and content",
        variant: "destructive",
      })
      return
    }

    try {
      setIsCapturing(true)
      
      // Capturar imagem do gráfico
      let image: string | undefined
      if (onCaptureImage) {
        image = await onCaptureImage() || undefined
      }

      const idea: IQIdea = {
        id: crypto.randomUUID(),
        author: "User", // TODO: Pegar do contexto de auth
        createdAt: Date.now(),
        title: ideaTitle,
        content: ideaContent,
        symbol: currentSymbol,
        bias: ideaBias,
        image,
        likes: 0,
        comments: 0,
        isLiked: false,
      }

      createIdea(idea)
      setIdeas(loadIdeas())
      setIdeaTitle("")
      setIdeaContent("")
      setIdeaBias("Neutral")
      setShowPostDialog(false)

      toast({
        title: "✅ Idea Published",
        description: "Your idea was published successfully",
      })
    } catch (e: any) {
      if (e.message === "LIMIT_REACHED") {
        toast({
          title: "❌ Limit Reached",
          description: "Limit of 100 ideas reached. Delete an old idea.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "❌ Error",
          description: "Error publishing idea",
          variant: "destructive",
        })
      }
    } finally {
      setIsCapturing(false)
    }
  }

  const handleToggleLike = (id: string) => {
    toggleLikeIdea(id)
    setIdeas(loadIdeas())
  }

  const handleDeleteIdea = (id: string) => {
    if (!confirm("Are you sure you want to delete this idea?")) return
    
    deleteIdea(id)
    setIdeas(loadIdeas())
    
    toast({
      title: "✅ Idea Deleted",
      description: "Idea deleted successfully",
    })
  }

  const getBiasIcon = (bias?: string) => {
    switch (bias) {
      case "Bullish":
        return <TrendingUp className="h-4 w-4 text-green-400" />
      case "Bearish":
        return <TrendingDown className="h-4 w-4 text-red-400" />
      default:
        return <Minus className="h-4 w-4 text-gray-400" />
    }
  }

  const getBiasColor = (bias?: string) => {
    switch (bias) {
      case "Bullish":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "Bearish":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  return (
    <>
      {/* Botão Post Idea */}
      {showPostButton && (
      <Dialog open={showPostDialog} onOpenChange={setShowPostDialog}>
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
            <MessageSquare className="h-3 w-3 mr-1.5" />
            Publicar IQ Idea
          </Button>
        </DialogTrigger>
        <DialogContent className="border rounded-lg" style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#E6EAF0', fontSize: '14px', fontWeight: 600, letterSpacing: '0.05em' }}>IQ IDEAS</DialogTitle>
            <DialogDescription style={{ color: '#B0B8C1', fontSize: '12px' }}>
              Share a quick idea about the market
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Title</Label>
              <Input
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder="Ex: XAU/USD at key support"
                className="mt-2 border rounded-lg"
                style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                autoFocus
              />
            </div>
            <div>
              <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Content</Label>
              <Textarea
                value={ideaContent}
                onChange={(e) => setIdeaContent(e.target.value)}
                placeholder="Describe your idea..."
                className="mt-2 border rounded-lg"
                style={{ backgroundColor: '#05060D', borderColor: '#1F2937', color: '#E6EAF0' }}
                rows={4}
              />
            </div>
            <div>
              <Label style={{ color: '#B0B8C1', fontSize: '12px' }}>Bias</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={ideaBias === "Bullish" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIdeaBias("Bullish")}
                  className="h-8 px-3 text-xs font-medium rounded-lg border"
                  style={
                    ideaBias === "Bullish"
                      ? { backgroundColor: '#00C084', borderColor: '#00C084', color: '#E6EAF0' }
                      : { backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }
                  }
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Bullish
                </Button>
                <Button
                  type="button"
                  variant={ideaBias === "Bearish" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIdeaBias("Bearish")}
                  className="h-8 px-3 text-xs font-medium rounded-lg border"
                  style={
                    ideaBias === "Bearish"
                      ? { backgroundColor: '#FF4D4D', borderColor: '#FF4D4D', color: '#E6EAF0' }
                      : { backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }
                  }
                >
                  <TrendingDown className="h-3 w-3 mr-1" />
                  Bearish
                </Button>
                <Button
                  type="button"
                  variant={ideaBias === "Neutral" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIdeaBias("Neutral")}
                  className="h-8 px-3 text-xs font-medium rounded-lg border"
                  style={
                    ideaBias === "Neutral"
                      ? { backgroundColor: '#FACC15', borderColor: '#FACC15', color: '#05060D' }
                      : { backgroundColor: '#0E1428', borderColor: '#1F2937', color: '#B0B8C1' }
                  }
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Neutral
                </Button>
              </div>
            </div>
            <div className="text-xs" style={{ color: '#6B7280' }}>
              Saved ideas: {ideas.length}/100
            </div>
            <Button
              onClick={handlePostIdea}
              disabled={isCapturing}
              className="w-full rounded-lg font-medium"
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#E6EAF0' }}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Capturing image...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Publish Idea
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Feed de Ideas */}
      {showFeed && (
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {ideas.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No ideas published
          </div>
        ) : (
          ideas.map((idea) => (
            <Card
              key={idea.id}
              className="border rounded-lg transition-colors mb-3"
              style={{ backgroundColor: '#0E1428', borderColor: '#1F2937' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2563EB'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1F2937'
              }}
            >
              <CardContent className="p-4">
                {idea.image && (
                  <div className="mb-3 rounded overflow-hidden" style={{ backgroundColor: '#05060D' }}>
                    <img
                      src={idea.image}
                      alt={idea.title}
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm" style={{ color: '#E6EAF0' }}>{idea.title}</h3>
                        {idea.bias && (
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-0 rounded border"
                            style={
                              idea.bias === "Bullish"
                                ? { backgroundColor: '#00C08420', borderColor: '#00C084', color: '#00C084' }
                                : idea.bias === "Bearish"
                                ? { backgroundColor: '#FF4D4D20', borderColor: '#FF4D4D', color: '#FF4D4D' }
                                : { backgroundColor: '#FACC1520', borderColor: '#FACC15', color: '#FACC15' }
                            }
                          >
                            {getBiasIcon(idea.bias)}
                            <span className="ml-1">{idea.bias}</span>
                          </Badge>
                        )}
                      </div>
                      {idea.symbol && (
                        <p className="text-xs mb-1" style={{ color: '#2563EB' }}>{idea.symbol}</p>
                      )}
                      <p className="text-sm" style={{ color: '#B0B8C1' }}>{idea.content}</p>
                    </div>
                    <Button
                      onClick={() => handleDeleteIdea(idea.id)}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 rounded-lg"
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
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#1F2937' }}>
                    <div className="text-xs" style={{ color: '#6B7280' }}>
                      {new Date(idea.createdAt).toLocaleDateString("pt-BR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => handleToggleLike(idea.id)}
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs rounded-lg"
                        style={
                          idea.isLiked
                            ? { color: '#FF4D4D', backgroundColor: '#FF4D4D20' }
                            : { color: '#6B7280' }
                        }
                      >
                        <Heart className={`h-3 w-3 mr-1 ${idea.isLiked ? "fill-current" : ""}`} />
                        {idea.likes || 0}
                      </Button>
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#6B7280' }}>
                        <MessageSquare className="h-3 w-3" />
                        {idea.comments || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      )}
    </>
  )
}

