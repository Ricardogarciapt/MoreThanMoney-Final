import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
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
            <CardTitle className="text-3xl font-bold text-center text-gold-gradient">
              Política de Proteção de Dados
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-invert max-w-none">
            <h2>1. Introdução</h2>
            <p>
              A MoreThanMoney está comprometida em proteger a privacidade e os dados pessoais de nossos usuários. Esta
              Política de Proteção de Dados descreve como coletamos, usamos, armazenamos e protegemos suas informações
              pessoais.
            </p>

            <h2>2. Dados Coletados</h2>
            <p>Coletamos os seguintes tipos de informações:</p>
            <ul>
              <li>Informações de identificação pessoal (nome, e-mail, telefone)</li>
              <li>Informações de login (nome de usuário e senha)</li>
              <li>Informações de contato e redes sociais</li>
              <li>Informações sobre preferências e interesses relacionados aos nossos serviços</li>
            </ul>

            <h2>3. Finalidade do Processamento</h2>
            <p>Utilizamos seus dados pessoais para:</p>
            <ul>
              <li>Criar e gerenciar sua conta de membro</li>
              <li>Fornecer acesso aos serviços contratados</li>
              <li>Enviar comunicações relevantes sobre nossos produtos e serviços</li>
              <li>Melhorar nossos serviços e experiência do usuário</li>
              <li>Cumprir obrigações legais e regulatórias</li>
            </ul>

            <h2>4. Base Legal</h2>
            <p>
              O processamento de seus dados pessoais é baseado no seu consentimento, na execução de um contrato do qual
              você é parte, e/ou nos interesses legítimos da MoreThanMoney.
            </p>

            <h2>5. Compartilhamento de Dados</h2>
            <p>
              Não compartilhamos suas informações pessoais com terceiros sem seu consentimento explícito, exceto quando
              necessário para a prestação dos serviços contratados ou quando exigido por lei.
            </p>

            <h2>6. Segurança dos Dados</h2>
            <p>
              Implementamos medidas técnicas e organizacionais apropriadas para proteger seus dados pessoais contra
              acesso não autorizado, perda, alteração ou divulgação.
            </p>

            <h2>7. Seus Direitos</h2>
            <p>Você tem o direito de:</p>
            <ul>
              <li>Acessar seus dados pessoais</li>
              <li>Retificar dados incorretos ou incompletos</li>
              <li>Solicitar a exclusão de seus dados</li>
              <li>Restringir ou opor-se ao processamento de seus dados</li>
              <li>Retirar seu consentimento a qualquer momento</li>
            </ul>

            <h2>8. Período de Retenção</h2>
            <p>
              Mantemos seus dados pessoais apenas pelo tempo necessário para cumprir as finalidades para as quais foram
              coletados, a menos que um período de retenção mais longo seja exigido ou permitido por lei.
            </p>

            <h2>9. Contato</h2>
            <p>
              Para exercer seus direitos ou para qualquer dúvida relacionada à proteção de dados, entre em contato
              conosco através do e-mail: privacy@morethanmoney.com
            </p>

            <h2>10. Atualizações</h2>
            <p>
              Esta Política de Proteção de Dados pode ser atualizada periodicamente. Recomendamos que você revise
              regularmente para estar ciente de quaisquer alterações.
            </p>

            <p className="text-sm text-gray-400 mt-8">Última atualização: 15 de Maio de 2025</p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
