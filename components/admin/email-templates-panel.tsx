"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Mail,
  Eye,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  Zap,
  Shield,
  GraduationCap,
  Megaphone,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"

interface EmailTemplate {
  id: string
  name: string
  subject: string
  category: "transactional" | "onboarding" | "marketing" | "security"
  trigger: string
  automated: boolean
  sequenceStep?: number
  sequenceDelay?: string
}

interface EmailStats {
  sentLast30Days: number
  failedLast30Days: number
  activeSequenceEnrollments: number
  totalTemplates: number
  automatedTemplates: number
}

const CATEGORY_LABELS: Record<string, { label: string; icon: ReactNode; color: string }> = {
  transactional: { label: "Transaccional", icon: <Mail className="w-3 h-3" />, color: "bg-blue-500/20 text-blue-400" },
  onboarding: { label: "Onboarding", icon: <GraduationCap className="w-3 h-3" />, color: "bg-purple-500/20 text-purple-400" },
  marketing: { label: "Marketing", icon: <Megaphone className="w-3 h-3" />, color: "bg-amber-500/20 text-amber-400" },
  security: { label: "Segurança", icon: <Shield className="w-3 h-3" />, color: "bg-red-500/20 text-red-400" },
}

export default function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [mailConfigured, setMailConfigured] = useState(false)
  const [mailFrom, setMailFrom] = useState("")
  const [loading, setLoading] = useState(true)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState("")
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showSendTest, setShowSendTest] = useState(false)
  const [testEmail, setTestEmail] = useState("morethanmoneypt@gmail.com")
  const [sending, setSending] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>("all")

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/emails")
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates || [])
        setStats(data.stats || null)
        setMailConfigured(data.mailConfigured)
        setMailFrom(data.mailFrom || "")
      }
    } catch (err) {
      console.error("Erro ao carregar emails:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePreview = async (templateId: string) => {
    try {
      setSending(true)
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", templateId }),
      })
      const data = await res.json()
      if (data.success) {
        setPreviewHtml(data.html)
        setPreviewSubject(data.subject)
        setPreviewTemplateId(templateId)
        setShowPreview(true)
      } else {
        alert(data.error || "Erro ao gerar preview")
      }
    } catch {
      alert("Erro ao gerar preview")
    } finally {
      setSending(false)
    }
  }

  const handleSendTest = async () => {
    if (!previewTemplateId || !testEmail) return
    try {
      setSending(true)
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-test",
          templateId: previewTemplateId,
          to: testEmail,
        }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ Email de teste enviado para ${testEmail}`)
        setShowSendTest(false)
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch {
      alert("Erro ao enviar email de teste")
    } finally {
      setSending(false)
    }
  }

  const filtered =
    filterCategory === "all"
      ? templates
      : templates.filter((t) => t.category === filterCategory)

  const grouped = filtered.reduce<Record<string, EmailTemplate[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-8 w-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status SMTP */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border ${mailConfigured ? "border-green-500/30 bg-green-950/20" : "border-red-500/30 bg-red-950/20"}`}>
          <CardContent className="p-4 flex items-center gap-3">
            {mailConfigured ? (
              <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
            ) : (
              <XCircle className="w-8 h-8 text-red-400 shrink-0" />
            )}
            <div>
              <p className="text-xs text-gray-400">SMTP Gmail</p>
              <p className={`font-semibold ${mailConfigured ? "text-green-400" : "text-red-400"}`}>
                {mailConfigured ? "Configurado" : "Não configurado"}
              </p>
              <p className="text-xs text-gray-500 truncate">{mailFrom}</p>
            </div>
          </CardContent>
        </Card>

        {stats && (
          <>
            <Card className="bg-gray-900/50 border-purple-500/30">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400">Enviados (30 dias)</p>
                <p className="text-2xl font-bold text-purple-400">{stats.sentLast30Days}</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400">Templates activos</p>
                <p className="text-2xl font-bold text-[#D2A63C]">{stats.totalTemplates}</p>
                <p className="text-xs text-gray-500">{stats.automatedTemplates} automáticos</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-blue-500/30">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400">Sequências activas</p>
                <p className="text-2xl font-bold text-blue-400">{stats.activeSequenceEnrollments}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {!mailConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">GMAIL_APP_PASSWORD em falta</p>
            <p className="text-amber-200/80 mt-1">
              Define <code className="text-amber-300">GMAIL_APP_PASSWORD</code> e{" "}
              <code className="text-amber-300">GMAIL_USER</code> nas variáveis de ambiente da Vercel
              para activar envios reais.
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {["all", "transactional", "onboarding", "marketing", "security"].map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={filterCategory === cat ? "default" : "outline"}
            className={filterCategory === cat ? "bg-[#D2A63C] text-black hover:bg-[#BB8525]" : "border-gray-600 text-gray-300"}
            onClick={() => setFilterCategory(cat)}
          >
            {cat === "all" ? "Todos" : CATEGORY_LABELS[cat]?.label ?? cat}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={loadData} className="ml-auto text-gray-400">
          <RefreshCw className="w-4 h-4 mr-1" />
          Actualizar
        </Button>
      </div>

      {/* Lista por categoria */}
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category} className="bg-gray-900/50 border-gray-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              {CATEGORY_LABELS[category]?.icon}
              {CATEGORY_LABELS[category]?.label ?? category}
              <Badge className="bg-gray-700 text-gray-300">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((template) => (
              <div
                key={template.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-gray-700/50 bg-gray-800/40 p-4 hover:border-[#D2A63C]/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h4 className="text-white font-medium">{template.name}</h4>
                    {template.automated ? (
                      <Badge className="bg-green-500/20 text-green-400 text-xs">
                        <Zap className="w-3 h-3 mr-1" />
                        Automático
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400 text-xs">Manual</Badge>
                    )}
                    {template.sequenceStep && (
                      <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                        Passo {template.sequenceStep}
                        {template.sequenceDelay ? ` · ${template.sequenceDelay}` : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-1">{template.subject}</p>
                  <p className="text-xs text-gray-500">
                    <strong className="text-gray-400">Trigger:</strong> {template.trigger}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#D2A63C]/50 hover:bg-[#D2A63C]/10"
                    onClick={() => handlePreview(template.id)}
                    disabled={sending}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-500/50 hover:bg-purple-500/10 text-purple-300"
                    onClick={() => {
                      setPreviewTemplateId(template.id)
                      setShowSendTest(true)
                    }}
                    disabled={!mailConfigured || sending}
                    title={!mailConfigured ? "SMTP não configurado" : "Enviar teste"}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    Teste
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Links úteis */}
      <Card className="bg-gray-900/50 border-gray-700/50">
        <CardContent className="p-4">
          <p className="text-sm text-gray-400 mb-3">Recursos relacionados</p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/fast-start"
              target="_blank"
              className="text-sm text-[#D2A63C] hover:underline flex items-center gap-1"
            >
              Fast Start site <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://www.skool.com/morethanmoney-1132/classroom/6124701a?md=0bdb4c0a86a84614ad1ddea4de3baa21"
              target="_blank"
              className="text-sm text-[#D2A63C] hover:underline flex items-center gap-1"
            >
              Fast Start Skool <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/apresentacao"
              target="_blank"
              className="text-sm text-[#D2A63C] hover:underline flex items-center gap-1"
            >
              Apresentação MTM × IQONIC <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C]">{previewSubject}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Pré-visualização com dados de exemplo
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto rounded-lg border border-gray-700 bg-white" style={{ height: "60vh" }}>
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Fechar
            </Button>
            <Button
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
              disabled={!mailConfigured}
              onClick={() => {
                setShowPreview(false)
                setShowSendTest(true)
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar teste
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Test Dialog */}
      <Dialog open={showSendTest} onOpenChange={setShowSendTest}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C]">Enviar email de teste</DialogTitle>
            <DialogDescription className="text-gray-400">
              O assunto será prefixado com [TESTE]
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test-email">Destinatário</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="email@exemplo.com"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowSendTest(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
              onClick={handleSendTest}
              disabled={sending || !testEmail}
            >
              {sending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
