import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function TermsPage() {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <main className="min-h-screen bg-black py-20">
        <div className="container mx-auto px-4">
          <Link href="/" className="inline-block mb-8">
            <Button
              variant="outline"
              className="border-gold-500 text-gold-400 hover:bg-gold-500/10 flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Voltar
            </Button>
          </Link>

          <Card className="bg-black/50 border-gold-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-center text-gold-gradient">Termos de Uso</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert max-w-none">
              <h2>1. Aceitação dos Termos</h2>
              <p>
                Ao acessar e utilizar os serviços da MoreThanMoney, você concorda com estes Termos de Uso. Se você não
                concordar com qualquer parte destes termos, por favor, não utilize nossos serviços.
              </p>

              <h2>2. Descrição dos Serviços</h2>
              <p>
                A MoreThanMoney oferece uma plataforma integrada de formação financeira e serviços de automatização,
                incluindo, mas não se limitando a:
              </p>
              <ul>
                <li>Scanner MTM para análise de mercado</li>
                <li>Serviços de copytrading</li>
                <li>Cursos e materiais educacionais</li>
                <li>Acesso a ferramentas de trading e investimento</li>
              </ul>

              <h2>3. Registro e Conta</h2>
              <p>
                Para acessar determinados serviços, é necessário criar uma conta. Você é responsável por manter a
                confidencialidade de suas credenciais de login e por todas as atividades que ocorrem em sua conta.
              </p>

              <h2>4. Pagamentos e Assinaturas</h2>
              <p>
                Alguns serviços da MoreThanMoney requerem pagamento. Os preços e condições de pagamento estão
                disponíveis em nosso site. Ao adquirir um serviço pago, você concorda com os termos de pagamento
                específicos desse serviço.
              </p>

              <h2>5. Propriedade Intelectual</h2>
              <p>
                Todo o conteúdo disponibilizado na plataforma MoreThanMoney, incluindo textos, gráficos, logos, ícones,
                imagens, clipes de áudio, downloads digitais e compilações de dados, é propriedade da MoreThanMoney ou
                de seus fornecedores de conteúdo e está protegido pelas leis de propriedade intelectual.
              </p>

              <h2>6. Limitação de Responsabilidade</h2>
              <p>
                A MoreThanMoney não garante que os serviços serão ininterruptos ou livres de erros. Os serviços são
                fornecidos &quot;como estão&quot; e &quot;conforme disponíveis&quot;.
              </p>
              <p>
                Trading e investimentos envolvem riscos significativos. A MoreThanMoney não se responsabiliza por
                quaisquer perdas financeiras resultantes do uso de nossos serviços ou das informações fornecidas em
                nossa plataforma.
              </p>

              <h2>7. Aviso de Risco</h2>
              <p>
                Trading de Forex, criptomoedas e outros instrumentos financeiros envolve alto risco e não é adequado
                para todos os investidores. Você deve considerar cuidadosamente seus objetivos de investimento, nível de
                experiência e apetite ao risco antes de utilizar nossos serviços.
              </p>

              <h2>8. Modificações dos Termos</h2>
              <p>
                A MoreThanMoney reserva-se o direito de modificar estes termos a qualquer momento. As modificações
                entrarão em vigor imediatamente após a publicação dos termos atualizados em nosso site.
              </p>

              <h2>9. Lei Aplicável</h2>
              <p>
                Estes termos são regidos e interpretados de acordo com as leis de Portugal, sem consideração aos
                princípios de conflitos de leis.
              </p>

              <h2>10. Contato</h2>
              <p>
                Se você tiver dúvidas sobre estes Termos de Uso, entre em contato conosco através do e-mail:
                legal@morethanmoney.com
              </p>

              <p className="text-sm text-gray-400 mt-8">Última atualização: 15 de Maio de 2025</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </AuthProvider>
  )
}
