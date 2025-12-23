"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/components/shopping-cart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, ShoppingCart, Star } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface PackageOption {
  id: string
  name: string
  price: number
  period: string
  features: string[]
  recommended?: boolean
  popular?: boolean
  special?: string
}

const packages: PackageOption[] = [
  {
    id: "basic",
    name: "Bootcamp MoreThanMoney",
    price: 50.0,
    period: "único",
    features: [
      "Ebook 'Investir sem Emoções'",
      "Integração com Scanners JIFU",
      "Preparação para upgrade JIFU",
      "Fast-Start para iniciantes",
      "Preparação de Contas",
      "Bonus de Corretora para treino",
      "Semana de free-trial",
      "Desconto para eventos Regionais",
      "Acesso ao fórum da comunidade",
      "Acesso a mentoria privada",
    ],
  },
  {
    id: "education",
    name: "Membro Educação",
    price: 0.0,
    period: "mensal",
    features: [
      "Todos os benefícios do Bootcamp MoreThanMoney",
      "Acesso aos Produtos JIFU",
      "Acesso a Tap2Trade",
      "Acesso a JifuConnect",
      "Suporte prioritário",
      "Webinars mensais exclusivos",
      "Eventos Regionais Exclusivos",
      "Acesso ao canal VIP de sinais",
    ],
    recommended: true,
    special: "Ao comprovares o teu acesso JIFU",
  },
  {
    id: "automation",
    name: "Membro Automatização",
    price: 1000.0,
    period: "único",
    features: [
      "Todos os benefícios dos planos anteriores",
      "Acesso Vitalício aos scanners avançados",
      "Acesso ao canal VIP de sinais",
      "Mentoria mensal individual",
      "Acesso antecipado a novos recursos",
      "€299 reverte para inscrição JIFU",
      "Restante para o sistema de Copytrading MTM",
      "Margem de €1000-1500 no depósito de Sistemas automáticos",
    ],
    popular: true,
  },
]

export default function MembershipPackages() {
  const { user } = useAuth()
  const { addItem, openCart } = useCart()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState<string | null>(null)

  const handleAddToCart = (pkg: PackageOption) => {
    setIsProcessing(pkg.id)

    // Adicionar ao carrinho
    addItem({
      id: `membership-${pkg.id}`,
      name: pkg.name,
      price: pkg.price,
      quantity: 1,
      type: "membership",
      details: {
        duration: pkg.period,
        packageId: pkg.id,
      },
    })

    // Mostrar notificação
    toast({
      title: "Adicionado ao carrinho",
      description: `${pkg.name} foi adicionado ao seu carrinho.`,
      duration: 3000,
    })

    // Abrir o carrinho
    setTimeout(() => {
      openCart()
      setIsProcessing(null)
    }, 500)
  }

  const handleCheckout = (pkg: PackageOption) => {
    if (pkg.price === 0) {
      // Para plano gratuito, redirecionar para verificação JIFU
      router.push("/jifu-education")
      return
    }

    setIsProcessing(pkg.id)

    // Adicionar ao carrinho
    addItem({
      id: `membership-${pkg.id}`,
      name: pkg.name,
      price: pkg.price,
      quantity: 1,
      type: "membership",
      details: {
        duration: pkg.period,
        packageId: pkg.id,
      },
    })

    // Redirecionar para o checkout
    setTimeout(() => {
      router.push("/checkout")
      setIsProcessing(null)
    }, 500)
  }

  const currentPackage = user?.package || "basic"

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
          Gerencie Sua Assinatura
        </h2>
        <p className="text-gray-300">Escolha o pacote que melhor atende às suas necessidades</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map((pkg) => {
          const isCurrentPackage = currentPackage === pkg.id
          const isFree = pkg.price === 0

          return (
            <Card
              key={pkg.id}
              className={`border ${
                pkg.recommended
                  ? "border-gold-500 bg-black/60"
                  : pkg.popular
                    ? "border-blue-500 bg-black/60"
                    : "border-gray-700 bg-black/40"
              } relative overflow-hidden`}
            >
              {pkg.recommended && (
                <div className="absolute top-0 right-0">
                  <Badge className="bg-gold-500 text-black font-medium m-2">
                    <Star className="w-3 h-3 mr-1" />
                    Recomendado
                  </Badge>
                </div>
              )}

              {pkg.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="bg-blue-500 text-white font-medium m-2">Popular</Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-xl font-bold">{pkg.name}</CardTitle>
                <CardDescription className="text-gray-400">
                  {isCurrentPackage && "Seu pacote atual"}
                  {pkg.special && <span className="text-gold-400">{pkg.special}</span>}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="mb-4">
                  {isFree ? (
                    <span className="text-3xl font-bold text-gold-500">GRATUITO</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-white">€{pkg.price.toFixed(2)}</span>
                      <span className="text-gray-400">/{pkg.period}</span>
                    </>
                  )}
                </div>

                <ul className="space-y-2">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col space-y-2">
                <Button
                  onClick={() => handleCheckout(pkg)}
                  disabled={isProcessing !== null || isCurrentPackage}
                  className={`w-full font-semibold ${
                    pkg.recommended
                      ? "bg-gold-600 hover:bg-gold-700 text-black"
                      : pkg.popular
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-600 hover:bg-gray-700 text-white"
                  }`}
                >
                  {isProcessing === pkg.id ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processando...
                    </span>
                  ) : isCurrentPackage ? (
                    "Pacote Atual"
                  ) : isFree ? (
                    "Verificar Acesso JIFU"
                  ) : (
                    "Comprar Agora"
                  )}
                </Button>

                {!isFree && !isCurrentPackage && (
                  <Button
                    onClick={() => handleAddToCart(pkg)}
                    disabled={isProcessing !== null}
                    variant="outline"
                    className="w-full border-gold-500/50 text-gold-500 hover:bg-gold-500/10"
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Adicionar ao Carrinho
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Bootcamp MoreThanMoney como produto separado */}
      <div className="mt-12">
        <h3 className="text-xl font-bold mb-6 text-center">Produtos Educacionais</h3>
        <Card className="bg-black/40 border-gray-700 max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Bootcamp MoreThanMoney</CardTitle>
            <CardDescription>Formação contínua por 1 ano, acesso vitalício</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <span className="text-2xl font-bold text-white">€200</span>
              <span className="text-gray-400"> pagamento único</span>
            </div>
            <ul className="space-y-2">
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Formação contínua por 1 ano completo</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Acesso vitalício ao conteúdo</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Atualizações e novos módulos incluídos</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300">Certificado de conclusão</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => {
                addItem({
                  id: "bootcamp-mtm",
                  name: "Bootcamp MoreThanMoney",
                  price: 200,
                  quantity: 1,
                  type: "bootcamp",
                  details: { duration: "Vitalício" },
                })
                router.push("/checkout")
              }}
              className="w-full bg-gold-600 hover:bg-gold-700 text-black font-semibold"
            >
              Comprar Bootcamp
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-8 bg-black/30 border border-gray-700 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-gold-500 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-medium mb-1">Informações importantes:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>As alterações de pacote entram em vigor imediatamente</li>
              <li>Ao fazer upgrade, você será cobrado apenas pela diferença proporcional ao período restante</li>
              <li>O plano Educação requer comprovação de acesso JIFU ativo</li>
              <li>Para cancelar sua assinatura, entre em contato com nosso suporte</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
