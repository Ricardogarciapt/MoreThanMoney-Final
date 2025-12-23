import Breadcrumbs from "@/components/breadcrumbs"
import TradingViewWidget from "@/components/trading-view-widget"
import { MembershipRequired } from "@/components/membership-required"

export default function MTMGoldKillerPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8 text-gold-500">MTM Gold Killer V2.1</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-gray-900 rounded-lg border border-gold-500/30 p-4 mb-8">
              <h2 className="text-2xl font-semibold text-gold-500 mb-4">
                Scanner MTM Gold Killer - Visualização ao Vivo
              </h2>
              <MembershipRequired>
                <TradingViewWidget scannerType="scanner2" />
              </MembershipRequired>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-gray-900 rounded-lg border border-gold-500/30 p-6">
              <h2 className="text-2xl font-semibold text-gold-500 mb-4">Sobre o MTM Gold Killer</h2>
              <div className="prose prose-invert max-w-none">
                <p className="mb-4">
                  O MTM Gold Killer V2.1 é um indicador avançado projetado especificamente para o mercado de ouro
                  (XAUUSD), oferecendo sinais precisos para operações de day trade e swing trade.
                </p>

                <h3 className="text-xl font-medium text-gold-400 mt-6 mb-3">Características Principais:</h3>
                <ul className="list-disc pl-5 space-y-2 mb-6">
                  <li>Identificação de estruturas de mercado (suportes e resistências)</li>
                  <li>Detecção de zonas de liquidez</li>
                  <li>Análise de volatilidade baseada em ATR</li>
                  <li>Sinais de entrada e saída otimizados para ouro</li>
                  <li>Alertas personalizáveis</li>
                </ul>

                <h3 className="text-xl font-medium text-gold-400 mt-6 mb-3">Como Utilizar:</h3>
                <p className="mb-4">
                  O indicador exibe sinais de compra e venda diretamente no gráfico, com setas verdes para entradas de
                  compra e setas vermelhas para entradas de venda. As zonas de suporte e resistência são destacadas
                  para auxiliar na tomada de decisão.
                </p>

                <div className="mt-6">
                  <a
                    href="https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-gold-600 text-black rounded-md hover:bg-gold-700 transition-colors"
                  >
                    Ver no TradingView
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-gray-900 rounded-lg border border-gold-500/30 p-6">
          <h2 className="text-2xl font-semibold text-gold-500 mb-6">Descrição Detalhada</h2>
          <div className="prose prose-invert max-w-none">
            <p className="mb-4">
              O MTM Gold Killer V2.1 é um indicador especializado para o mercado de ouro, desenvolvido pela equipe
              MoreThanMoney. Este scanner utiliza algoritmos avançados para identificar oportunidades de trading no
              par XAUUSD (Ouro/Dólar).
            </p>

            <h3 className="text-xl font-medium text-gold-400 mt-6 mb-3">Funcionalidades Avançadas:</h3>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li>
                <strong className="text-gold-300">Detecção de Estruturas de Mercado:</strong> Identifica
                automaticamente níveis de suporte e resistência baseados no comportamento histórico do preço.
              </li>
              <li>
                <strong className="text-gold-300">Análise de Volatilidade:</strong> Utiliza o ATR (Average True Range)
                para ajustar os sinais de acordo com a volatilidade atual do mercado.
              </li>
              <li>
                <strong className="text-gold-300">Filtros de Tendência:</strong> Incorpora filtros para evitar sinais
                contra a tendência dominante, aumentando a taxa de acerto.
              </li>
              <li>
                <strong className="text-gold-300">Zonas de Liquidez:</strong> Identifica áreas onde há concentração de
                ordens de stop loss, potenciais alvos para movimentos de preço.
              </li>
              <li>
                <strong className="text-gold-300">Alertas Personalizáveis:</strong> Configure alertas para ser
                notificado quando surgir uma nova oportunidade de trading.
              </li>
            </ul>

            <h3 className="text-xl font-medium text-gold-400 mt-6 mb-3">Configurações Recomendadas:</h3>
            <p className="mb-4">
              Para resultados ideais, recomendamos utilizar o indicador nos timeframes de 15 minutos a 4 horas. As
              configurações padrão são otimizadas para o mercado de ouro, mas podem ser ajustadas de acordo com seu
              estilo de trading.
            </p>

            <h3 className="text-xl font-medium text-gold-400 mt-6 mb-3">Requisitos:</h3>
            <p className="mb-4">
              Para acessar todas as funcionalidades do MTM Gold Killer V2.1, é necessário ser membro da plataforma
              MoreThanMoney. Os membros têm acesso exclusivo a atualizações, suporte técnico e materiais educacionais
              relacionados ao uso do indicador.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
