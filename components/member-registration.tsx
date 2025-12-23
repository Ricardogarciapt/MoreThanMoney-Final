"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, AlertCircle, Info } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

export default function MemberRegistration() {
  const { register } = useAuth()
  const router = useRouter()

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    socialLink: "",
    username: "",
    password: "",
    confirmPassword: "",
    jifuId: "",
    selectedPackage: "basic",
    paymentOption: "annual", // ou "lifetime" para o pacote Scanner
    acceptTerms: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // Limpar erro de senha quando o usuário digita
    if (name === "password" || name === "confirmPassword") {
      setPasswordError("")
    }
  }

  const handleCheckboxChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, acceptTerms: checked }))
  }

  const handlePackageSelect = (value: string) => {
    setFormData((prev) => ({ ...prev, selectedPackage: value }))
  }

  const handlePaymentOptionSelect = (value: string) => {
    setFormData((prev) => ({ ...prev, paymentOption: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")
    setPasswordError("")
    setSuccess(false)

    // Validação básica
    if (!formData.name || !formData.email || !formData.phone || !formData.username || !formData.password) {
      setError("Por favor, preencha todos os campos obrigatórios.")
      setIsSubmitting(false)
      return
    }

    // Validação de senha
    if (formData.password.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.")
      setIsSubmitting(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setPasswordError("As senhas não coincidem.")
      setIsSubmitting(false)
      return
    }

    // Validação de termos
    if (!formData.acceptTerms) {
      setError("Você precisa aceitar a política de proteção de dados para continuar.")
      setIsSubmitting(false)
      return
    }

    try {
      const result = await register(
        formData.email,
        formData.password,
        {
          fullName: formData.name,
          username: formData.username,
          whatsapp: formData.phone,
          socialMedia: formData.socialLink,
          jifuId: formData.jifuId,
          userType: "member"
        }
      )

      if (result.success) {
        setSuccess(true)
        // Redirecionar após 2 segundos
        setTimeout(() => {
          router.push("/member-area")
        }, 2000)
      } else {
        setError(result.error || "Nome de usuário já existe. Por favor, escolha outro.")
      }
    } catch (err) {
      setError("Ocorreu um erro ao processar seu registro. Por favor, tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Função para obter o preço com base no pacote e opção selecionados
  const getPackagePrice = () => {
    if (formData.selectedPackage === "basic") {
      return "€50/mês"
    } else if (formData.selectedPackage === "scanner") {
      return formData.paymentOption === "annual" ? "€200/ano" : "€1000/vitalício"
    } else {
      return "Verificação de ID JIFU"
    }
  }

  return (
    <section className="py-20 bg-black relative">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
            Torne-se Membro MoreThanMoney
          </h2>
          <p className="text-xl text-gray-300 mb-12">
            Escolha o pacote que melhor se adapta às suas necessidades e comece sua jornada para o sucesso financeiro.
          </p>
        </div>

        {success ? (
          <Card className="max-w-3xl mx-auto bg-black/50 border-gold-500/30 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Registro Concluído com Sucesso!</h3>
                <p className="text-gray-300 mb-6">
                  Obrigado por se tornar um membro MoreThanMoney. Você será redirecionado para a área de membros em
                  instantes.
                </p>
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-500 mx-auto"></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Pacote Básico */}
            <Card
              className={`bg-black/50 border-gold-500/30 backdrop-blur-sm hover:border-gold-500/70 transition-all duration-300 ${formData.selectedPackage === "basic" ? "ring-2 ring-gold-500" : ""}`}
            >
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">Pacote Básico</CardTitle>
                <div className="text-center mt-4">
                  <span className="text-4xl font-bold text-gold-500">€50</span>
                  <span className="text-gray-400 ml-2">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso ao Bootcamp MoreThanMoney</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Ebook "Investir sem Emoções" (oferta)</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso ao portfólio MTM</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={`w-full ${formData.selectedPackage === "basic" ? "bg-gold-600 text-black" : "bg-gray-800 text-white"}`}
                  onClick={() => {
                    // Adicionar ao carrinho e redirecionar para checkout
                    const cartItem = {
                      id: "basic-monthly",
                      name: "Pacote Básico - Mensal",
                      price: 50,
                      quantity: 1,
                      type: "subscription",
                    }

                    // Salvar no localStorage
                    const existingCart = JSON.parse(localStorage.getItem("cart") || "[]")
                    const updatedCart = [...existingCart.filter((item: any) => item.id !== "basic-monthly"), cartItem]
                    localStorage.setItem("cart", JSON.stringify(updatedCart))

                    // Redirecionar para checkout
                    window.location.href = "/checkout"
                  }}
                >
                  Assinar por €50/mês
                </Button>
              </CardFooter>
            </Card>

            {/* Pacote Scanner */}
            <Card
              className={`bg-black/50 border-gold-500/30 backdrop-blur-sm hover:border-gold-500/70 transition-all duration-300 relative overflow-hidden ${formData.selectedPackage === "scanner" ? "ring-2 ring-gold-500" : ""}`}
            >
              <div className="absolute top-0 right-0 bg-gold-500 text-black px-4 py-1 text-sm font-bold">POPULAR</div>
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">Pacote Scanner</CardTitle>
                <div className="text-center mt-4">
                  {formData.selectedPackage === "scanner" && (
                    <div className="flex justify-center gap-4 mb-4">
                      <Button
                        variant={formData.paymentOption === "annual" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePaymentOptionSelect("annual")}
                        className={
                          formData.paymentOption === "annual"
                            ? "bg-gold-600 text-black"
                            : "border-gold-500 text-gold-400"
                        }
                      >
                        Anual - €200
                      </Button>
                      <Button
                        variant={formData.paymentOption === "lifetime" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePaymentOptionSelect("lifetime")}
                        className={
                          formData.paymentOption === "lifetime"
                            ? "bg-gold-600 text-black"
                            : "border-gold-500 text-gold-400"
                        }
                      >
                        Vitalício - €1000
                      </Button>
                    </div>
                  )}
                  <span className="text-4xl font-bold text-gold-500">+</span>
                  <span className="text-gray-400 ml-2">Licença Scanner</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Todos os benefícios do Pacote Básico</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso a condições especiais de copytrading</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso a eventos regionais</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso a mentorias de livetrading</span>
                  </li>
                  <li className="flex items-start text-sm text-gray-400">
                    <span>* Requer compra de qualquer licença Scanner</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={`w-full ${formData.selectedPackage === "scanner" ? "bg-gold-600 text-black" : "bg-gray-800 text-white"}`}
                  onClick={() => handlePackageSelect("scanner")}
                >
                  {formData.selectedPackage === "scanner" ? "Selecionado" : "Selecionar Scanner"}
                </Button>
              </CardFooter>
            </Card>

            {/* Pacote Premium */}
            <Card
              className={`bg-black/50 border-gold-500/30 backdrop-blur-sm hover:border-gold-500/70 transition-all duration-300 ${formData.selectedPackage === "premium" ? "ring-2 ring-gold-500" : ""}`}
            >
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">Pacote Premium</CardTitle>
                <div className="text-center mt-4">
                  <span className="text-4xl font-bold text-gold-500">+</span>
                  <span className="text-gray-400 ml-2">Verificação JIFU</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Todos os benefícios dos pacotes anteriores</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso a eventos de educação presenciais (15 dias, trimestrais)</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-gold-500 mr-2 shrink-0 mt-0.5" />
                    <span>Acesso a todos os produtos MoreThanMoney</span>
                  </li>
                  <li className="flex items-start text-sm text-gray-400">
                    <span>* Requer verificação do ID JIFU</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={`w-full ${formData.selectedPackage === "premium" ? "bg-gold-600 text-black" : "bg-gray-800 text-white"}`}
                  onClick={() => handlePackageSelect("premium")}
                >
                  {formData.selectedPackage === "premium" ? "Selecionado" : "Verificar JIFU"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {!success && (
          <Card className="max-w-3xl mx-auto mt-12 bg-black/50 border-gold-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Informações de Registro</CardTitle>
              <CardDescription>Preencha seus dados para se tornar um membro MoreThanMoney</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 text-red-200 p-3 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone/WhatsApp *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="socialLink">Link de Rede Social (opcional)</Label>
                  <Input
                    id="socialLink"
                    name="socialLink"
                    value={formData.socialLink}
                    onChange={handleChange}
                    placeholder="https://instagram.com/seu_perfil"
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                </div>

                {formData.selectedPackage === "premium" && (
                  <div className="space-y-2">
                    <Label htmlFor="jifuId">Número de ID JIFU *</Label>
                    <Input
                      id="jifuId"
                      name="jifuId"
                      value={formData.jifuId}
                      onChange={handleChange}
                      required={formData.selectedPackage === "premium"}
                      className="bg-gray-800/50 border-white/10 text-white"
                    />
                    <p className="text-xs text-gray-400">Necessário para verificação do status de fundador JIFU.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username">Nome de Usuário *</Label>
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                  <p className="text-xs text-gray-400">Este será seu nome de usuário para acessar a área de membros.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                  <p className="text-xs text-gray-400">A senha deve ter pelo menos 6 caracteres.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="bg-gray-800/50 border-white/10 text-white"
                  />
                  {passwordError && <p className="text-xs text-red-400 mt-1">{passwordError}</p>}
                </div>

                <div className="pt-4">
                  <p className="font-medium mb-2">Pacote Selecionado:</p>
                  <div className="bg-gray-800/50 p-3 rounded-md">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-gold-500/20 flex items-center justify-center mr-3">
                        <Check className="h-4 w-4 text-gold-500" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {formData.selectedPackage === "basic" && "Pacote Básico"}
                          {formData.selectedPackage === "scanner" && "Pacote Scanner"}
                          {formData.selectedPackage === "premium" && "Pacote Premium"}
                        </p>
                        <p className="text-sm text-gray-400">{getPackagePrice()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-2 pt-4">
                  <Checkbox
                    id="terms"
                    checked={formData.acceptTerms}
                    onCheckedChange={handleCheckboxChange}
                    className="mt-1"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Aceito a Política de Proteção de Dados
                    </label>
                    <p className="text-sm text-gray-400">
                      Ao marcar esta caixa, você concorda com nossa{" "}
                      <Link href="/privacy-policy" className="text-gold-400 hover:underline">
                        Política de Proteção de Dados
                      </Link>{" "}
                      e autoriza o processamento de suas informações pessoais conforme descrito.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-4 flex items-start space-x-3">
                  <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-300">
                      Seus dados serão utilizados apenas para fins de registro e comunicação relacionada aos serviços
                      MoreThanMoney. Não compartilhamos suas informações com terceiros sem seu consentimento explícito.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gold-600 hover:bg-gold-700 text-black"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processando..." : "Finalizar Registro"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}
