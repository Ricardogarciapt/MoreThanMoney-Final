"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, EyeOff, X, User, Lock, Mail, Calendar, Phone, Instagram } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
}

export default function AuthModal({ isOpen, onClose, title = "Acesso Restrito", description = "Faça login ou registe-se para aceder a este conteúdo" }: AuthModalProps) {
  const { login, register, isLoading } = useAuth()
  const [activeTab, setActiveTab] = useState("login")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Login form
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Register form
  const [registerData, setRegisterData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    username: "",
    birthDate: "",
    whatsapp: "",
    socialMedia: "",
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!loginEmail || !loginPassword) {
      setError("Por favor, preencha todos os campos")
      return
    }

    const result = await login(loginEmail, loginPassword)
    if (result.success) {
      setSuccess("Login realizado com sucesso!")
      setTimeout(() => {
        onClose()
        setLoginEmail("")
        setLoginPassword("")
        setSuccess("")
      }, 1500)
    } else {
      setError(result.error || "Erro ao fazer login")
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (registerData.password !== registerData.confirmPassword) {
      setError("As senhas não coincidem")
      return
    }

    if (registerData.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres")
      return
    }

    const result = await register(registerData.email, registerData.password, {
      fullName: registerData.fullName,
      username: registerData.username,
      birthDate: registerData.birthDate,
      whatsapp: registerData.whatsapp,
      socialMedia: registerData.socialMedia,
      userType: "member",
    })

    if (result.success) {
      setSuccess("Registo realizado com sucesso! Pode agora fazer login.")
      setActiveTab("login")
      setRegisterData({
        email: "",
        password: "",
        confirmPassword: "",
        fullName: "",
        username: "",
        birthDate: "",
        whatsapp: "",
        socialMedia: "",
      })
    } else {
      setError(result.error || "Erro ao registar")
    }
  }

  const updateRegisterData = (field: string, value: string) => {
    setRegisterData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-black/90 border border-gold-500/30">
        <DialogHeader>
          <DialogTitle className="text-gold-100 text-2xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-gold-50/70">{description}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-black/50 border border-gold-500/20">
            <TabsTrigger value="login" className="text-gold-300 data-[state=active]:bg-gold-500/20 data-[state=active]:text-gold-100">
              <User className="w-4 h-4 mr-2" />
              Login
            </TabsTrigger>
            <TabsTrigger value="register" className="text-gold-300 data-[state=active]:bg-gold-500/20 data-[state=active]:text-gold-100">
              <Lock className="w-4 h-4 mr-2" />
              Registar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                  <AlertDescription className="text-red-200">{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="bg-green-500/20 border-green-500/50">
                  <AlertDescription className="text-green-200">{success}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gold-100">Email ou Username</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                  <Input
                    type="text"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="seu@email.com ou username"
                    className="pl-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gold-100">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gold-400"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gold-600 hover:bg-gold-700 text-black font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "A entrar..." : "Entrar"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-6">
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-500/20 border-red-500/50">
                  <AlertDescription className="text-red-200">{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="bg-green-500/20 border-green-500/50">
                  <AlertDescription className="text-green-200">{success}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">Nome Completo</label>
                  <Input
                    type="text"
                    value={registerData.fullName}
                    onChange={(e) => updateRegisterData("fullName", e.target.value)}
                    placeholder="Seu Nome"
                    className="bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">Username</label>
                  <Input
                    type="text"
                    value={registerData.username}
                    onChange={(e) => updateRegisterData("username", e.target.value)}
                    placeholder="username"
                    className="bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gold-100">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                  <Input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => updateRegisterData("email", e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={registerData.password}
                      onChange={(e) => updateRegisterData("password", e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gold-400"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={registerData.confirmPassword}
                      onChange={(e) => updateRegisterData("confirmPassword", e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gold-400"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">Data de Nascimento</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                    <Input
                      type="date"
                      value={registerData.birthDate}
                      onChange={(e) => updateRegisterData("birthDate", e.target.value)}
                      className="pl-10 bg-black/50 border-gold-500/30 text-gold-100"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gold-100">WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                    <Input
                      type="tel"
                      value={registerData.whatsapp}
                      onChange={(e) => updateRegisterData("whatsapp", e.target.value)}
                      placeholder="+351 123 456 789"
                      className="pl-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gold-100">Redes Sociais (opcional)</label>
                <div className="relative">
                  <Instagram className="absolute left-3 top-3 h-4 w-4 text-gold-400" />
                  <Input
                    type="text"
                    value={registerData.socialMedia}
                    onChange={(e) => updateRegisterData("socialMedia", e.target.value)}
                    placeholder="@seu_instagram"
                    className="pl-10 bg-black/50 border-gold-500/30 text-gold-100 placeholder-gold-400/50"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gold-600 hover:bg-gold-700 text-black font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "A registar..." : "Registar"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
