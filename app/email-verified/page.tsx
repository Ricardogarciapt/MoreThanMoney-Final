"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Eye, EyeOff, Copy, ExternalLink } from "lucide-react"

export default function EmailVerifiedPage() {
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const email = searchParams.get('email')
  const username = searchParams.get('username')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="card-clean border-2 border-green-500/30">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <CardTitle className="text-3xl text-green-400">
              🎉 Email Verificado com Sucesso!
            </CardTitle>
            <p className="text-gray-300 mt-2">
              Olá! O teu email foi verificado e já podes aceder à plataforma MoreThanMoney
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Dados de Login */}
            <div className="bg-gray-800/50 rounded-lg p-6">
              <h3 className="text-xl font-bold text-amber-400 mb-4">
                📋 Os Teus Dados de Login
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                  <div>
                    <label className="text-sm text-gray-400">Email</label>
                    <p className="text-white font-mono">{email}</p>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(email || '')}
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {copied ? 'Copiado!' : 'Copiar'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                  <div>
                    <label className="text-sm text-gray-400">Username</label>
                    <p className="text-white font-mono">{username}</p>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(username || '')}
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {copied ? 'Copiado!' : 'Copiar'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Próximos Passos */}
            <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 rounded-lg p-6 border border-amber-500/30">
              <h3 className="text-xl font-bold text-amber-400 mb-4">
                🚀 Próximos Passos para o Teu Sucesso
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <span className="bg-amber-600 text-black rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
                  <div>
                    <p className="text-white font-medium">Faz Login na Plataforma</p>
                    <p className="text-gray-400 text-sm">Usa os dados acima para acederes ao teu painel pessoal</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <span className="bg-amber-600 text-black rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</span>
                  <div>
                    <p className="text-white font-medium">Explora os Scanners AI</p>
                    <p className="text-gray-400 text-sm">Acede aos nossos scanners avançados e começa a ter lucros</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <span className="bg-amber-600 text-black rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
                  <div>
                    <p className="text-white font-medium">Junta-te à Comunidade</p>
                    <p className="text-gray-400 text-sm">Conecta-te com outros traders e partilha estratégias</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => window.location.href = '/login'}
                className="btn-primary flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Fazer Login Agora
              </Button>
              
              <Button 
                onClick={() => window.location.href = '/new-landing'}
                variant="outline"
                className="flex-1"
              >
                Explorar Plataforma
              </Button>
            </div>

            {/* Mensagem de Boas-Vindas */}
            <div className="text-center bg-gray-800/30 rounded-lg p-4">
              <p className="text-gray-300">
                <strong className="text-amber-400">Bem-vindo à família MoreThanMoney!</strong><br/>
                Estamos aqui para te ajudar a transformar a tua vida financeira. 
                Se tiveres alguma dúvida, não hesites em contactar-nos.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
