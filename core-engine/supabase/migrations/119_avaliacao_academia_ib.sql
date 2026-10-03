-- 119 — Avaliação da Academia IB MTM × PU Prime (4.ª etapa em /avaliacoes) + material de apoio por avaliação.
-- Regra da Academia: nenhuma pergunta fixa valores de comissões/rebates/spreads; os exercícios usam valores
-- hipotéticos declarados como tal. Idempotente.

alter table public.assessments add column if not exists material_url text;

alter table public.assessments drop constraint if exists assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check
  check (kind = any (array['fast_start', 'bootcamp', 'teste_final', 'ib']));

insert into public.assessments (slug, title, subtitle, kind, intro, pass_mark, grade_display, cert_template, active, sort, material_url)
values (
  'academia-ib',
  'Certificação IB MTM × PU Prime',
  'Academia IB — Introducing Broker',
  'ib',
  'Avaliação final da Academia IB: fundamentos do IB, PU Prime, modelo de remuneração, onboarding, vendas, liderança e compliance. Ao concluíres com aproveitamento recebes o Certificado IB MTM com a tua nota em valores.',
  75, 'valores20', 'academia-ib', true, 4,
  'https://www.skool.com/morethanmoney-1132/classroom/0d931958?md=de10a9e04e054da097dc1f3355650dc3'
)
on conflict (slug) do update set
  title = excluded.title, subtitle = excluded.subtitle, kind = excluded.kind, intro = excluded.intro,
  pass_mark = excluded.pass_mark, grade_display = excluded.grade_display, cert_template = excluded.cert_template,
  sort = excluded.sort, material_url = excluded.material_url;

