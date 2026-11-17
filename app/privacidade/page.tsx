import type { Metadata } from "next"
import Link from "next/link"
import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"
import { linhaIdentificacao, ULTIMA_ACTUALIZACAO_LEGAL } from "@/lib/legal/identificacao"

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
              Última atualização: {ULTIMA_ACTUALIZACAO_LEGAL}
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
                ) e as aplicações móveis MTM System e MTM Auto — no Google Play
                (pt.morethanmoney.app) e na App Store da Apple — e quando falas connosco por
                Instagram, WhatsApp ou Telegram.
              </p>
              <p className="mt-3">
                <strong className="text-white">Responsável pelo tratamento:</strong>{" "}
                {linhaIdentificacao()} Não somos obrigados a nomear um Encarregado de Proteção de
                Dados; as questões de privacidade tratam-se pelo email indicado no fim desta página.
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
              {/* Isto dizia «não recolhemos dados financeiros (cartões, contas bancárias)», e era
                  falso: há Stripe Connect a pagar comissões a afiliados e à equipa de vendas, há
                  contas de corretora ligadas à execução automática, e há documentos enviados pelo
                  próprio utilizador. Uma política de privacidade que nega recolher o que recolhe é
                  pior do que uma que não fala do assunto. Os dados de CARTÃO continuam a não passar
                  por aqui — esses ficam na Stripe — e é essa a afirmação que se pode fazer.
                  O inventário completo de dados e subcontratantes precisa de revisão por jurista. */}
              <p className="font-medium text-white mb-2">Dados financeiros e de negociação:</p>
              <ul className="list-disc pl-5 space-y-1 mb-4">
                <li>
                  Identificador de cliente e de subscrição na Stripe (o pagamento é processado pela
                  Stripe — os dados do cartão não passam por nós nem são guardados por nós)
                </li>
                <li>
                  Número e métricas das contas de corretora que o utilizador escolha ligar à execução
                  automática (MTM Copy, MTM Auto, Tap to Trade)
                </li>
                <li>
                  Para quem recebe comissões: os dados de pagamento tratados pela Stripe Connect, e os
                  documentos que o próprio envie quando lhe sejam pedidos
                </li>
              </ul>
              <p className="font-medium text-white mb-2">Mensagens e contactos comerciais:</p>
              <ul className="list-disc pl-5 space-y-1 mb-4">
                <li>
                  Quando comentas ou nos envias mensagem no Instagram, WhatsApp ou Telegram: o teu
                  nome de utilizador ou número, o conteúdo das mensagens e a palavra-chave que usaste
                </li>
                <li>
                  Quando pedes contacto, marcas uma reunião ou deixas o email: nome, email, telefone
                  e as respostas que dês às perguntas de qualificação
                </li>
                <li>Para clientes empresariais (B2B): dados de contacto profissionais públicos</li>
              </ul>
              <p className="font-medium text-white mb-2">Não recolhemos:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Dados de saúde ou biométricos</li>
                <li>Dados de localização GPS</li>
                <li>Números de cartão de crédito ou débito</li>
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
                <li>
                  <strong className="text-white">Assistentes de IA:</strong> responder às tuas
                  mensagens e perguntas. Quando falas com um assistente de IA, isso é-te indicado,
                  e podes pedir para falar com uma pessoa. A IA ajuda a perceber o que procuras, mas
                  não toma decisões com efeitos jurídicos sobre ti.
                </li>
                <li>
                  <strong className="text-white">Marketing:</strong> enviar-te novidades e ofertas
                  por email, WhatsApp ou Telegram, apenas se tiveres dado consentimento (ou, por
                  email, se já fores cliente e não te tiveres oposto). Podes sair a qualquer momento.
                </li>
              </ul>
              <p className="font-medium text-white mt-4 mb-2">Fundamentos legais (art. 6.º RGPD):</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Execução do contrato: conta, compras, subscrições, acesso a conteúdos e ferramentas</li>
                <li>Obrigação legal: faturação e conservação de registos contabilísticos e fiscais</li>
                <li>Interesse legítimo: segurança, prevenção de fraude, melhoria do serviço, resposta a quem nos contacta e prospeção B2B de contactos profissionais</li>
                <li>Consentimento: marketing, notificações push e cookies não essenciais — podes retirá-lo a qualquer momento</li>
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
              {/* A lista dizia que a autenticação e o armazenamento eram Firebase Authentication e
                  Firestore. Não são, e nunca foram nesta versão da plataforma: a base de dados e a
                  autenticação são Supabase, e o Firebase só serve as notificações push e a análise
                  de uso. Nomear o subcontratante errado numa política de privacidade é um erro de
                  facto com consequência — é a ele que o titular dos dados iria pedir contas. */}
              <ul className="list-disc pl-5 space-y-3">
                <li>
                  <strong className="text-white">Supabase</strong> — base de dados, autenticação e
                  armazenamento de ficheiros da plataforma.{" "}
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:underline"
                  >
                    Política de privacidade
                  </a>
                </li>
                <li>
                  <strong className="text-white">Google</strong> (Firebase Analytics e Firebase Cloud
                  Messaging para notificações push; Gmail para o envio de emails de serviço).{" "}
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
                  <strong className="text-white">Stripe</strong> — processamento de pagamentos e, para
                  quem recebe comissões, dos respectivos pagamentos (Stripe Connect).{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:underline"
                  >
                    Política de privacidade
                  </a>
                </li>
                <li>
                  <strong className="text-white">MetaApi</strong> — ligação às contas de corretora que o
                  utilizador escolha ligar à execução automática.{" "}
                  <a
                    href="https://metaapi.cloud/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D2A63C] hover:underline"
                  >
                    Política de privacidade
                  </a>
                </li>
                <li>
                  <strong className="text-white">Anthropic</strong> — processa as mensagens enviadas ao
                  Mentor AI para gerar a resposta.{" "}
                  <a
                    href="https://www.anthropic.com/legal/privacy"
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
              <ul className="list-disc pl-5 space-y-3 mt-3">
                <li>
                  <strong className="text-white">Meta</strong> (Instagram e WhatsApp Business) e{" "}
                  <strong className="text-white">Telegram</strong> — quando falas connosco por esses
                  canais, as mensagens passam também pelos sistemas deles, segundo as políticas de
                  privacidade de cada um.
                </li>
                <li>
                  <strong className="text-white">Fornecedores de IA</strong> (Anthropic, Google Gemini,
                  Groq, OpenAI, ou modelos executados nos nossos próprios servidores) — processam o
                  texto das mensagens para gerar respostas, sem o usarem para treinar os seus modelos
                  nas condições contratadas.
                </li>
                <li>
                  <strong className="text-white">Corretoras parceiras</strong> — só recebem dados teus
                  se abrires conta nelas; recebemos delas, enquanto Introducing Broker, informação
                  sobre a conta aberta pelo nosso link (identificação, financiamento e volume) para
                  validar o teu acesso e calcular comissões.
                </li>
              </ul>
              <p className="mt-4">
                Alguns destes prestadores estão fora do Espaço Económico Europeu (sobretudo nos
                Estados Unidos). Nesses casos, a transferência é feita ao abrigo do EU-US Data
                Privacy Framework ou de cláusulas contratuais-tipo aprovadas pela Comissão Europeia.
              </p>
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
                  href="mailto:suporte@morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  suporte@morethanmoney.pt
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
              <p className="mt-4">
                Contactos que ainda não são clientes (leads e conversas) são conservados enquanto
                houver interesse legítimo em manter a relação: por exemplo, enquanto recebes os nossos
                conteúdos ou nos voltas a contactar. Podes pedir a qualquer momento que deixemos de te
                contactar ou que apaguemos os teus dados, e fazemo-lo sem custos. Documentos de
                faturação são conservados 10 anos, por obrigação fiscal.
              </p>
              <p className="mt-4">
                Os nossos serviços destinam-se a maiores de 18 anos. Não recolhemos
                intencionalmente dados de menores.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                7. Segurança
              </h2>
              <p>
                Implementamos medidas técnicas e organizacionais para proteger os seus dados,
                incluindo encriptação em trânsito (HTTPS/TLS), autenticação segura via Supabase Auth
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
                9. Aplicações móveis
              </h2>
              <p className="mb-4">
                As apps MTM System e MTM Auto — Android (pt.morethanmoney.app) e iOS (App Store) —
                acedem à mesma plataforma e estão sujeitas a esta mesma Política de Privacidade. As
                apps utilizam:
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

            {/* Data Deletion Section — Required by Google Play Console */}
            <section id="excluir-dados" className="rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/5 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                11. Eliminação de Conta e Dados
              </h2>
              <p className="mb-4">
                Pode solicitar a eliminação da sua conta e de todos os dados associados a qualquer
                momento, sem necessidade de justificação.
              </p>
              <p className="font-medium text-white mb-2">Como solicitar a eliminação:</p>
              <ol className="list-decimal pl-5 space-y-2 mb-4">
                <li>
                  <strong className="text-white">Por e-mail:</strong> Envie um e-mail para{" "}
                  <a
                    href="mailto:suporte@morethanmoney.pt?subject=Pedido%20de%20Elimin%C3%A7%C3%A3o%20de%20Conta"
                    className="text-[#D2A63C] hover:underline"
                  >
                    suporte@morethanmoney.pt
                  </a>{" "}
                  com o assunto <em>&quot;Pedido de Eliminação de Conta&quot;</em> e o endereço de
                  email associado à sua conta.
                </li>
                <li>
                  <strong className="text-white">Na aplicação:</strong> Aceda a{" "}
                  <em>Perfil → Definições → Eliminar Conta</em>.
                </li>
              </ol>
              <p className="font-medium text-white mb-2">O que é eliminado:</p>
              <ul className="list-disc pl-5 space-y-1 mb-4">
                <li>Dados de perfil (nome, email, fotografia de perfil)</li>
                <li>Histórico de utilização da plataforma</li>
                <li>Configurações e preferências pessoais</li>
                <li>Tokens de notificação push (FCM)</li>
              </ul>
              <p className="font-medium text-white mb-2">O que pode ser conservado:</p>
              <ul className="list-disc pl-5 space-y-1 mb-4">
                <li>Registos de transações financeiras (obrigação legal — até 10 anos)</li>
                <li>Dados completamente anonimizados para análise estatística</li>
              </ul>
              <p className="text-gray-400 text-sm">
                O pedido será processado no prazo de{" "}
                <strong className="text-white">30 dias</strong>. Receberá uma confirmação por
                e-mail quando a eliminação for concluída.
              </p>
            </section>

            <div className="border-b border-gray-800 my-8" />

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                12. Contacto
              </h2>
              <p className="mb-4">
                Para questões relacionadas com privacidade ou proteção de dados:
              </p>
              <p className="mb-1">
                <strong className="text-white">Email:</strong>{" "}
                <a
                  href="mailto:suporte@morethanmoney.pt"
                  className="text-[#D2A63C] hover:underline"
                >
                  suporte@morethanmoney.pt
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
