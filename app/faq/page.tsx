import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import Link from "next/link"

export default function FAQPage() {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <main className="min-h-screen bg-black py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-3xl md:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-[#D2A63C] to-[#BB8525]">
              Perguntas Frequentes
            </h1>
            <p className="text-xl text-gray-300">
              As mesmas respostas que damos na landing — sem letras pequenas.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-8">

            {/* Antes de decidires — as objeções que travam a decisão. Fonte única partilhada com a
                secção FAQ da landing: se mudares aqui, muda lá. */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                Antes de decidires
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="antes-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Preciso de saber alguma coisa de trading para começar?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Não. A maioria entra sem saber ler um gráfico. Começas pelo Fast Start, passas ao Bootcamp de 30 horas
                    e, se quiseres, ligas a execução automática enquanto ainda estás a aprender — é precisamente para
                    isso que ela existe.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="antes-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Vocês ficam com o meu dinheiro?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Nunca. A conta é tua, aberta em teu nome na tua corretora, e o dinheiro nunca passa por nós. O que
                    autorizas é a colocação da ordem — nada mais. Podes desligar a ligação a qualquer momento, e
                    desligar pára mesmo: as posições deixam de ser copiadas nesse instante.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="antes-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Quanto preciso de ter para começar?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    O lote é calculado pelo teu saldo, não pelo nosso, por isso não há um mínimo imposto por nós — há o
                    mínimo da tua corretora. O que te pedimos é que comeces com um valor que possas perder sem mudar
                    a tua vida, porque há semanas negativas e vais ter algumas.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="antes-4" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Isto é garantido? Quanto vou ganhar?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Não é garantido nada, e quem te garantir está a mentir-te. O que mostramos são contagens da nossa base
                    de dados, com a data ao lado e com as contas negativas incluídas na conta. O resultado em euros
                    depende do teu capital, do teu risco e de quanto tempo aguentas sem mexer no que está a correr bem.
                    Não somos consultores financeiros licenciados e isto não é aconselhamento financeiro personalizado.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="antes-5" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Já pago no site. Tenho de pagar outra vez na app?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Não. O acesso é o mesmo dos dois lados: entras na app com o mesmo login e o que já pagaste vale lá.
                    Só há uma subscrição por pessoa, seja ela feita no site ou dentro da app.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="antes-6" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Em que idiomas está a plataforma?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    O site e a app estão traduzidos em 21 idiomas. As sessões ao vivo têm legendas traduzidas em português,
                    inglês, espanhol, francês e alemão — em direto, enquanto o educador fala.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* Planos e Subscrições */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                Planos e Subscrições
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="plano-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Quais são os planos disponíveis?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    <p className="mb-3">Tens dois planos principais:</p>
                    <ul className="space-y-3">
                      <li>
                        <strong className="text-[#D2A63C]">Pack Membro — 35€/mês (ou 28€/mês no plano anual)</strong>
                        <br />Inclui a app MTM System (iOS e Android), ferramentas de trading exclusivas,
                        Live Sessions MTM e suporte por email.
                      </li>
                      <li>
                        <strong className="text-[#D2A63C]">Pack Premium — 65€/mês (ou 52€/mês no plano anual)</strong>
                        <br />Inclui tudo do Pack Membro, mais acesso completo ao site MTM, comunidade Skool,
                        ferramentas avançadas, Live Sessions Premium, cursos de Forex, Criptomoedas,
                        Marketing Digital e AI, e suporte prioritário.
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="plano-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como funciona a faturação?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    A subscrição é cobrada mensalmente ou anualmente, consoante o plano escolhido.
                    No plano anual poupa 20% em relação ao mensal. O pagamento é processado via Stripe
                    com renovação automática. Podes cancelar a qualquer momento no teu perfil — o acesso
                    mantém-se até ao fim do período pago.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="plano-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como cancelo a minha subscrição?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Podes cancelar a qualquer momento através do teu perfil na plataforma ou enviando um
                    email para <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">suporte@morethanmoney.pt</a>.
                    Não há períodos de fidelização. Após o cancelamento, o teu acesso mantém-se ativo até
                    ao fim do período já pago.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="plano-4" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Posso mudar de plano?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Sim. Podes fazer upgrade para o Pack Premium ou downgrade para o Pack Membro a qualquer momento.
                    Entra em contacto com o suporte para te ajudarmos com a transição.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* App Mobile */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                App MTM System
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="app-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    O que é a App MTM System?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    A App MTM System é a aplicação móvel disponível para iOS e Android. Tens acesso ao portfólio
                    cripto e de ações da MTM, Live Sessions, chat da comunidade, mentor AI, scanners,
                    checklist de trading e muito mais — tudo no teu telemóvel.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="app-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como instalo a app?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    <p className="mb-2"><strong className="text-white">iOS (iPhone):</strong> Disponível na App Store. Pesquisa "MTM System".</p>
                    <p><strong className="text-white">Android / PWA:</strong> Acede a <a href="https://www.morethanmoney.pt/app-mobile" className="text-[#D2A63C] hover:underline">morethanmoney.pt/app-mobile</a> no Chrome e instala como Progressive Web App (PWA) através da opção "Adicionar ao ecrã inicial".</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="app-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como recebo notificações push?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Após fazer login na app, activa as notificações quando solicitado. Receberás alertas para
                    novas ideias de trading, live sessions ao vivo, alertas DCA e mensagens dos canais da comunidade.
                    Nas definições da app podes gerir os tipos de notificações que recebes.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* Scanners */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                Scanners TradingView
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="scan-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    O que são os Scanners MTM?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Os Scanners MTM são scripts exclusivos para TradingView, desenvolvidos pela equipa MTM.
                    Utilizam algoritmos proprietários para análise técnica — identificando estruturas de mercado,
                    zonas de suporte/resistência e sinais de entrada de alta probabilidade. Temos três scanners:
                    <ul className="mt-2 space-y-1">
                      <li><strong className="text-white">MTM Gold Killer V2.1</strong> — especializado em ouro e pares voláteis</li>
                      <li><strong className="text-white">Scanner MTM V3.4</strong> — estruturas de mercado e ATR</li>
                      <li><strong className="text-white">MTM Sensei</strong> — IA multi-confluência (Smart Money + Goldenzone)</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="scan-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como acedo ao scanner após a compra?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Após o pagamento recebes um email com instruções. O teu username do TradingView será adicionado
                    como utilizador autorizado no script (invite-only). Depois é só acederes ao TradingView, ir
                    à secção "Indicadores &gt; Convidados" e adicionar o scanner à tua biblioteca.
                    O processo demora normalmente entre 15 minutos a 2 horas úteis.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="scan-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Preciso de conta paga no TradingView?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    A conta gratuita do TradingView funciona. Para tirar o máximo partido dos scanners
                    (múltiplos indicadores simultâneos, alertas ilimitados) recomendamos o plano Basic ou superior.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* Suporte */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                Suporte
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="sup-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como posso obter ajuda?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Podes contactar-nos por email em <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">suporte@morethanmoney.pt</a>.
                    Os membros Premium têm suporte prioritário com resposta mais rápida.
                    Para questões técnicas da app, usa o Mentor AI disponível dentro da própria app.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="sup-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Têm garantia de devolução de dinheiro?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Para subscrições mensais, oferecemos reembolso total nos primeiros 7 dias se não ficares satisfeito.
                    Para scanners com pagamento único, não há reembolso após o acesso ser activado, dado que o
                    produto é imediatamente entregue. Contacta-nos para qualquer dúvida.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

          </div>

          <div className="text-center mt-12">
            <p className="text-gray-500 text-sm">
              Não encontraste o que procuravas?{" "}
              <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
                Envia-nos um email
              </a>
            </p>
          </div>
        </div>
      </main>
    </AuthProvider>
  )
}