-- perguntas (só se ainda não existirem — depois disso editam-se no admin)
insert into public.assessment_questions (assessment_id, order_index, prompt, options, correct_index, points, active)
select a.id, v.ord, v.prompt, v.opts, v.correct, 1, true
from public.assessments a
cross join (values
  (1, $q$O que define melhor o papel de um Introducing Broker (IB)?$q$, $q$["Gere e negoceia a conta do cliente em nome dele.", "É o intermediário entre o cliente e a corretora: atrai, orienta, encaminha e presta suporte contínuo.", "É um afiliado pago uma única vez por registo, sem acompanhamento.", "É um funcionário da corretora responsável pela execução das ordens."]$q$::jsonb, 1),
  (2, $q$Qual é a principal diferença entre um IB e um afiliado?$q$, $q$["Não há diferença: ambos recebem apenas por registo.", "O afiliado pode dar aconselhamento financeiro personalizado; o IB não.", "O IB é pago pela MTM e o afiliado pela corretora.", "O IB acompanha o cliente e é remunerado de forma contínua pelo volume negociado; o afiliado foca-se em tráfego e conversão pontual (CPA/CPL)."]$q$::jsonb, 3),
  (3, $q$Quem é responsável pela execução das ordens, pela liquidez e pela custódia dos fundos dos clientes?$q$, $q$["A PU Prime, com os fundos em contas segregadas.", "O IB, através do seu portal.", "A MoreThanMoney.", "O Signal Provider do Copy Trading."]$q$::jsonb, 0),
  (4, $q$Qual é o papel da MoreThanMoney (MTM) neste ecossistema?$q$, $q$["Guardar os depósitos dos clientes.", "Executar as ordens dos clientes na corretora.", "Acrescentar valor com educação, ferramentas pedagógicas, análises e acompanhamento.", "Definir os spreads e as comissões da PU Prime."]$q$::jsonb, 2),
  (5, $q$Qual é a filosofia central da MTM?$q$, $q$["Lucro garantido desde o primeiro mês.", "Alavancagem máxima para resultados rápidos.", "«Ganhar enquanto aprende»: educação, tecnologia, estratégia, acompanhamento e gestão de risco.", "Copiar sinais sem precisar de aprender."]$q$::jsonb, 2),
  (6, $q$Como está estruturada a PU Prime do ponto de vista regulatório?$q$, $q$["É uma marca global operada por várias entidades legais reguladas em diferentes jurisdições — a entidade depende do país do cliente e deve ser confirmada nas fontes oficiais.", "É uma única entidade com a mesma licença para todos os países.", "Não tem regulação: funciona apenas online.", "É regulada pela MoreThanMoney."]$q$::jsonb, 0),
  (7, $q$Um cliente iniciante quer começar com spreads flutuantes e sem comissão direta por lote. Que tipo de conta corresponde a esse perfil?$q$, $q$["ECN", "Prime", "Islamic, obrigatoriamente", "Standard"]$q$::jsonb, 3),
  (8, $q$Para que serve a conta Cent?$q$, $q$["Para negociar sem swaps por motivos religiosos.", "Para testar estratégias com saldo em centavos e micro-lotes.", "Para execução direta profissional com comissão fixa.", "Para receber as comissões do IB."]$q$::jsonb, 1),
  (9, $q$O que caracteriza a conta Islamic?$q$, $q$["É uma conta swap-free, sem juros noturnos.", "Tem alavancagem ilimitada.", "Só permite negociar ouro.", "Não permite levantamentos."]$q$::jsonb, 0),
  (10, $q$Que plataformas de negociação disponibiliza a PU Prime?$q$, $q$["Apenas o MT4.", "Apenas a app da MTM.", "MT4, MT5, WebTrader e a PU Prime Mobile App.", "O TradingView como única plataforma de execução."]$q$::jsonb, 2),
  (11, $q$Que regra de compliance (AML) se aplica aos depósitos e levantamentos?$q$, $q$["O IB pode depositar pelo cliente com o seu próprio cartão.", "A conta de origem ou de destino tem de pertencer ao mesmo titular da conta na corretora.", "Qualquer familiar pode levantar em nome do cliente.", "Os levantamentos podem ir para qualquer conta indicada pelo IB."]$q$::jsonb, 1),
  (12, $q$Sobre o PU Copy Trading, qual afirmação está correta?$q$, $q$["Garante o mesmo lucro do Signal Provider.", "Dispensa o cliente de ter conta própria.", "Só funciona com contas Cent.", "Liga Signal Providers a Copiers (lote fixo, proporção de margem ou múltiplo fixo) e não garante lucros."]$q$::jsonb, 3),
  (13, $q$O que é um rebate?$q$, $q$["O depósito mínimo de uma conta.", "Um bónus garantido pago ao cliente.", "A diferença entre o preço de compra e o de venda.", "Um retorno calculado sobre o volume negociado pelos clientes."]$q$::jsonb, 3),
  (14, $q$O que é um markup?$q$, $q$["O lucro garantido do IB.", "Um ajuste aplicado ao spread ou à comissão, que altera o custo de negociação do cliente.", "Uma taxa de levantamento.", "O nome do portal do IB."]$q$::jsonb, 1),
  (15, $q$Como se calcula, de forma geral, a receita de um IB?$q$, $q$["Número de clientes × valor fixo universal definido pela MTM.", "Percentagem dos lucros dos clientes.", "Volume negociado (em lotes) × taxa de remuneração contratada no acordo do IB.", "Soma dos depósitos dos clientes."]$q$::jsonb, 2),
  (16, $q$Exercício (valores hipotéticos, apenas para cálculo): se o acordo de um IB previsse 2 USD por lote e os clientes negociassem 150 lotes num mês, qual seria a remuneração desse mês?$q$, $q$["300 USD", "150 USD", "75 USD", "3.000 USD"]$q$::jsonb, 0),
  (17, $q$Exercício (valores hipotéticos): 12 clientes negociam em média 5 lotes por mês cada, com uma taxa contratada hipotética de 3 USD por lote. Qual é a receita mensal?$q$, $q$["60 USD", "180 USD", "36 USD", "1.800 USD"]$q$::jsonb, 1),
  (18, $q$Onde deve o IB confirmar comissões, rebates, spreads, bónus ou depósitos mínimos?$q$, $q$["Nas fontes oficiais da PU Prime e no seu acordo de IB — nunca fixar valores de memória.", "Na transcrição da chamada de formação.", "Em grupos de Telegram de outros IBs.", "Não é preciso: os valores são universais."]$q$::jsonb, 0),
  (19, $q$Numa apresentação a um cliente, qual é a ordem recomendada?$q$, $q$["Primeiro os lucros que o cliente vai ter.", "Primeiro a MTM e só no fim, se perguntar, a corretora.", "Primeiro o bónus de depósito.", "Primeiro a PU Prime como solução institucional; depois a MTM como ecossistema educativo de suporte."]$q$::jsonb, 3),
  (20, $q$Qual é a sequência correta do ciclo operacional em 7 etapas?$q$, $q$["Vender → Depositar → Duplicar → Reter → Educar → Informar → Atrair", "Informar → Atrair → Duplicar → Encaminhar → Reter → Educar → Acompanhar", "Atrair → Informar → Encaminhar → Acompanhar → Educar → Reter → Duplicar", "Atrair → Depositar → Levantar → Duplicar → Vender → Reter → Educar"]$q$::jsonb, 2),
  (21, $q$Por onde começa o onboarding de um novo cliente?$q$, $q$["Pelo depósito, antes do registo.", "Pelo envio do link de referência do IB, seguido do registo e da verificação KYC.", "Pela partilha da password do cliente com o IB.", "Pela ativação do Copy Trading sem conta verificada."]$q$::jsonb, 1),
  (22, $q$Porque é que o registo deve ser feito pelo link de referência do IB?$q$, $q$["Porque dá lucro garantido ao cliente.", "Porque dispensa a verificação KYC.", "Não faz diferença.", "Para que o cliente fique associado ao IB e a atividade seja atribuída corretamente."]$q$::jsonb, 3),
  (23, $q$Que passos fazem parte do onboarding de 16 passos?$q$, $q$["Link de referência, KYC, escolha de conta, depósito, acesso às ferramentas MTM e follow-up.", "Apenas o depósito.", "Dar ao IB acesso à conta do cliente para negociar.", "Prometer uma rentabilidade mensal."]$q$::jsonb, 0),
  (24, $q$Um cliente novo pergunta quanto deve arriscar. Qual é a postura correta do IB?$q$, $q$["Dizer-lhe exatamente quanto investir e em que ativo.", "Recomendar a alavancagem máxima.", "Explicar princípios gerais de gestão de risco e remeter para a formação, sem dar aconselhamento personalizado.", "Dizer que com a MTM não há risco."]$q$::jsonb, 2),
  (25, $q$Qual é a diferença entre prospeção inbound e outbound?$q$, $q$["São a mesma coisa.", "Inbound é apenas publicidade paga.", "Inbound atrai contactos através de conteúdo; outbound é o IB a contactar ativamente potenciais clientes.", "Outbound é proibido por lei."]$q$::jsonb, 2),
  (26, $q$Um contacto pergunta: «Isto é garantido?». Qual é a melhor resposta?$q$, $q$["Não: o trading envolve risco de perda; a MTM oferece educação, ferramentas e acompanhamento.", "Sim, com a MTM é garantido.", "Sim, se copiar os sinais.", "Mudar de assunto e enviar o link."]$q$::jsonb, 0),
  (27, $q$Para que serve um script de follow-up?$q$, $q$["Para pressionar o cliente a depositar mais.", "Para substituir a verificação KYC.", "Para prometer resultados.", "Para manter um acompanhamento estruturado do contacto até à decisão e depois do onboarding."]$q$::jsonb, 3),
  (28, $q$Que tipo de conteúdo é adequado para atrair clientes?$q$, $q$["Prints de lucros apresentados como garantidos.", "Conteúdo educativo e transparente, sem promessas de rendimento.", "Promessas de rendimento mensal fixo.", "Dados pessoais de clientes como prova social."]$q$::jsonb, 1),
  (29, $q$O que significa «duplicar» no contexto da rede de IBs?$q$, $q$["Formar novos IBs para que repliquem o método com autonomia.", "Abrir duas contas por cliente.", "Duplicar o depósito do cliente.", "Copiar o conteúdo de outros IBs."]$q$::jsonb, 0),
  (30, $q$Que métricas são mais relevantes para gerir o negócio de um IB?$q$, $q$["Apenas o número de seguidores.", "O lucro individual de cada cliente.", "Clientes ativos, volume negociado, retenção e conversão do funil.", "O número de mensagens enviadas."]$q$::jsonb, 2),
  (31, $q$Como deve ser usada a automação com IA no negócio do IB?$q$, $q$["Para enviar promessas de rendimento automáticas.", "Para apoiar conteúdo, CRM e follow-up, sempre com revisão humana e dentro das regras de compliance.", "Para negociar pelas contas dos clientes.", "Para recolher dados sem consentimento."]$q$::jsonb, 1),
  (32, $q$Qual destas ações é proibida ao IB?$q$, $q$["Explicar como funciona a plataforma.", "Enviar o link de referência.", "Acompanhar o cliente no onboarding.", "Gerir a conta de um cliente ou negociar em nome dele."]$q$::jsonb, 3),
  (33, $q$Um cliente pede: «compra ouro por mim amanhã». O que deve o IB fazer?$q$, $q$["Pedir a password e executar.", "Executar só se for uma posição pequena.", "Aceitar e cobrar uma percentagem do lucro.", "Recusar: o IB não gere contas nem dá aconselhamento personalizado; explica como o cliente pode decidir e executar por si."]$q$::jsonb, 3),
  (34, $q$Qual destas frases de marketing é aceitável?$q$, $q$["«Ganha 10% por mês, garantido.»", "«Aprende a negociar com acompanhamento e gestão de risco. O trading envolve risco de perda.»", "«Sem risco nenhum.»", "«Duplica o teu dinheiro num mês.»"]$q$::jsonb, 1),
  (35, $q$Como deve o IB tratar os dados pessoais dos clientes?$q$, $q$["Publicar documentos do KYC como prova social.", "Partilhar listas de contactos com outros IBs.", "Com consentimento e apenas para o fim necessário, sem os expor publicamente (RGPD).", "Guardar cópias das passwords dos clientes."]$q$::jsonb, 2),
  (36, $q$Numa chamada de formação foi dado um exemplo de comissão por lote. Como deve ser tratado?$q$, $q$["Como simulação didática: as condições reais dependem do contrato do IB e da PU Prime.", "Como valor fixo para prometer a clientes.", "Como condição universal para todos os IBs.", "Como garantia de rendimento."]$q$::jsonb, 0),
  (37, $q$Qual é a hierarquia das fontes de informação da Academia?$q$, $q$["1.º grupos de Telegram; 2.º PU Prime; 3.º MTM.", "1.º fontes oficiais PU Prime; 2.º metodologia MTM (transcrição); 3.º complemento educacional.", "Todas as fontes têm o mesmo peso.", "1.º opinião do IB; 2.º MTM; 3.º PU Prime."]$q$::jsonb, 1),
  (38, $q$Cenário: um cliente quer levantar para a conta bancária de um amigo. Qual é a orientação?$q$, $q$["Não é possível: o levantamento tem de ir para uma conta do próprio titular.", "Pode, se o IB autorizar.", "Pode, se for um valor pequeno.", "O IB levanta para a sua conta e depois transfere."]$q$::jsonb, 0),
  (39, $q$Cenário: um cliente registou-se sem usar o teu link. O que fazer?$q$, $q$["Pedir-lhe que crie uma conta duplicada com outros dados.", "Ignorar e dizer-lhe que já está associado.", "Usar a conta de outro cliente.", "Contactar o suporte da PU Prime e seguir o procedimento oficial, sem prometer que a associação é possível."]$q$::jsonb, 3),
  (40, $q$Cenário: um cliente perdeu dinheiro e diz que o IB «tinha garantido lucro». Qual era a prática correta desde o início?$q$, $q$["Prometer lucro apenas a clientes de confiança.", "Devolver o dinheiro do próprio bolso.", "Nunca prometer resultados e comunicar sempre, com clareza, o risco de perda.", "Culpar a corretora."]$q$::jsonb, 2)
) as v(ord, prompt, opts, correct)
where a.slug = 'academia-ib'
  and not exists (select 1 from public.assessment_questions x where x.assessment_id = a.id);
