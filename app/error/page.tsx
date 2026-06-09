"use client"

import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { XCircle, ArrowLeft, Home, Mail } from "lucide-react"

export default function ErrorPage() {
  const searchParams = useSearchParams()
  const message = searchParams.get('message')

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="card-clean border-2 border-red-500/30">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-6">
              <XCircle className="w-20 h-20 text-red-500" />
            </div>
            <CardTitle className="text-4xl text-red-400">
              ❌ Erro
            </CardTitle>
            <p className="text-gray-300 mt-4 text-lg">
              {message || "Ocorreu um erro inesperado."}
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-red-400 mb-2">
                😔 Algo Correu Mal
              </h3>
              <p className="text-gray-300 mb-4">
                Não conseguimos processar a tua solicitação. Isto pode acontecer por várias razões:
              </p>
              <ul className="text-gray-400 text-left space-y-2">
                <li>• Link expirado ou inválido</li>
                <li>• Problemas temporários de conectividade</li>
                <li>• Ação já foi processada anteriormente</li>
                <li>• Dados incorretos ou em falta</li>
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-amber-400 mb-2">
                🤝 Precisa de Ajuda?
              </h3>
              <p className="text-gray-300 mb-4">
                Se continuas a ter problemas, não hesites em contactar-nos!
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a 
                  href="mailto:morethanmoneypt@gmail.com"
                  className="flex items-center justify-center gap-2 bg-amber-600 text-black px-4 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Enviar Email
                </a>
                <a 
                  href="https://wa.me/message/5NMUP53HEXVMB1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-mtm-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => window.history.back()}
                variant="outline"
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              
              <Button 
                onClick={() => window.location.href = '/new-landing'}
                className="btn-primary flex-1"
              >
                <Home className="w-4 h-4 mr-2" />
                Ir para Início
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
