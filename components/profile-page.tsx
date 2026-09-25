"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Check, AlertCircle, User, Lock, Bell, Shield, Clock, CheckCircle, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface RoleRequest {
  id: string
  current_role: string
  requested_role: string
  reason: string
  status: "pending" | "approved" | "rejected"
  admin_notes?: string
  created_at: string
  processed_at?: string
}

export default function ProfilePage() {
  const { user, isAuthenticated, isAdmin, refreshUser } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("account")
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    username: "",
    phone: "",
    whatsapp: "",
    social_media: "",
    jifu_id: "",
    jifu_affiliate_link: "",
    birth_date: "",
  })
  const [roleRequestData, setRoleRequestData] = useState({
    requestedRole: "",
    reason: "",
  })
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [error, setError] = useState("")

  // Redirecionar se não estiver autenticado
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/")
    }
  }, [isAuthenticated, router])

  // Preencher dados do usuário
  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        email: user.email || "",
        username: user.username || "",
        phone: user.phone || "",
        whatsapp: user.whatsapp || "",
        social_media: user.social_media || "",
        jifu_id: user.jifu_id || "",
        jifu_affiliate_link: user.jifu_affiliate_link || "",
        birth_date: user.birth_date || "",
      })
    }
  }, [user])

  // Carregar pedidos de role
  useEffect(() => {
    if (user?.id) {
      loadRoleRequests()
    }
  }, [user?.id])

  const loadRoleRequests = async () => {
    try {
      const response = await fetch(`/api/profile/role-request?userId=${user?.id}`)
      const data = await response.json()

      if (data.success) {
        setRoleRequests(data.requests)
      }
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError("")
    setSaveMessage("")

    try {
      const response = await fetch("/api/profile/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user?.id,
          updates: formData,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSaveMessage(data.message)
        // Recarregar o contexto a partir da BD. Aqui chamava-se um `updateUser`
        // que o AuthContext nunca expos: o `if` era sempre falso e o perfil em
        // memoria ficava desactualizado ate ao proximo refresh da pagina.
        await refreshUser()
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError("Erro ao salvar alterações")
    } finally {
      setIsSaving(false)

      // Limpar mensagens após 3 segundos
      setTimeout(() => {
        setSaveMessage("")
        setError("")
      }, 3000)
    }
  }

  const handleRoleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingRole(true)
    setError("")
    setSaveMessage("")

    try {
      const response = await fetch("/api/profile/role-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user?.id,
          requestedRole: roleRequestData.requestedRole,
          reason: roleRequestData.reason,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSaveMessage(data.message)
        setRoleRequestData({ requestedRole: "", reason: "" })
        loadRoleRequests() // Recarregar lista
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError("Erro ao enviar pedido")
    } finally {
      setIsSubmittingRole(false)

      // Limpar mensagens após 3 segundos
      setTimeout(() => {
        setSaveMessage("")
        setError("")
      }, 3000)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/20 text-yellow-400"
      case "approved":
        return "bg-green-500/20 text-green-400"
      case "rejected":
        return "bg-red-500/20 text-red-400"
      default:
        return "bg-gray-500/20 text-gray-400"
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <main className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-4">
            <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex flex-col items-center py-4">
                  <div className="h-20 w-20 rounded-full bg-gold-500/20 flex items-center justify-center mb-4">
                    <User className="h-10 w-10 text-gold-500" />
                  </div>
                  <h3 className="text-xl font-bold">{user?.full_name || user?.username}</h3>
                  <p className="text-sm text-gray-400">{user?.email}</p>
                  {user?.user_type && (
                    <Badge className={`mt-2 ${getStatusColor(user.user_type)}`}>{user.user_type}</Badge>
                  )}
                </div>

                <div className="mt-6 space-y-2">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start ${activeTab === "account" ? "bg-gold-500/10 text-gold-400" : "text-gray-300 hover:bg-gold-500/5 hover:text-gold-400"}`}
                    onClick={() => setActiveTab("account")}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Dados Pessoais
                  </Button>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start ${activeTab === "role" ? "bg-gold-500/10 text-gold-400" : "text-gray-300 hover:bg-gold-500/5 hover:text-gold-400"}`}
                    onClick={() => setActiveTab("role")}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Mudança de Role
                  </Button>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start ${activeTab === "security" ? "bg-gold-500/10 text-gold-400" : "text-gray-300 hover:bg-gold-500/5 hover:text-gold-400"}`}
                    onClick={() => setActiveTab("security")}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Segurança
                  </Button>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start ${activeTab === "notifications" ? "bg-gold-500/10 text-gold-400" : "text-gray-300 hover:bg-gold-500/5 hover:text-gold-400"}`}
                    onClick={() => setActiveTab("notifications")}
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Notificações
                  </Button>
                  {isAdmin && (
                    <Link href="/admin">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-gray-300 hover:bg-gold-500/5 hover:text-gold-400"
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Painel Admin
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="hidden md:block">
              <Link href="/member-area">
                <Button variant="outline" className="w-full border-gold-500 text-gold-400 hover:bg-gold-500/10">
                  Voltar para Área de Membro
                </Button>
              </Link>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {saveMessage && (
              <div className="mb-6 p-3 bg-green-500/20 border border-green-500/30 rounded-md flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-green-400">{saveMessage}</span>
              </div>
            )}

            {error && (
              <div className="mb-6 p-3 bg-red-500/20 border border-red-500/30 rounded-md flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-red-400">{error}</span>
              </div>
            )}

            {activeTab === "account" && (
              <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Dados Pessoais</CardTitle>
                  <CardDescription>Atualize suas informações pessoais</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveAccount} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nome Completo</Label>
                        <Input
                          id="full_name"
                          name="full_name"
                          value={formData.full_name}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="username">Nome de Usuário</Label>
                        <Input
                          id="username"
                          name="username"
                          value={formData.username}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="bg-gray-800/50 border-white/10 text-white"
                        disabled
                      />
                      <p className="text-xs text-gray-400">O email não pode ser alterado</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                          placeholder="+351 123 456 789"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="whatsapp">WhatsApp</Label>
                        <Input
                          id="whatsapp"
                          name="whatsapp"
                          value={formData.whatsapp}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                          placeholder="+351 123 456 789"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="birth_date">Data de Nascimento</Label>
                      <Input
                        id="birth_date"
                        name="birth_date"
                        type="date"
                        value={formData.birth_date}
                        onChange={handleChange}
                        className="bg-gray-800/50 border-white/10 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="social_media">Redes Sociais</Label>
                      <Input
                        id="social_media"
                        name="social_media"
                        value={formData.social_media}
                        onChange={handleChange}
                        className="bg-gray-800/50 border-white/10 text-white"
                        placeholder="Instagram, LinkedIn, etc."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="jifu_id">ID da JIFU</Label>
                        <Input
                          id="jifu_id"
                          name="jifu_id"
                          value={formData.jifu_id}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                          placeholder="Seu ID na plataforma JIFU"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="jifu_affiliate_link">Link de Afiliado JIFU</Label>
                        <Input
                          id="jifu_affiliate_link"
                          name="jifu_affiliate_link"
                          value={formData.jifu_affiliate_link}
                          onChange={handleChange}
                          className="bg-gray-800/50 border-white/10 text-white"
                          placeholder="seunome.jifu.com"
                        />
                      </div>
                    </div>

                    {formData.jifu_affiliate_link && (
                      <div className="mt-2 p-3 bg-gold-500/10 border border-gold-500/30 rounded-md">
                        <p className="text-sm font-medium mb-1">Seu link personalizado para Educação JIFU:</p>
                        <p className="text-gold-400 text-sm break-all">
                          {typeof window !== "undefined" &&
                            `${window.location.origin}/jifu-education?ref=${formData.jifu_affiliate_link.split(".")[0]}`}
                        </p>
                      </div>
                    )}

                    <Button type="submit" className="bg-gold-600 hover:bg-gold-700 text-black" disabled={isSaving}>
                      {isSaving ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {activeTab === "role" && (
              <div className="space-y-6">
                <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Solicitar Mudança de Role</CardTitle>
                    <CardDescription>
                      Solicite uma mudança no seu tipo de conta. O pedido será analisado por um administrador.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRoleRequest} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="requestedRole">Role Solicitado</Label>
                        <Select
                          value={roleRequestData.requestedRole}
                          onValueChange={(value) => setRoleRequestData((prev) => ({ ...prev, requestedRole: value }))}
                        >
                          <SelectTrigger className="bg-gray-800/50 border-white/10 text-white">
                            <SelectValue placeholder="Selecione o role desejado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="affiliate">Afiliado</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reason">Motivo da Solicitação</Label>
                        <Textarea
                          id="reason"
                          value={roleRequestData.reason}
                          onChange={(e) => setRoleRequestData((prev) => ({ ...prev, reason: e.target.value }))}
                          className="bg-gray-800/50 border-white/10 text-white"
                          placeholder="Explique por que deseja esta mudança de role..."
                          rows={4}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="bg-gold-600 hover:bg-gold-700 text-black"
                        disabled={isSubmittingRole || !roleRequestData.requestedRole}
                      >
                        {isSubmittingRole ? "Enviando..." : "Enviar Solicitação"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Histórico de Pedidos */}
                <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Histórico de Solicitações</CardTitle>
                    <CardDescription>Acompanhe o status das suas solicitações de mudança de role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {roleRequests.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">Nenhuma solicitação encontrada</p>
                    ) : (
                      <div className="space-y-4">
                        {roleRequests.map((request) => (
                          <div key={request.id} className="border border-white/10 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(request.status)}
                                <span className="font-medium">
                                  {request.current_role} → {request.requested_role}
                                </span>
                              </div>
                              <Badge className={getStatusColor(request.status)}>{request.status}</Badge>
                            </div>

                            {request.reason && (
                              <p className="text-sm text-gray-300 mb-2">
                                <strong>Motivo:</strong> {request.reason}
                              </p>
                            )}

                            {request.admin_notes && (
                              <p className="text-sm text-gray-300 mb-2">
                                <strong>Notas do Admin:</strong> {request.admin_notes}
                              </p>
                            )}

                            <p className="text-xs text-gray-400">
                              Solicitado em: {new Date(request.created_at).toLocaleDateString("pt-PT")}
                              {request.processed_at && (
                                <> • Processado em: {new Date(request.processed_at).toLocaleDateString("pt-PT")}</>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "security" && (
              <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Segurança</CardTitle>
                  <CardDescription>Configure opções de segurança da sua conta</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border border-white/10 rounded-lg">
                      <h4 className="font-medium mb-2">Alterar Senha</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Para alterar sua senha, você precisará fazer logout e usar a opção "Esqueci minha senha" no
                        login.
                      </p>
                      <Button variant="outline" className="border-gold-500 text-gold-400 hover:bg-gold-500/10">
                        Ir para Login
                      </Button>
                    </div>

                    <div className="p-4 border border-white/10 rounded-lg">
                      <h4 className="font-medium mb-2">Autenticação de Dois Fatores</h4>
                      <p className="text-sm text-gray-400 mb-4">Adicione uma camada extra de segurança à sua conta.</p>
                      <Button variant="outline" className="border-gray-500 text-gray-400" disabled>
                        Em Breve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "notifications" && (
              <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Notificações</CardTitle>
                  <CardDescription>Configure suas preferências de notificação</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Notificações por Email</h4>
                        <p className="text-sm text-gray-400">Receba atualizações sobre novos conteúdos e eventos</p>
                      </div>
                      <div className="w-12 h-6 flex items-center bg-green-500/20 justify-end rounded-full p-1 cursor-pointer">
                        <div className="h-4 w-4 rounded-full bg-green-500"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Notificações de Trading</h4>
                        <p className="text-sm text-gray-400">Alertas sobre sinais de trading e oportunidades</p>
                      </div>
                      <div className="w-12 h-6 flex items-center bg-green-500/20 justify-end rounded-full p-1 cursor-pointer">
                        <div className="h-4 w-4 rounded-full bg-green-500"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Notificações de Marketing</h4>
                        <p className="text-sm text-gray-400">Promoções, ofertas e novidades</p>
                      </div>
                      <div className="w-12 h-6 flex items-center bg-gray-700 justify-start rounded-full p-1 cursor-pointer">
                        <div className="h-4 w-4 rounded-full bg-gray-400"></div>
                      </div>
                    </div>

                    <Button className="mt-6 bg-gold-600 hover:bg-gold-700 text-black">Salvar Preferências</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="md:hidden mt-8">
          <Link href="/member-area">
            <Button variant="outline" className="w-full border-gold-500 text-gold-400 hover:bg-gold-500/10">
              Voltar para Área de Membro
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
