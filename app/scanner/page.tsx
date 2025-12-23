"use client"

import Breadcrumbs from "@/components/breadcrumbs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lock, ArrowRight, Brain, BarChart3, Shield } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"

export default function ScannerPage() {

  return (
    <>
      <Breadcrumbs />
      <main className="min-h-screen bg-black text-white relative">
        <ParticleBackground />
        <div className="container mx-auto px-4 py-12 relative z-10">
          <h1 className="text-4xl font-bold text-center mb-2">Scanner MoreThanMoney™</h1>
          <p className="text-center text-gray-300 mb-10">Acesso exclusivo aos nossos scanners de IA avançados para análise técnica profissional</p>

          {/* Proteção Legal */}
          <div className="mb-10 card-modern scroll-fade-in">
            <h2 className="text-lg font-semibold text-mtm-primary mb-2">⚖️ Proteção Legal e Propriedade Intelectual</h2>
            <p className="text-sm text-gray-300">
              Todos os produtos da MoreThanMoney e sua propriedade intelectual estão protegidos legalmente. Os nossos scanners
              utilizam algoritmos proprietários de IA para análise de mercado avançada, incluindo estratégias como Goldenzone,
              SR MTM, Smart Money e KillShot. Qualquer reprodução não autorizada é estritamente proibida.
            </p>
          </div>

          {/* MTM Gold Killer V2.1 */}
          <div className="mb-12 card-modern scroll-slide-up animation-delay-100">
            <h2 className="text-2xl font-semibold text-mtm-primary mb-4">MTM Gold Killer V2.1 - Análise Técnica Avançada</h2>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="w-full md:w-1/2">
                <img
                  src="https://www.tradingview.com/x/X7SREOsm/"
                  alt="Scanner MTM Gold Killer Preview"
                  className="w-full h-auto rounded-lg border border-mtm-primary/30 shadow-lg"
                />
              </div>
              <div className="w-full md:w-1/2">
                <h3 className="text-xl font-medium text-mtm-primary mb-3">
                  MTM Gold Killer V2.1 - Análise Técnica Avançada
                </h3>
                <p className="text-gray-300 mb-4">
                  Um indicador avançado que combina técnicas estatísticas robustas, filtros de suavização personalizados
                  e lógica de tendência baseada em SuperTrend para mapear oportunidades de trade com níveis de risco e
                  recompensa claramente definidos.
                </p>

                <h4 className="text-lg font-medium text-mtm-primary mb-2">
                  <span className="mr-2">🧠</span> Principais Funcionalidades
                </h4>
                <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">
                  <li>Fonte de preço personalizável (médias comuns ou versão suavizada)</li>
                  <li>Detecção de tendência com SuperTrend baseada em ATR</li>
                  <li>Alvo estatístico dinâmico com cálculos percentuais</li>
                  <li>Visualização multi-nível (até 5 níveis de alvo/drawdown)</li>
                  <li>Personalização avançada de parâmetros</li>
                </ul>

                <h4 className="text-lg font-medium text-mtm-primary mb-2">
                  <span className="mr-2">📊</span> Visualização Gráfica
                </h4>
                <ul className="list-disc list-inside text-gray-300 mb-6 space-y-1">
                  <li>Linhas de alvo (verde) para projeções de ganhos</li>
                  <li>Linhas de drawdown (vermelho) para projeções de perdas</li>
                  <li>Linha central (cinza) para ponto de entrada</li>
                  <li>Análise estatística com média e desvio padrão</li>
                  <li>Preenchimento com cores suaves para visualização de distâncias</li>
                </ul>

                <div className="text-xs text-gray-400 italic mb-4">
                  <span className="mr-2">🔒</span> Este script faz parte da propriedade intelectual de RicardoGarciaPT e
                  da empresa MoreThanMoney, estando protegido por direitos autorais.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <a
                    href="https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500 hover:text-mtm-primary underline inline-flex items-center"
                  >
                    Solicitar Acesso via WhatsApp
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Scanner MTM V3.4 */}
          <div className="mb-12 card-modern scroll-slide-up animation-delay-200">
            <h2 className="text-2xl font-semibold text-mtm-primary mb-4">Scanner MTM V3.4 - Market Structures and ATR</h2>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="w-full md:w-1/2">
                <img
                  src="https://www.tradingview.com/x/ZPM47fOg/"
                  alt="Scanner MTM V3.4 Preview"
                  className="w-full h-auto rounded-lg border border-mtm-primary/30 shadow-lg"
                />
              </div>
              <div className="w-full md:w-1/2">
                <h4 className="text-lg font-medium text-mtm-primary mb-2">
                  <span className="mr-2">🧠</span> Principais Funcionalidades
                </h4>
                <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">
                  <li>Identificação de estruturas de mercado</li>
                  <li>Cálculo de ATR para gerenciamento de risco</li>
                  <li>Sinais de entrada e saída otimizados</li>
                  <li>Compatível com múltiplos timeframes</li>
                  <li>Atualizações regulares e suporte dedicado</li>
                </ul>

                <h4 className="text-lg font-medium text-mtm-primary mb-2">
                  <span className="mr-2">📊</span> Características Técnicas
                </h4>
                <ul className="list-disc list-inside text-gray-300 mb-6 space-y-1">
                  <li>Análise de estruturas de mercado em tempo real</li>
                  <li>Cálculo automático de ATR para volatilidade</li>
                  <li>Filtros de tendência avançados</li>
                  <li>Alertas personalizáveis por email</li>
                  <li>Integração com TradingView</li>
                </ul>

                <div className="text-xs text-gray-400 italic mb-4">
                  <span className="mr-2">🔒</span> Propriedade Intelectual: Este scanner faz parte da propriedade intelectual da empresa MoreThanMoney, estando protegido por direitos autorais.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <a
                    href="https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500 hover:text-mtm-primary underline inline-flex items-center"
                  >
                    Solicitar Acesso via WhatsApp
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Como Funciona e Resultados */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Como Funciona */}
            <Card className="card-modern scroll-slide-left animation-delay-300">
              <CardHeader>
                <CardTitle className="text-mtm-primary flex items-center">
                  <BarChart3 className="w-6 h-6 mr-2" />
                  📈 Como Funciona
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Os scanners analisam automaticamente os mercados em tempo real, identificando padrões e oportunidades de trading baseados em algoritmos proprietários de IA.
                </p>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full mr-3"></div>
                    Análise em tempo real 24/7
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full mr-3"></div>
                    Alertas automáticos por email
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full mr-3"></div>
                    Suporte técnico especializado
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full mr-3"></div>
                    Atualizações gratuitas
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Resultados Esperados */}
            <Card className="card-modern scroll-slide-right animation-delay-300">
              <CardHeader>
                <CardTitle className="text-mtm-primary flex items-center">
                  <Shield className="w-6 h-6 mr-2" />
                  🎯 Resultados Esperados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">
                  Os nossos scanners têm demonstrado consistentemente uma taxa de precisão superior a 85% em condições de mercado normais.
                </p>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                    Taxa de precisão: 85%+
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                    Redução de perdas: 60%+
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                    Melhoria de timing: 70%+
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                    ROI médio: 20%+
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* CTA Final */}
          <Card className="card-clean text-center">
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-mtm-primary">🚀 Pronto para Transformar o Seu Trading?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300 mb-6 text-lg">
                Junte-se aos milhares de traders que já estão a usar os nossos scanners para maximizar os seus resultados.
              </p>
              <a
                href="https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-mtm-primary hover:bg-mtm-primary-dark text-white font-bold px-8 py-4 rounded-lg transition-all duration-300 hover:scale-105"
              >
                Solicitar Acesso via WhatsApp
                <ArrowRight className="h-5 w-5 ml-2" />
              </a>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
