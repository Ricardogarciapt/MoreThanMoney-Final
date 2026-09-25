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
            {/* Execução automática: as duas portas, explicadas antes de alguém escolher a
                errada. É a pergunta que mais chega ao suporte desde que existem as duas. */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                MTM Copy e MTM Auto
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="auto-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Qual é a diferença entre o MTM Copy e a MTM Auto?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    O motor é o mesmo; o que muda é para quem é. O <b>MTM Copy</b> vive no site e é para
                    quem já opera: várias contas ao mesmo tempo, lote e risco por conta e por estratégia,
                    presets para contas financiadas. Custa +20€/mês por cima da tua subscrição MTM.
                    A <b>MTM Auto</b> é uma app à parte, para quem está a começar ou vem de fora do
                    ecossistema: descarregas, ligas a corretora, escolhes quem copias. 25€/mês, e o
                    download é grátis.{" "}
                    <Link href="/automation" className="text-[#D2A63C] hover:underline">Ver as duas lado a lado</Link>.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="auto-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Preciso de ser membro MTM para usar a MTM Auto?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Não. A MTM Auto funciona com qualquer conta MT4 ou MT5, sem passar por aqui. Se já fores
                    membro MoreThanMoney, entras com o mesmo email e não pagas nada — reconhecemos a tua
                    subscrição do nosso lado.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="auto-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Há alguma forma de não pagar a mensalidade da MTM Auto?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Há três. Se operares em real na <b>PU Prime</b>, a subscrição é gratuita — só pedimos que a
                    conta tenha tido pelo menos 100 $ alguma vez, e validas isso dentro da app (VT Markets conta
                    a partir de 350 $). Se já fores membro MTM, também não pagas. E há cupões, que damos em
                    campanhas e parcerias. Cobramos a quem não está de nenhum dos lados.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="auto-4" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    O que é o Tap to Trade?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    É a execução com um toque: o sinal chega ao telemóvel, vês a entrada, o stop e os alvos, e
                    decides se entra. Nada abre sem tu tocares. A partir daí é o motor que trata da posição —
                    break-even, saídas parciais nos alvos e trailing. Vive na{" "}
                    <Link href="/mtmauto" className="text-[#D2A63C] hover:underline">MTM Auto</Link>.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="auto-5" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Posso usar os dois ao mesmo tempo?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Podes, mas raramente faz sentido — e nunca na mesma conta de corretora. Os dois abriam a
                    mesma ideia duas vezes, e o risco que definiste passaria a valer o dobro. Se quiseres os
                    dois, usa contas diferentes.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* Afiliados e equipa de vendas. Esta secção passou a existir porque o plano de
                compensação mudou (Setembro de 2026) e não havia nenhuma página pública a
                explicá-lo — quem perguntava recebia a resposta por mensagem, e cada resposta
                era um número ligeiramente diferente. Os números aqui têm de bater com as regras
                gravadas em `vendas_regras_comissao` e com a escada de `lib/vendas/escada-ranks.ts`;
                se mudarem lá, mudam aqui. A SALVAGUARDA é mencionada em todas as respostas onde há
                um número novo: quem entrou com o plano antigo mantém-no, e omitir isso faz parecer
                que se cortou rendimento a quem já cá estava. */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#D2A63C] mb-4">
                Afiliados e Equipa de Vendas
              </h2>
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="afil-1" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Quanto recebo por cada pessoa que trago?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    <p className="mb-3">
                      Recebes <strong className="text-[#D2A63C]">30% da primeira mensalidade</strong> e{" "}
                      <strong className="text-[#D2A63C]">10% de cada renovação</strong>, enquanto a pessoa se
                      mantiver subscritora. O residual conta a partir do segundo pagamento.
                    </p>
                    <p>
                      <strong className="text-white">Se já eras afiliado antes desta alteração, mantém-se o teu
                      plano:</strong> continuas com os 50% recorrentes com que entraste. A condição está gravada
                      na tua conta, não numa data no código — ninguém te muda a percentagem por mudarmos a
                      tabela geral.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="afil-2" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Que papéis existem na equipa de vendas, e quanto paga cada um?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    <p className="mb-3">
                      Uma venda pode passar por várias mãos, e cada mão tem a sua parte:
                    </p>
                    <ul className="space-y-2 mb-3">
                      <li><strong className="text-white">Prospector — 5%.</strong> Gera a oportunidade.</li>
                      <li><strong className="text-white">Setter — 10%.</strong> Fala com o interessado e marca a call.</li>
                      <li>
                        <strong className="text-white">Closer — 20% a 30%.</strong> Fecha a venda. A percentagem
                        sobe com o volume do mês. Tem ainda 5% residual nas renovações dos clientes que fechou.
                      </li>
                      <li><strong className="text-white">Team leader — 5% residual</strong> sobre a equipa que acompanha.</li>
                    </ul>
                    <p className="mb-3">
                      Numa venda única, o total pago a toda a cadeia não passa de{" "}
                      <strong className="text-white">40%</strong>. No MTM Funded o tecto é mais baixo —{" "}
                      <strong className="text-white">15%</strong> — porque o produto suporta capital e risco
                      próprios.
                    </p>
                    <p>
                      Uma pessoa pode ter mais do que um papel na mesma venda, e nesse caso recebe por cada um.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="afil-3" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Como funciona a escada de ranks?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    <p className="mb-3">
                      O residual de rank é uma <strong className="text-white">percentagem do volume mensal da tua
                      perna menor</strong>, e sobe a cada degrau: 6%, 9%, 12%, 15% e 18%. Ao alcançar cada rank
                      pela primeira vez há um bónus único de 100€, 250€, 750€, 2.000€ e 5.000€.
                    </p>
                    <p className="mb-3">
                      A escada funciona por <strong className="text-white">diferencial</strong>: cada pessoa recebe
                      a sua percentagem menos a maior já paga abaixo dela na mesma perna. É isso que garante que o
                      plano fecha — o total pago sobre um dado volume nunca passa dos 18%.
                    </p>
                    <p>
                      <strong className="text-white">Quem já estava na escada antiga continua lá:</strong> os
                      Distribuidores activos mantêm o valor fixo mensal com que entraram. Só quem entra de novo
                      entra na escada em percentagem.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="afil-4" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Onde vejo o que tenho a receber?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    No backoffice, em{" "}
                    <a href="https://backoffice.morethanmoney.pt" className="text-[#D2A63C] hover:underline">
                      backoffice.morethanmoney.pt
                    </a>
                    . Entras com o mesmo login do site e vês o teu percurso, as tuas vendas e o teu extracto — o
                    teu, e só o teu. O acesso depende dos papéis que tens atribuídos; se a tua conta não tiver
                    nenhum, a página diz-te isso e com quem falar.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="afil-5" className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-5 py-4 hover:bg-[#D2A63C]/5 text-left font-medium text-white">
                    Ser afiliado ou entrar na equipa de vendas dá-me rendimento garantido?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-2 text-gray-300 text-sm leading-relaxed">
                    Não. As percentagens acima são o que se paga <em>por venda feita</em> — se não houver vendas,
                    não há comissão. Não há salário fixo, não há mínimo garantido e não prometemos nenhum valor
                    por mês. Quanto recebes depende inteiramente de quantas pessoas trouxeres e de quantas se
                    mantiverem.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

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
