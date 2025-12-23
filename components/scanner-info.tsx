"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X, BarChart2, TrendingUp, Target, AlertTriangle } from "lucide-react"

interface ScannerInfoProps {
  onClose: () => void
}

export default function ScannerInfo({ onClose }: ScannerInfoProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto">
      <Card className="bg-black/90 border-gold-500/30 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-black z-10 border-b border-gold-500/20 pb-4">
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
            O que é o Scanner MoreThanMoney?
          </CardTitle>
          <Button className="bg-gold-600 hover:bg-gold-700 text-black" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-8">
            <div className="text-center mb-8">
              <div className="h-20 w-20 rounded-full bg-gold-500/20 flex items-center justify-center mx-auto mb-4">
                <BarChart2 className="h-10 w-10 text-gold-500" />
              </div>
              <p className="text-gray-300 text-lg">
                O Scanner MoreThanMoney é uma ferramenta avançada de análise de mercado que utiliza inteligência
                artificial para identificar oportunidades de trading com alta probabilidade de sucesso.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-black/50 border border-gold-500/20 rounded-lg p-5">
                <div className="h-12 w-12 rounded-full bg-gold-500/20 flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-gold-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Análise em Tempo Real</h3>
                <p className="text-gray-300">
                  Monitora múltiplos pares de moedas simultaneamente, identificando padrões e estruturas de mercado em
                  tempo real.
                </p>
              </div>

              <div className="bg-black/50 border border-gold-500/20 rounded-lg p-5">
                <div className="h-12 w-12 rounded-full bg-gold-500/20 flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-gold-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Sinais Precisos</h3>
                <p className="text-gray-300">
                  Gera sinais de entrada e saída baseados em algoritmos proprietários e análise técnica avançada.
                </p>
              </div>

              <div className="bg-black/50 border border-gold-500/20 rounded-lg p-5">
                <div className="h-12 w-12 rounded-full bg-gold-500/20 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-gold-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Gestão de Risco</h3>
                <p className="text-gray-300">
                  Inclui recomendações de stop loss e take profit para cada operação, maximizando o potencial de lucro.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-bold mb-4">Como Utilizar o Scanner</h3>
              <ol className="space-y-4 text-gray-300">
                <li className="flex">
                  <span className="font-bold text-gold-500 mr-2">1.</span>
                  <span>
                    <strong>Observe os Sinais:</strong> O scanner exibe sinais de compra e venda em diferentes
                    timeframes. Sinais verdes indicam compra, vermelhos indicam venda.
                  </span>
                </li>
                <li className="flex">
                  <span className="font-bold text-gold-500 mr-2">2.</span>
                  <span>
                    <strong>Verifique a Força do Sinal:</strong> A intensidade do sinal é indicada por uma escala de 1 a
                    5. Quanto maior o número, mais forte é o sinal.
                    A inclinação das EMAS a favor da Tendência e o preço cruzando o POC valida a entrada.
                  </span>
                </li>
                <li className="flex">
                  <span className="font-bold text-gold-500 mr-2">3.</span>
                  <span>
                    <strong>Confirme com Múltiplos Timeframes:</strong> Para maior segurança, busque sinais que se
                    confirmem em diferentes timeframes.
                  </span>
                </li>
                <li className="flex">
                  <span className="font-bold text-gold-500 mr-2">4.</span>
                  <span>
                    <strong>Siga as Recomendações:</strong> Utilize os níveis de stop loss e take profit sugeridos pelo
                    scanner.
                  </span>
                </li>
              </ol>
            </div>

            <div className="bg-gold-500/10 border border-gold-500/30 rounded-lg p-5 mt-8">
              <h3 className="text-xl font-bold mb-2">Ideal para Iniciantes</h3>
              <p className="text-gray-300">
                O Scanner MTM foi desenvolvido pensando em traders de todos os níveis, especialmente iniciantes. Sua
                interface intuitiva e sinais claros eliminam a complexidade da análise técnica tradicional, permitindo
                que você tome decisões informadas sem precisar ser um especialista em gráficos.
              </p>
            </div>

            <div className="text-center mt-8">
              <Button
                onClick={onClose}
                className="bg-gold-600 hover:bg-gold-700 text-black font-medium px-8 py-6 text-lg"
              >
                Voltar ao Scanner
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
