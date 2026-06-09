import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/" className="inline-block mb-8">
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-2">
            <ArrowLeft size={16} />
            Voltar
          </Button>
        </Link>

        <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 md:p-12">
          <h1 className="text-3xl font-bold text-center text-white mb-2">
            Política de Privacidade
          </h1>
          <p className="text-center text-gray-400 mb-10 text-sm">
            Última actualização: Junho de 2025
          </p>

          <div className="prose prose-invert max-w-none text-gray-300 text-sm leading-relaxed space-y-6">

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">1. Responsável pelo Tratamento</h2>
              <p>
                A MoreThanMoney (doravante "nós", "MTM") é responsável pelo tratamento dos dados pessoais
                recolhidos através desta plataforma. Para questões relacionadas com privacidade, contacta-nos
                em <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">suporte@morethanmoney.pt</a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">2. Dados Recolhidos</h2>
              <p>Recolhemos os seguintes dados:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Dados de identificação: nome completo, username, endereço de email</li>
                <li>Dados de contacto: número de telefone e WhatsApp (opcionais)</li>
                <li>Dados de login: email e palavra-passe (armazenada de forma encriptada)</li>
                <li>Dados de pagamento: processados directamente pelo Stripe e Apple — nunca armazenamos dados bancários ou de cartão</li>
                <li>Dados de utilização: preferências, histórico de sessões e interacções na plataforma</li>
                <li>Dados de dispositivo: tokens de notificações push para envio de alertas (FCM/APNs)</li>
                <li>Username do TradingView: fornecido voluntariamente para activação dos scanners</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">3. Finalidade do Tratamento</h2>
              <p>Os teus dados são usados para:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Criar e gerir a tua conta de membro</li>
                <li>Processar pagamentos e gerir subscrições</li>
                <li>Enviar notificações push (alertas de trading, live sessions, etc.)</li>
                <li>Activar o acesso aos scanners TradingView</li>
                <li>Fornecer suporte e assistência técnica</li>
                <li>Melhorar a plataforma e a experiência do utilizador</li>
                <li>Cumprir obrigações legais e fiscais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">4. Base Legal (RGPD)</h2>
              <p>O tratamento dos teus dados baseia-se em:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-white">Execução de contrato:</strong> para prestação dos serviços contratados</li>
                <li><strong className="text-white">Consentimento:</strong> para envio de notificações push e comunicações de marketing</li>
                <li><strong className="text-white">Obrigação legal:</strong> para cumprimento de requisitos fiscais e legais</li>
                <li><strong className="text-white">Interesses legítimos:</strong> para melhorar a segurança e funcionalidade da plataforma</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">5. Partilha de Dados</h2>
              <p>
                Não partilhamos os teus dados pessoais com terceiros para fins de marketing.
                Os teus dados podem ser partilhados apenas com:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-white">Stripe:</strong> processamento seguro de pagamentos</li>
                <li><strong className="text-white">Apple App Store:</strong> gestão de subscrições iOS</li>
                <li><strong className="text-white">Supabase:</strong> armazenamento seguro da base de dados</li>
                <li><strong className="text-white">Firebase (Google):</strong> envio de notificações push</li>
                <li><strong className="text-white">TradingView:</strong> activação do acesso aos scanners (apenas username)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">6. Segurança dos Dados</h2>
              <p>
                Implementamos medidas técnicas e organizacionais adequadas para proteger os teus dados:
                encriptação SSL/TLS em todas as comunicações, palavras-passe armazenadas com hash bcrypt,
                row-level security na base de dados, e controlo de acesso por funções (RBAC).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">7. Os Teus Direitos (RGPD)</h2>
              <p>Tens direito a:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-white">Acesso:</strong> saber que dados temos sobre ti</li>
                <li><strong className="text-white">Rectificação:</strong> corrigir dados incorrectos ou incompletos</li>
                <li><strong className="text-white">Eliminação:</strong> solicitar a eliminação da tua conta e dados ("direito ao esquecimento")</li>
                <li><strong className="text-white">Portabilidade:</strong> exportar os teus dados num formato legível por máquina</li>
                <li><strong className="text-white">Limitação:</strong> restringir o tratamento em determinadas circunstâncias</li>
                <li><strong className="text-white">Oposição:</strong> opor-te ao tratamento para fins de marketing directo</li>
                <li><strong className="text-white">Retirada do consentimento:</strong> a qualquer momento, sem prejudicar a licitude do tratamento anterior</li>
              </ul>
              <p className="mt-3">
                Para exercer estes direitos, envia um email para{" "}
                <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
                  suporte@morethanmoney.pt
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">8. Retenção dos Dados</h2>
              <p>
                Mantemos os teus dados enquanto a tua conta estiver activa. Após o cancelamento da conta,
                os dados são eliminados ou anonimizados num prazo de 90 dias, excepto quando a retenção
                for exigida por obrigações legais (ex: registos contabilísticos por 10 anos, conforme a lei portuguesa).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">9. Cookies e Tecnologias de Rastreio</h2>
              <p>
                Utilizamos cookies essenciais para o funcionamento da plataforma (autenticação, preferências).
                Não utilizamos cookies de rastreio de terceiros para publicidade. Podes gerir as preferências
                de cookies através das definições do teu browser.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">10. Reclamações</h2>
              <p>
                Se considerares que o tratamento dos teus dados viola o RGPD, tens o direito de apresentar
                uma reclamação à autoridade de controlo competente — em Portugal, a{" "}
                <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" className="text-[#D2A63C] hover:underline">
                  CNPD (Comissão Nacional de Protecção de Dados)
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">11. Alterações a esta Política</h2>
              <p>
                Podemos actualizar esta política periodicamente. Sempre que o fizermos, actualizaremos a
                data de "última actualização" no topo desta página e, em caso de alterações significativas,
                notificar-te-emos por email.
              </p>
            </section>

          </div>
        </div>
      </div>
    </main>
  )
}
