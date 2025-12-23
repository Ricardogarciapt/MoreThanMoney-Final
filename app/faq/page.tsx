import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export default function FAQPage() {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <main className="min-h-screen bg-black py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-3xl md:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
              Perguntas Frequentes
            </h1>
            <p className="text-xl text-gray-300">
              Encontra respostas para as perguntas mais comuns sobre os nossos serviços e produtos.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem
                value="item-1"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  O que é o Scanner MoreThanMoney?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  O Scanner MoreThanMoney é uma ferramenta avançada de análise de mercado que utiliza inteligência
                  artificial para identificar estruturas de mercado e pontos de entrada com alta probabilidade de
                  sucesso. Ele é especialmente útil para traders de todos os níveis, pois elimina a complexidade da
                  análise técnica tradicional.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-2"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  Como funciona o serviço de Copytrading?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  O nosso serviço de Copytrading permite copiar automaticamente as operações dos nossos traders
                  profissionais. Após configurares a tua conta, o sistema replicará as operações diretamente na tua conta de
                  trading, respeitando os parâmetros de gestão de risco que definires. Oferecemos diferentes planos
                  com requisitos de depósito variados para atender às tuas necessidades.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-3"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  Quais são os requisitos para começar a usar o Copytrading?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  Para começares a usar o Copytrading, precisas de ter uma conta numa corretora compatível com MT4 ou
                  MT5, fazer um depósito mínimo de acordo com o plano escolhido (a partir de 350€ para o plano Premium),
                  e fornecer as credenciais necessárias para configuração. O nosso sistema é compatível com a maioria das
                  corretoras que oferecem MetaTrader.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-4"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  O que é a Educação JIFU?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  A Educação JIFU é uma plataforma de formação especializada em trading, investimentos, e-commerce,
                  inteligência artificial e muito mais. Ao registares-te na plataforma JIFU, terás acesso a cursos,
                  webinars, comunidade de traders e diversos recursos educacionais para desenvolveres as tuas competências
                  financeiras.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-5"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  Como posso me tornar um membro MoreThanMoney?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  Para te tornares um membro MoreThanMoney, basta clicares no botão &quot;Área de Membro&quot; no menu
                  principal e selecionares a opção de registo. Oferecemos diferentes pacotes de associação, desde o
                  Pacote Básico até ao Pacote Premium, cada um com benefícios específicos. Após o registo, terás
                  acesso imediato aos recursos incluídos no teu pacote.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-6"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  Qual é a diferença entre os pacotes de associação?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  <p>Oferecemos três pacotes principais:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>
                      <strong>Pacote Básico (€50):</strong> Inclui acesso ao Bootcamp MoreThanMoney, ebook
                      &quot;Investir sem Emoções&quot; e acesso ao portfólio MTM.
                    </li>
                    <li>
                      <strong>Pacote Scanner:</strong> Inclui todos os benefícios do Pacote Básico, mais acesso a
                      condições especiais de copytrading, eventos regionais e mentorias de livetrading. Requer a compra
                      de uma licença do Scanner (anual ou vitalícia).
                    </li>
                    <li>
                      <strong>Pacote Premium:</strong> Inclui todos os benefícios dos pacotes anteriores, mais acesso a
                      eventos de educação presenciais e todos os produtos MoreThanMoney. Requer verificação do ID JIFU.
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-7"
                className="bg-black/50 border border-gold-500/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-4 hover:bg-gold-500/5 text-left">
                  Como posso obter suporte técnico?
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-gray-300">
                  Para obteres suporte técnico, podes entrar em contacto connosco através do email
                  suporte@morethanmoney.com ou pelo WhatsApp disponível na secção de contacto. Os membros Premium têm
                  acesso a suporte prioritário com tempos de resposta mais rápidos.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </main>
    </AuthProvider>
  )
}
