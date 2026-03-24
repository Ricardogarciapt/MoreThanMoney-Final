"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { 
  User, 
  Shield, 
  Mail, 
  Phone, 
  CheckCircle,
  AlertCircle,
  LogOut,
  ArrowLeft,
  Loader2,
  Calendar,
  Lock,
  Eye,
  EyeOff
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { CyberpunkCard } from "@/components/cyberpunk-card"
import NotificationsPanel from "@/components/notifications-panel"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  username?: string
  avatar_url?: string
  user_type?: string
  is_active?: boolean
  phone?: string
  whatsapp?: string
  created_at?: string
}

export default function MemberAreaPage() {
  const [activeTab, setActiveTab] = useState("profile")
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
    phone: "",
    whatsapp: ""
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  })

  const [emailData, setEmailData] = useState({
    newEmail: "",
    password: ""
  })

  useEffect(() => {
    console.log('🔍 [MEMBER AREA] A carregar utilizador...')
    loadUser()
  }, [])

  // Ler tab da query (?tab=...) e ativar ao entrar
  // settings/definicoes → Segurança (palavra-passe, email) — alinhado com /member-area?tab=settings na app mobile
  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (!tab) return
    const t = tab.toLowerCase()
    if (t === 'notifications' || t === 'notificacoes') {
      setActiveTab('notifications')
    } else if (t === 'security' || t === 'seguranca') {
      setActiveTab('security')
    } else if (
      t === 'settings' ||
      t === 'definicoes' ||
      t === 'definições' ||
      t === 'configuracoes' ||
      t === 'configurações'
    ) {
      setActiveTab('security')
    } else if (t === 'profile' || t === 'perfil') {
      setActiveTab('profile')
    }
  }, [searchParams])

  const loadUser = async () => {
    try {
      console.log('🔍 [MEMBER AREA] Verificando sessão...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        console.log('❌ [MEMBER AREA] Sem sessão, redirecionando...')
        setIsLoading(false)
        window.location.href = '/login?redirect=/member-area'
        return
      }

      console.log('✅ [MEMBER AREA] Sessão encontrada:', session.user.email)

      // Buscar perfil com fallback
      let profile = null
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.warn('⚠️ [MEMBER AREA] Erro ao buscar perfil, tentando API...', profileError)
        
        // Fallback: API bypass RLS
        try {
          const apiResponse = await fetch(`/api/profile/get?userId=${session.user.id}`)
          if (apiResponse.ok) {
            const apiData = await apiResponse.json()
            profile = apiData.profile
            console.log('✅ [MEMBER AREA] Perfil via API:', profile?.email)
          }
        } catch (apiError) {
          console.error('❌ [MEMBER AREA] API fallback falhou:', apiError)
        }
        
        // Fallback final: dados da sessão
        if (!profile) {
          console.warn('⚠️ [MEMBER AREA] Usando dados básicos da sessão')
          profile = {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
            username: session.user.email?.split('@')[0],
            avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
            user_type: 'member',
            is_active: true
          }
        }
      } else {
        profile = profileData
      }

      if (profile) {
        console.log('✅ [MEMBER AREA] Perfil carregado:', profile.email)
        setUser({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          username: profile.username,
          avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url,
          user_type: profile.user_type,
          is_active: profile.is_active,
          phone: profile.phone,
          whatsapp: profile.whatsapp,
          created_at: profile.created_at
        })

        setFormData({
          full_name: profile.full_name || "",
          username: profile.username || "",
          email: profile.email || "",
          phone: profile.phone || "",
          whatsapp: profile.whatsapp || ""
        })
      }
    } catch (error) {
      console.error('❌ [MEMBER AREA] Erro crítico:', error)
      setIsLoading(false)
      
      setTimeout(() => {
        window.location.href = '/login?redirect=/member-area'
      }, 1000)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsSaving(true)

    if (!user) {
      setError("Utilizador não autenticado.")
      setIsSaving(false)
      return
    }

    try {
      console.log('📝 [MEMBER AREA] Atualizando perfil...')
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          username: formData.username,
          phone: formData.phone,
          whatsapp: formData.whatsapp,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      console.log('✅ [MEMBER AREA] Perfil atualizado')
      setSuccess("Perfil atualizado com sucesso!")
      setIsEditing(false)
      await loadUser() // Recarregar dados
    } catch (err: any) {
      console.error("❌ [MEMBER AREA] Erro ao atualizar:", err)
      setError(err.message || "Erro ao atualizar perfil")
    } finally {
      setIsSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsSaving(true)

    if (!user) {
      setError("Utilizador não autenticado.")
      setIsSaving(false)
      return
    }

    // Validações
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("As passwords não coincidem.")
      setIsSaving(false)
      return
    }

    if (passwordData.newPassword.length < 6) {
      setError("A password deve ter pelo menos 6 caracteres.")
      setIsSaving(false)
      return
    }

    try {
      console.log('🔐 [MEMBER AREA] Alterando password...')
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (updateError) {
        throw updateError
      }

      console.log('✅ [MEMBER AREA] Password alterada')
      setSuccess("Password alterada com sucesso!")
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      })
    } catch (err: any) {
      console.error("❌ [MEMBER AREA] Erro ao alterar password:", err)
      setError(err.message || "Erro ao alterar password")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsSaving(true)

    if (!user) {
      setError("Utilizador não autenticado.")
      setIsSaving(false)
      return
    }

    if (!emailData.newEmail || !emailData.password) {
      setError("Preencha todos os campos.")
      setIsSaving(false)
      return
    }

    try {
      console.log('📧 [MEMBER AREA] Alterando email...')
      
      const { error: updateError } = await supabase.auth.updateUser({
        email: emailData.newEmail
      })

      if (updateError) {
        throw updateError
      }

      console.log('✅ [MEMBER AREA] Email alterado')
      setSuccess("Email alterado com sucesso! Verifica o teu novo email para confirmar a alteração.")
      setEmailData({
        newEmail: "",
        password: ""
      })
    } catch (err: any) {
      console.error("❌ [MEMBER AREA] Erro ao alterar email:", err)
      setError(err.message || "Erro ao alterar email")
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      console.log('🚪 [MEMBER AREA] Fazendo logout...')
      await supabase.auth.signOut()
      window.location.href = "/new-landing"
    } catch (error) {
      console.error('❌ [MEMBER AREA] Erro no logout:', error)
      window.location.href = "/new-landing"
    }
  }

  // Quando entrar na tab de notificações, marcar como lidas
  useEffect(() => {
    const markAllNotificationsAsRead = async () => {
      try {
        if (!user?.id) return
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
        if (error) {
          console.warn('⚠️ [MEMBER AREA] Falha ao marcar notificações como lidas:', error)
        } else {
          console.log('✅ [MEMBER AREA] Todas as notificações não lidas foram marcadas como lidas')
        }
      } catch (e) {
        console.warn('⚠️ [MEMBER AREA] Falha ao marcar notificações como lidas:', e)
      }
    }
    if (activeTab === 'notifications') {
      markAllNotificationsAsRead()
    }
  }, [activeTab, user?.id])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
          <p className="text-gray-300">A carregar área de membro...</p>
        </div>
      </div>
    )
  }

  const userTypeBadge = {
    admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    trial: { label: "Trial", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    guest: { label: "Guest", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    member: { label: "Membro", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  }
  const badge = userTypeBadge[user.user_type as keyof typeof userTypeBadge] || userTypeBadge.member

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/new-landing">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-[#D2A63C]">Área de Membros</h1>
              <p className="text-gray-300">Gerir os teus dados e configurações</p>
            </div>
          </div>
          <Button 
            onClick={handleLogout}
            variant="outline" 
            className="border-red-500 text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <Alert className="mb-6 bg-red-500/20 border-red-500">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-500">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-500/20 border-green-500">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">{success}</AlertDescription>
          </Alert>
        )}

        {/* User Info Card */}
        <Card className="bg-gray-900/50 border-[#D2A63C]/30 mb-8">
          <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              {user.avatar_url ? (
                <Image 
                  src={user.avatar_url} 
                  alt={user.full_name || user.username || "User"}
                  width={96}
                  height={96}
                  className="rounded-full border-4 border-[#D2A63C]/50 object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#D2A63C] to-[#BB8525] flex items-center justify-center border-4 border-[#D2A63C]/50">
                  <User className="w-12 h-12 text-white" />
                </div>
              )}
              {user.is_active && (
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-2 border-gray-900" title="Conta Ativa">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="text-center md:text-left flex-1">
              <h2 className="text-3xl font-bold text-white mb-1">{user.full_name || user.username || "Utilizador"}</h2>
              <p className="text-gray-400 text-lg mb-2">{user.email}</p>
              <Badge className={badge.color}>{badge.label}</Badge>
              {user.created_at && (
                <p className="text-sm text-gray-500 mt-2 flex items-center justify-center md:justify-start">
                  <Calendar className="w-3 h-3 mr-1" /> Membro desde: {new Date(user.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900 border border-[#D2A63C]/30">
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
              <User className="w-4 h-4 mr-2" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
              <Lock className="w-4 h-4 mr-2" />
              Segurança
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
              <AlertCircle className="w-4 h-4 mr-2" />
              Notificações
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6">
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[#D2A63C] flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Informações Pessoais
                  </CardTitle>
                  <Button
                    onClick={() => setIsEditing(!isEditing)}
                    variant={isEditing ? "outline" : "default"}
                    className={isEditing ? "border-[#D2A63C] text-[#D2A63C]" : "bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black"}
                  >
                    {isEditing ? "Cancelar" : "Editar"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileUpdate} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="full_name" className="text-gray-300">Nome Completo</Label>
                      <Input
                        id="full_name"
                        name="full_name"
                        value={formData.full_name}
                        onChange={handleInputChange}
                        disabled={!isEditing || isSaving}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="username" className="text-gray-300">Nome de Utilizador</Label>
                      <Input
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        disabled={!isEditing || isSaving}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-gray-300">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        disabled
                        className="bg-gray-800 border-gray-700 text-gray-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">O email não pode ser alterado</p>
                    </div>

                    <div>
                      <Label htmlFor="phone" className="text-gray-300">Telefone</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        disabled={!isEditing || isSaving}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="whatsapp" className="text-gray-300">WhatsApp</Label>
                      <Input
                        id="whatsapp"
                        name="whatsapp"
                        value={formData.whatsapp}
                        onChange={handleInputChange}
                        disabled={!isEditing || isSaving}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300">Tipo de Conta</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Shield className="w-4 h-4 text-[#D2A63C]" />
                        <span className="text-[#D2A63C] font-medium capitalize">{user.user_type || "Membro"}</span>
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex gap-4 pt-4">
                      <Button type="submit" disabled={isSaving} className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black">
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {isSaving ? "A guardar..." : "Guardar Alterações"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        variant="outline"
                        className="border-gray-700 text-gray-300"
                        disabled={isSaving}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="mt-6 space-y-6">
            {/* Change Password */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center">
                  <Lock className="w-5 h-5 mr-2" />
                  Alterar Palavra-passe
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <Label htmlFor="newPassword" className="text-gray-300">Nova Palavra-passe</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        disabled={isSaving}
                        className="bg-gray-800 border-gray-700 text-white pr-10"
                        placeholder="Mínimo 6 carateres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword" className="text-gray-300">Confirmar Palavra-passe</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        disabled={isSaving}
                        className="bg-gray-800 border-gray-700 text-white pr-10"
                        placeholder="Repete a nova palavra-passe"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" disabled={isSaving} className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isSaving ? "A alterar..." : "Alterar Palavra-passe"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Change Email */}
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="text-[#D2A63C] flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Alterar Email
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <Label htmlFor="currentEmail" className="text-gray-300">Email Atual</Label>
                    <Input
                      id="currentEmail"
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="bg-gray-800 border-gray-700 text-gray-500"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newEmail" className="text-gray-300">Novo Email</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      value={emailData.newEmail}
                      onChange={(e) => setEmailData(prev => ({ ...prev, newEmail: e.target.value }))}
                      disabled={isSaving}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="novo@email.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="emailPassword" className="text-gray-300">Palavra-passe Atual (para confirmação)</Label>
                    <div className="relative">
                      <Input
                        id="emailPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={emailData.password}
                        onChange={(e) => setEmailData(prev => ({ ...prev, password: e.target.value }))}
                        disabled={isSaving}
                        className="bg-gray-800 border-gray-700 text-white pr-10"
                        placeholder="Confirma a tua palavra-passe"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-sm text-blue-300">
                      ⚠️ Receberás um email de confirmação no novo endereço. O email só será alterado após confirmação.
                    </p>
                  </div>

                  <Button type="submit" disabled={isSaving} className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isSaving ? "A alterar..." : "Alterar Email"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <NotificationsPanel />
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <div className="max-w-4xl mx-auto mt-8">
          <h2 className="text-xl font-semibold text-[#D2A63C] mb-4">Ações Rápidas</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Link href="/scanner-access">
              <Card className="bg-gray-900/50 border-gray-700 hover:border-[#D2A63C]/50 transition-all cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Shield className="w-8 h-8 text-[#D2A63C] mx-auto mb-2" />
                  <h3 className="font-semibold text-white">Scanner ao Vivo</h3>
                  <p className="text-gray-400 text-sm">Aceder aos scanners MTM</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/portfolios">
              <Card className="bg-gray-900/50 border-gray-700 hover:border-[#D2A63C]/50 transition-all cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Shield className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                  <h3 className="font-semibold text-white">Portfólios</h3>
                  <p className="text-gray-400 text-sm">Portfólios inteligentes</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/automation">
              <CyberpunkCard animationDirection="bottom" delay={0}>
                <div className="p-4 text-center">
                  <div className="cyberpunk-icon mx-auto mb-4">
                    <Shield className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="font-bold text-white mb-2">Automatização</h3>
                  <p className="text-gray-400 text-sm">Ferramentas automáticas</p>
                </div>
              </CyberpunkCard>
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
