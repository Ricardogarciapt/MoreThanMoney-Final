import type { Metadata } from "next"
import Link from "next/link"
import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"

export const metadata: Metadata = {
  title: "Política de Privacidade | More Than Money",
  description:
    "Política de Privacidade da More Than Money — como recolhemos, usamos e protegemos os seus dados pessoais.",
}

export default function PrivacidadePage() {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <main className="min-h-screen bg-black py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-[#D2A63C] to-[#BB8525]">
              Política de Privacidade
            </h1>
            <p className="text-gray-400 text-center">
              Última atualização: Junho de 2025
            </p>
          </div>

          <div className="max-w-3xl mx-auto text-gray-300 text-sm leading-relaxed space-y-0">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                1. Introdução
              </h2>
              <p>
                A More Than Money (&quot;nós&quot;, &quot;nosso&quot;) respeita a sua privacidade. Esta
                Política de Privacidade descreve como recolhemos, usamos e protegemos os seus dados
                pessoais quando utiliza a nossa plataforma web (
                <a
                  href="https://www.morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  morethanmoney.pt
                </a>
                ) e a aplicação móvel MTM System (pt.morethanmoney.app), disponível no Google Play
                Store.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                2. Dados que recolhemos
              </h2>
              <p className="font-medium text-white mb-2">Plataforma web e app:</p>
              <ul className="list-disc pl-5 space-y-1 mb-4">
                <li>
                  Dados de registo: nome, endereço de email, palavra-passe (encriptada)
                </li>
                <li>
                  Dados de uso: páginas visitadas, funcionalidades utilizadas, duração das sessões
                </li>
                <li>
                  Dados de dispositivo: tipo de dispositivo, sistema operativo, versão da app, idioma
                </li>
                <li>Token de notificações push (FCM) para envio de alertas de trading</li>
                <li>
                  Dados de análise anónimos via Firebase Analytics (eventos de navegação, cliques)
                </li>
              </ul>
              <p className="font-medium text-white mb-2">Não recolhemos:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Dados de saúde ou biométricos</li>
                <li>Dados de localização GPS</li>
                <li>Dados financeiros (cartões, contas bancárias)</li>
              </ul>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                3. Como usamos os seus dados
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Prestação do serviço:</strong> autenticação,
                  personalização do dashboard, acesso a conteúdos
                </li>
                <li>
                  <strong className="text-white">Notificações push:</strong> alertas de trading,
                  novidades da plataforma (pode desativar nas definições do dispositivo)
                </li>
                <li>
                  <strong className="text-white">Análise e melhoria:</strong> compreender como os
                  utilizadores usam a plataforma para a melhorar
                </li>
                <li>
                  <strong className="text-white">Comunicações:</strong> resposta a pedidos de
                  suporte, atualizações importantes do serviço
                </li>
                <li>
                  <strong className="text-white">Segurança:</strong> deteção de acessos não
                  autorizados
                </li>
              </ul>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                4. Partilha de dados com terceiros
              </h2>
              <p className="mb-4">
                Não vendemos nem cedemos os seus dados pessoais a terceiros para fins comerciais.
                Partilhamos dados apenas com os seguintes prestadores de serviço, necessários para
                o funcionamento da plataforma:
              </p>
              <ul className="list-disc pl-5 space-y-3">
                <li>
                  <strong className="text-white">Google Firebase</strong> (Firebase Authentication,
                  Firestore, Analytics, Cloud Messaging) — armazenamento de dados e análise.{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:underline"
                  >
                    Política de privacidade
                  </a>
                </li>
                <li>
                  <strong className="text-white">Vercel</strong> — alojamento da plataforma web.{" "}
                  <a
                    href="https://vercel.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:underline"
                  >
                    Política de privacidade
                  </a>
                </li>
              </ul>
              <p className="mt-4">
                Todos os prestadores estão contratualmente obrigados a proteger os seus dados e a
                utilizá-los apenas para os fins contratados.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                5. Os seus direitos (RGPD)
              </h2>
              <p className="mb-4">
                Enquanto residente na União Europeia, tem os seguintes direitos:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Acesso:</strong> solicitar uma cópia dos seus dados
                  pessoais
                </li>
                <li>
                  <strong className="text-white">Retificação:</strong> corrigir dados incorretos ou
                  incompletos
                </li>
                <li>
                  <strong className="text-white">Eliminação:</strong> solicitar a eliminação dos seus
                  dados (&quot;direito ao esquecimento&quot;)
                </li>
                <li>
                  <strong className="text-white">Portabilidade:</strong> receber os seus dados num
                  formato estruturado e legível por máquina
                </li>
                <li>
                  <strong className="text-white">Oposição:</strong> opor-se ao tratamento dos seus
                  dados para determinadas finalidades
                </li>
                <li>
                  <strong className="text-white">Limitação:</strong> solicitar a suspensão do
                  tratamento dos seus dados
                </li>
              </ul>
              <p className="mt-4">
                Para exercer qualquer um destes direitos, contacte-nos através de{" "}
                <a
                  href="mailto:support@morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  support@morethanmoney.pt
                </a>
                . Responderemos no prazo de 30 dias.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                6. Retenção de dados
              </h2>
              <p className="mb-4">
                Conservamos os seus dados pessoais enquanto a sua conta estiver ativa. Se eliminar a
                sua conta, os dados serão removidos dos nossos sistemas no prazo de 90 dias, salvo
                obrigação legal de os conservar por mais tempo.
              </p>
              <p>
                Os dados de análise anónimos do Firebase Analytics são conservados durante 14 meses.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                7. Segurança
              </h2>
              <p>
                Implementamos medidas técnicas e organizacionais para proteger os seus dados,
                incluindo encriptação em trânsito (HTTPS/TLS), autenticação segura via Firebase Auth
                e controlos de acesso restritos.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                8. Cookies e tecnologias similares
              </h2>
              <p>
                O nosso site utiliza cookies essenciais para o funcionamento da sessão e
                autenticação. Não utilizamos cookies de rastreamento de terceiros para publicidade.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                9. Aplicação móvel MTM System
              </h2>
              <p className="mb-4">
                A app MTM System (Android — pt.morethanmoney.app) acede à mesma plataforma e está
                sujeita a esta mesma Política de Privacidade. A app utiliza:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Firebase Analytics para análise de uso anónimo</li>
                <li>Firebase Cloud Messaging (FCM) para notificações push</li>
              </ul>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                10. Alterações a esta política
              </h2>
              <p>
                Podemos atualizar esta política periodicamente. Notificaremos os utilizadores de
                alterações significativas através da plataforma ou por email. A data de última
                atualização está indicada no topo desta página.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                11. Contacto
              </h2>
              <p className="mb-4">
                Para questões relacionadas com privacidade ou proteção de dados:
              </p>
              <p className="mb-1">
                <strong className="text-white">Email:</strong>{" "}
                <a
                  href="mailto:support@morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  support@morethanmoney.pt
                </a>
              </p>
              <p className="mb-4">
                <strong className="text-white">Website:</strong>{" "}
                <a
                  href="https://www.morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  https://www.morethanmoney.pt
                </a>
              </p>
              <p>
                Pode também apresentar uma reclamação junto da Comissão Nacional de Proteção de
                Dados (CNPD) em{" "}
                <a
                  href="https://www.cnpd.pt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D2A63C] hover:underline"
                >
                  https://www.cnpd.pt
                </a>
                .
              </p>
            </section>
          </div>

          <div className="text-center mt-12">
            <Link
              href="/new-landing"
              className="text-[#D2A63C] hover:underline text-sm inline-flex items-center gap-1"
            >
              ← Voltar à página inicial
            </Link>
          </div>
        </div>
      </main>
    </AuthProvider>
  )
}
