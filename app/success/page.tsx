"use client"

import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, ArrowRight, Home } from "lucide-react"

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const message = searchParams.get('message')

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="card-clean border-2 border-green-500/30">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-20 h-20 text-green-500" />
            </div>
            <CardTitle className="text-4xl text-green-400">
              ✅ Sucesso!
            </CardTitle>
            <p className="text-gray-300 mt-4 text-lg">
              {message || "Ação realizada com sucesso!"}
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-green-400 mb-2">
                🎉 Operação Concluída!
              </h3>
              <p className="text-gray-300">
                A tua ação foi processada com sucesso. Podes continuar a usar a plataforma normalmente.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => window.location.href = '/new-landing'}
                className="btn-primary flex-1"
              >
                <Home className="w-4 h-4 mr-2" />
                Ir para Início
              </Button>
              
              <Button 
                onClick={() => window.location.href = '/login'}
                variant="outline"
                className="flex-1"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Fazer Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
