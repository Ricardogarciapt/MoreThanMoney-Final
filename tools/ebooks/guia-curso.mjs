// Guia do aluno de «A Primeira Chave · Programa Completo» (Ruben Pereira), com os templates do curso.
// Pedido do Ricardo (22/11/2026): guias do curso em PT, EN, ES e FR.
//
//   node tools/ebooks/guia-curso.mjs            → as 4 línguas
//   node tools/ebooks/guia-curso.mjs fr         → só uma
//
// Lê os títulos e objetivos dos módulos dos guiões de cada língua (conteudo-privado/ebooks/bootcamps/<slug>/modulo-N.md)
// e escreve conteudo-privado/ebooks/bootcamps/<slug>/producao/guia/guia-do-aluno.pdf (A4).
// Sem números de desempenho: os únicos números são as regras do DCA Inteligente MTM e exemplos ilustrativos.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LINGUAS = process.argv[2] ? [process.argv[2]] : ['pt', 'en', 'es', 'fr']
const fonte = f => `url(data:font/ttf;base64,${fs.readFileSync(path.join(RAIZ, 'tools/ebooks/fontes', f)).toString('base64')})`
const img = (p, t = 'jpeg') => `data:image/${t};base64,${fs.readFileSync(path.join(RAIZ, p)).toString('base64')}`
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const limpar = s => (s || '').replace(/\*\*/g, '').replace(/^["“«\s]+|["”»\s]+$/g, '').trim()

const T = {
  pt: {
    html: 'pt-PT', curso: 'A Primeira Chave', sub: 'Programa Completo de Cripto', guia: 'Guia do aluno', educ: 'Ruben Pereira · Educador cripto · MoreThanMoney',
    ola: 'Bem-vindo',
    intro: ['Este guia é o teu mapa. Diz-te o que vais aprender, por que ordem, o que tens de fazer em cada nível e onde estão as ferramentas.', 'Vê uma aula por dia, faz a missão de cada módulo e escreve no caderno. O curso não te pede pressa: pede-te constância.', 'Tudo aqui é educação. Nada é aconselhamento financeiro, e nenhuma ferramenta decide por ti.'],
    como: 'Como funciona', comoItens: ['15 módulos em 3 níveis, com cerca de 65 aulas curtas em vídeo, legendadas', 'Um caderno do aluno por módulo, para imprimir ou preencher', 'Slides de cada aula para rever depressa', 'Missão prática no fim de cada nível', 'Exame final e certificado MTM com código de validação', 'Sala do curso e sessões de grupo para perguntas'],
    niveis: ['Nível 1 · Fundamentos', 'Nível 2 · Investidor com o DCA Inteligente', 'Nível 3 · Trader com o Aurum Flow Cripto (opcional)', 'Fecho'],
    missoesNivel: ['Missão: primeira compra de 10 € numa plataforma autorizada, transferência de teste para a tua carteira e checklist anti-burla assinada.', 'Missão: plano DCA escrito com teto e pote, alertas DCA ligados na app e o ritual de sexta feito 4 semanas seguidas.', 'Missão: 30 operações em conta simulada, com diário completo, antes de pensares em conta real.', 'Exame final, certificado e o teu plano de 90 dias.'],
    mapa: 'O mapa do curso', modulo: 'Módulo',
    dca: 'O DCA Inteligente MTM', dcaIntro: 'Todo o DCA do curso usa as regras do motor DCA Inteligente da MoreThanMoney (app MTM System → Portefólios → Análise DCA). As etiquetas olham para a variação diária do ativo.',
    dcaCols: ['Etiqueta', 'Cripto (variação diária)', 'Reforço sugerido'],
    dcaLinhas: [['Forte Compra', '≤ −8 %', 'até 2× a base'], ['Compra', '−8 % a −4 %', '1,5×'], ['Aguardar', '−4 % a +1,5 %', '50 % da base'], ['Não Reforçar', '> +1,5 %', '0 nesse ativo']],
    dcaNota: 'ETF e ações usam limites mais curtos (−3,5 %, −1,8 %, +0,6 %). Duas regras mandam mais do que qualquer etiqueta: o teto mensal não muda e o que não gastas vai para o pote de reserva. O DCA nunca pára, só muda de tamanho.',
    ferr: 'As ferramentas', ferrItens: [['App MTM System', 'Análise DCA, Portefólios da casa, alertas DCA e o canal diário da Análise DCA.'], ['Momentum e DEFY', 'Segunda opinião em gráfico diário e semanal, para escolher o tamanho do reforço.'], ['Aurum Flow Cripto', 'A estratégia do nível 3: só a favor da tendência, com entrada, stop e três alvos em cada sinal.'], ['WebTrader MTM e MTM Funded', 'Contas simuladas para treinar sem dinheiro real.'], ['MTM Auto', 'Copiar estratégias com regras e limites, sem tirar a responsabilidade de quem copia.']],
    plano: 'O plano de 90 dias', planoItens: [['Dias 1–30', 'Nível 1. Uma aula por dia, a primeira compra pequena, a carteira e a checklist anti-burla.'], ['Dias 31–60', 'Nível 2. O teu plano DCA, os alertas e o ritual de sexta, todas as semanas.'], ['Dias 61–90', 'Nível 3, se quiseres. Perpétuos, Aurum Flow e risco, sempre em conta simulada, com diário.']],
    regras: 'As regras que não se quebram', regrasItens: ['Nunca dinheiro da renda, das contas ou do fundo de emergência', 'Conta simulada antes de dinheiro real', 'O teto mensal não se fura', 'Nunca partilhes a seed phrase com ninguém', 'Um sinal ou uma etiqueta informam, não decidem', 'Se não percebes, não compras'],
    cert: 'Exame e certificado', certTxt: 'No fim do curso fazes o exame final no site, em morethanmoney.pt/avaliacoes. Se passares, recebes o certificado MTM em PDF, com o teu nome, a tua classificação e um código de validação que qualquer pessoa pode confirmar.',
    templates: 'Templates', tpl: {
      dca: ['Plano DCA', ['Valor base por semana', 'Dia fixo', 'Plataforma autorizada', 'Teto mensal', 'Ativos do plano e peso de cada um', 'Regra do pote de reserva']],
      sexta: ['Ritual de sexta', ['Data', 'Etiqueta', 'Momentum / DEFY', 'Compra feita', 'Pote', 'Nota']],
      diario: ['Diário de trading (conta simulada)', ['Data', 'Par', 'Direção', 'Entrada', 'Stop', 'Tamanho', 'Resultado', 'Segui as regras?']],
      calc: ['Calculadora de tamanho', ['Saldo da conta simulada', 'Risco por operação (%)', 'Risco em €', 'Distância ao stop (%)', 'Tamanho da posição = risco € ÷ distância', 'Alavancagem útil']],
      burla: ['Checklist anti-burla', ['Ninguém me pediu a seed phrase', 'A plataforma é autorizada e verifiquei o endereço', 'Não há promessas de lucro garantido', 'Não há pressa nem «só hoje»', 'Não instalei nada que me mandaram', 'Testei com um valor pequeno', 'Ninguém me contactou primeiro a oferecer ajuda', 'Confirmei o endereço da carteira duas vezes', 'Tenho a autenticação de dois fatores ligada', 'Se tive dúvida, parei e perguntei']],
      heranca: ['Plano de herança cripto', ['Onde estão os ativos (sem a seed)', 'Onde está a cópia da seed', 'Quem sabe que existe', 'Instruções para a família', 'Revisto em']],
    },
    aviso: 'Conteúdo educativo. Não é aconselhamento financeiro. O risco de perda é real e pode ser total. Exemplos com números são ilustrativos.',
  },
  en: {
    html: 'en-GB', curso: 'The First Key', sub: 'Complete Crypto Programme', guia: 'Student guide', educ: 'Ruben Pereira · Crypto educator · MoreThanMoney',
    ola: 'Welcome',
    intro: ['This guide is your map. It tells you what you will learn, in what order, what to do at each level and where the tools are.', 'Watch one lesson a day, do each module’s mission and write in your workbook. The course does not ask you to rush: it asks you to be consistent.', 'Everything here is education. None of it is financial advice, and no tool decides for you.'],
    como: 'How it works', comoItens: ['15 modules in 3 levels, about 65 short subtitled video lessons', 'A student workbook per module, to print or fill in', 'Slides for every lesson to review quickly', 'A practical mission at the end of each level', 'Final exam and MTM certificate with a validation code', 'Course room and group sessions for questions'],
    niveis: ['Level 1 · Foundations', 'Level 2 · Investor with MTM Smart DCA', 'Level 3 · Trader with Aurum Flow Cripto (optional)', 'Wrap-up'],
    missoesNivel: ['Mission: a first €10 purchase on an authorised platform, a test transfer to your wallet and a signed anti-scam checklist.', 'Mission: a written DCA plan with a cap and a reserve pot, DCA alerts switched on in the app, and the Friday ritual done 4 weeks in a row.', 'Mission: 30 trades on a simulated account, with a full journal, before you even think about a real account.', 'Final exam, certificate and your 90-day plan.'],
    mapa: 'The course map', modulo: 'Module',
    dca: 'MTM Smart DCA', dcaIntro: 'All DCA in the course uses the rules of the MoreThanMoney Smart DCA engine (MTM System app → Portfolios → DCA Analysis). The labels look at the asset’s daily change.',
    dcaCols: ['Label', 'Crypto (daily change)', 'Suggested top-up'],
    dcaLinhas: [['Strong Buy', '≤ −8%', 'up to 2× the base'], ['Buy', '−8% to −4%', '1.5×'], ['Wait', '−4% to +1.5%', '50% of the base'], ['Do Not Add', '> +1.5%', '0 on that asset']],
    dcaNota: 'ETFs and stocks use tighter limits (−3.5%, −1.8%, +0.6%). Two rules beat any label: the monthly cap never changes, and whatever you don’t spend goes into the reserve pot. DCA never stops, it only changes size.',
    ferr: 'The tools', ferrItens: [['MTM System app', 'DCA Analysis, house Portfolios, DCA alerts and the daily DCA Analysis channel.'], ['Momentum and DEFY', 'A second opinion on the daily and weekly chart, to choose the size of the top-up.'], ['Aurum Flow Cripto', 'The level 3 strategy: trend-only, with entry, stop and three targets on every signal.'], ['MTM WebTrader and MTM Funded', 'Simulated accounts to practise without real money.'], ['MTM Auto', 'Copy strategies with rules and limits, without removing the copier’s responsibility.']],
    plano: 'The 90-day plan', planoItens: [['Days 1–30', 'Level 1. One lesson a day, the small first purchase, the wallet and the anti-scam checklist.'], ['Days 31–60', 'Level 2. Your DCA plan, the alerts and the Friday ritual, every week.'], ['Days 61–90', 'Level 3, if you want it. Perpetuals, Aurum Flow and risk, always on a simulated account, with a journal.']],
    regras: 'The rules you never break', regrasItens: ['Never rent money, bill money or your emergency fund', 'Simulated account before real money', 'The monthly cap is never broken', 'Never share your seed phrase with anyone', 'A signal or a label informs, it does not decide', 'If you don’t understand it, you don’t buy it'],
    cert: 'Exam and certificate', certTxt: 'At the end of the course you take the final exam on the website, at morethanmoney.pt/avaliacoes. If you pass, you receive the MTM certificate as a PDF, with your name, your grade and a validation code anyone can check.',
    templates: 'Templates', tpl: {
      dca: ['DCA plan', ['Base amount per week', 'Fixed day', 'Authorised platform', 'Monthly cap', 'Assets in the plan and weight of each', 'Reserve pot rule']],
      sexta: ['Friday ritual', ['Date', 'Label', 'Momentum / DEFY', 'Purchase made', 'Pot', 'Note']],
      diario: ['Trading journal (simulated account)', ['Date', 'Pair', 'Direction', 'Entry', 'Stop', 'Size', 'Result', 'Did I follow the rules?']],
      calc: ['Position size calculator', ['Simulated account balance', 'Risk per trade (%)', 'Risk in €', 'Distance to stop (%)', 'Position size = € risk ÷ distance', 'Useful leverage']],
      burla: ['Anti-scam checklist', ['Nobody asked me for my seed phrase', 'The platform is authorised and I checked the address', 'There are no promises of guaranteed profit', 'There is no rush and no “today only”', 'I installed nothing someone sent me', 'I tested with a small amount', 'Nobody contacted me first offering help', 'I checked the wallet address twice', 'Two-factor authentication is on', 'When in doubt, I stopped and asked']],
      heranca: ['Crypto inheritance plan', ['Where the assets are (without the seed)', 'Where the seed backup is', 'Who knows it exists', 'Instructions for the family', 'Reviewed on']],
    },
    aviso: 'Educational content. Not financial advice. The risk of loss is real and can be total. Examples with numbers are illustrative.',
  },
  es: {
    html: 'es-ES', curso: 'La Primera Llave', sub: 'Programa Completo de Cripto', guia: 'Guía del alumno', educ: 'Ruben Pereira · Educador cripto · MoreThanMoney',
    ola: 'Bienvenido',
    intro: ['Esta guía es tu mapa. Te dice qué vas a aprender, en qué orden, qué tienes que hacer en cada nivel y dónde están las herramientas.', 'Mira una clase al día, haz la misión de cada módulo y escribe en el cuaderno. El curso no te pide prisa: te pide constancia.', 'Todo aquí es educación. Nada es asesoramiento financiero, y ninguna herramienta decide por ti.'],
    como: 'Cómo funciona', comoItens: ['15 módulos en 3 niveles, con unas 65 clases cortas en vídeo, subtituladas', 'Un cuaderno del alumno por módulo, para imprimir o rellenar', 'Diapositivas de cada clase para repasar rápido', 'Misión práctica al final de cada nivel', 'Examen final y certificado MTM con código de validación', 'Sala del curso y sesiones de grupo para preguntas'],
    niveis: ['Nivel 1 · Fundamentos', 'Nivel 2 · Inversor con el DCA Inteligente', 'Nivel 3 · Trader con Aurum Flow Cripto (opcional)', 'Cierre'],
    missoesNivel: ['Misión: primera compra de 10 € en una plataforma autorizada, transferencia de prueba a tu monedero y checklist antiestafa firmada.', 'Misión: plan DCA escrito con tope y bote, alertas DCA activadas en la app y el ritual del viernes hecho 4 semanas seguidas.', 'Misión: 30 operaciones en cuenta simulada, con diario completo, antes de pensar en una cuenta real.', 'Examen final, certificado y tu plan de 90 días.'],
    mapa: 'El mapa del curso', modulo: 'Módulo',
    dca: 'El DCA Inteligente MTM', dcaIntro: 'Todo el DCA del curso usa las reglas del motor DCA Inteligente de MoreThanMoney (app MTM System → Portafolios → Análisis DCA). Las etiquetas miran la variación diaria del activo.',
    dcaCols: ['Etiqueta', 'Cripto (variación diaria)', 'Refuerzo sugerido'],
    dcaLinhas: [['Compra Fuerte', '≤ −8 %', 'hasta 2× la base'], ['Compra', '−8 % a −4 %', '1,5×'], ['Esperar', '−4 % a +1,5 %', '50 % de la base'], ['No Reforzar', '> +1,5 %', '0 en ese activo']],
    dcaNota: 'ETF y acciones usan límites más cortos (−3,5 %, −1,8 %, +0,6 %). Dos reglas mandan más que cualquier etiqueta: el tope mensual no cambia y lo que no gastas va al bote de reserva. El DCA nunca para, solo cambia de tamaño.',
    ferr: 'Las herramientas', ferrItens: [['App MTM System', 'Análisis DCA, Portafolios de la casa, alertas DCA y el canal diario del Análisis DCA.'], ['Momentum y DEFY', 'Segunda opinión en gráfico diario y semanal, para elegir el tamaño del refuerzo.'], ['Aurum Flow Cripto', 'La estrategia del nivel 3: solo a favor de la tendencia, con entrada, stop y tres objetivos en cada señal.'], ['WebTrader MTM y MTM Funded', 'Cuentas simuladas para entrenar sin dinero real.'], ['MTM Auto', 'Copiar estrategias con reglas y límites, sin quitar la responsabilidad a quien copia.']],
    plano: 'El plan de 90 días', planoItens: [['Días 1–30', 'Nivel 1. Una clase al día, la primera compra pequeña, el monedero y la checklist antiestafa.'], ['Días 31–60', 'Nivel 2. Tu plan DCA, las alertas y el ritual del viernes, cada semana.'], ['Días 61–90', 'Nivel 3, si quieres. Perpetuos, Aurum Flow y riesgo, siempre en cuenta simulada, con diario.']],
    regras: 'Las reglas que no se rompen', regrasItens: ['Nunca el dinero del alquiler, de las facturas ni del fondo de emergencia', 'Cuenta simulada antes que dinero real', 'El tope mensual no se rompe', 'Nunca compartas la seed phrase con nadie', 'Una señal o una etiqueta informan, no deciden', 'Si no lo entiendes, no lo compras'],
    cert: 'Examen y certificado', certTxt: 'Al final del curso haces el examen final en la web, en morethanmoney.pt/avaliacoes. Si apruebas, recibes el certificado MTM en PDF, con tu nombre, tu calificación y un código de validación que cualquiera puede comprobar.',
    templates: 'Plantillas', tpl: {
      dca: ['Plan DCA', ['Importe base por semana', 'Día fijo', 'Plataforma autorizada', 'Tope mensual', 'Activos del plan y peso de cada uno', 'Regla del bote de reserva']],
      sexta: ['Ritual del viernes', ['Fecha', 'Etiqueta', 'Momentum / DEFY', 'Compra hecha', 'Bote', 'Nota']],
      diario: ['Diario de trading (cuenta simulada)', ['Fecha', 'Par', 'Dirección', 'Entrada', 'Stop', 'Tamaño', 'Resultado', '¿Seguí las reglas?']],
      calc: ['Calculadora de tamaño', ['Saldo de la cuenta simulada', 'Riesgo por operación (%)', 'Riesgo en €', 'Distancia al stop (%)', 'Tamaño = riesgo € ÷ distancia', 'Apalancamiento útil']],
      burla: ['Checklist antiestafa', ['Nadie me ha pedido la seed phrase', 'La plataforma está autorizada y he comprobado la dirección', 'No hay promesas de beneficio garantizado', 'No hay prisas ni «solo hoy»', 'No he instalado nada que me hayan enviado', 'He probado con un importe pequeño', 'Nadie me ha contactado primero ofreciendo ayuda', 'He comprobado la dirección del monedero dos veces', 'Tengo la autenticación en dos pasos activada', 'Si he dudado, he parado y he preguntado']],
      heranca: ['Plan de herencia cripto', ['Dónde están los activos (sin la seed)', 'Dónde está la copia de la seed', 'Quién sabe que existe', 'Instrucciones para la familia', 'Revisado el']],
    },
    aviso: 'Contenido educativo. No es asesoramiento financiero. El riesgo de pérdida es real y puede ser total. Los ejemplos con números son ilustrativos.',
  },
  fr: {
    html: 'fr-FR', curso: 'La Première Clé', sub: 'Programme Complet Crypto', guia: 'Guide de l’élève', educ: 'Ruben Pereira · Éducateur crypto · MoreThanMoney',
    ola: 'Bienvenue',
    intro: ['Ce guide est ta carte. Il te dit ce que tu vas apprendre, dans quel ordre, ce que tu dois faire à chaque niveau et où se trouvent les outils.', 'Regarde une leçon par jour, fais la mission de chaque module et écris dans ton cahier. Le cours ne te demande pas d’aller vite : il te demande d’être régulier.', 'Tout ici est de l’éducation. Rien n’est un conseil financier, et aucun outil ne décide à ta place.'],
    como: 'Comment ça marche', comoItens: ['15 modules en 3 niveaux, environ 65 courtes leçons vidéo sous-titrées', 'Un cahier de l’élève par module, à imprimer ou à remplir', 'Les slides de chaque leçon pour réviser vite', 'Une mission pratique à la fin de chaque niveau', 'Examen final et certificat MTM avec code de validation', 'Salle du cours et sessions de groupe pour les questions'],
    niveis: ['Niveau 1 · Fondamentaux', 'Niveau 2 · Investisseur avec le DCA Intelligent', 'Niveau 3 · Trader avec Aurum Flow Cripto (optionnel)', 'Clôture'],
    missoesNivel: ['Mission : premier achat de 10 € sur une plateforme autorisée, transfert test vers ton wallet et checklist anti-arnaque signée.', 'Mission : plan DCA écrit avec plafond et réserve, alertes DCA activées dans l’app et le rituel du vendredi fait 4 semaines de suite.', 'Mission : 30 trades sur compte simulé, avec journal complet, avant même de penser à un compte réel.', 'Examen final, certificat et ton plan de 90 jours.'],
    mapa: 'La carte du cours', modulo: 'Module',
    dca: 'Le DCA Intelligent MTM', dcaIntro: 'Tout le DCA du cours utilise les règles du moteur DCA Intelligent de MoreThanMoney (app MTM System → Portefeuilles → Analyse DCA). Les étiquettes regardent la variation journalière de l’actif.',
    dcaCols: ['Étiquette', 'Crypto (variation journalière)', 'Renfort suggéré'],
    dcaLinhas: [['Achat Fort', '≤ −8 %', 'jusqu’à 2× la base'], ['Achat', '−8 % à −4 %', '1,5×'], ['Attendre', '−4 % à +1,5 %', '50 % de la base'], ['Ne Pas Renforcer', '> +1,5 %', '0 sur cet actif']],
    dcaNota: 'Les ETF et les actions utilisent des seuils plus courts (−3,5 %, −1,8 %, +0,6 %). Deux règles passent avant toute étiquette : le plafond mensuel ne change pas et ce que tu ne dépenses pas va dans la réserve. Le DCA ne s’arrête jamais, il change seulement de taille.',
    ferr: 'Les outils', ferrItens: [['App MTM System', 'Analyse DCA, Portefeuilles de la maison, alertes DCA et le canal quotidien de l’Analyse DCA.'], ['Momentum et DEFY', 'Un deuxième avis en graphique journalier et hebdomadaire, pour choisir la taille du renfort.'], ['Aurum Flow Cripto', 'La stratégie du niveau 3 : uniquement dans le sens de la tendance, avec entrée, stop et trois objectifs à chaque signal.'], ['WebTrader MTM et MTM Funded', 'Des comptes simulés pour s’entraîner sans argent réel.'], ['MTM Auto', 'Copier des stratégies avec des règles et des limites, sans enlever la responsabilité de celui qui copie.']],
    plano: 'Le plan de 90 jours', planoItens: [['Jours 1–30', 'Niveau 1. Une leçon par jour, le petit premier achat, le wallet et la checklist anti-arnaque.'], ['Jours 31–60', 'Niveau 2. Ton plan DCA, les alertes et le rituel du vendredi, chaque semaine.'], ['Jours 61–90', 'Niveau 3, si tu veux. Perpétuels, Aurum Flow et risque, toujours sur compte simulé, avec journal.']],
    regras: 'Les règles qu’on ne casse pas', regrasItens: ['Jamais l’argent du loyer, des factures ou de l’épargne de précaution', 'Compte simulé avant l’argent réel', 'Le plafond mensuel ne se dépasse pas', 'Ne partage jamais ta seed phrase', 'Un signal ou une étiquette informent, ils ne décident pas', 'Si tu ne comprends pas, tu n’achètes pas'],
    cert: 'Examen et certificat', certTxt: 'À la fin du cours, tu passes l’examen final sur le site, sur morethanmoney.pt/avaliacoes. Si tu réussis, tu reçois le certificat MTM en PDF, avec ton nom, ta note et un code de validation que tout le monde peut vérifier.',
    templates: 'Modèles', tpl: {
      dca: ['Plan DCA', ['Montant de base par semaine', 'Jour fixe', 'Plateforme autorisée', 'Plafond mensuel', 'Actifs du plan et poids de chacun', 'Règle de la réserve']],
      sexta: ['Rituel du vendredi', ['Date', 'Étiquette', 'Momentum / DEFY', 'Achat fait', 'Réserve', 'Note']],
      diario: ['Journal de trading (compte simulé)', ['Date', 'Paire', 'Sens', 'Entrée', 'Stop', 'Taille', 'Résultat', 'Ai-je suivi les règles ?']],
      calc: ['Calculateur de taille', ['Solde du compte simulé', 'Risque par trade (%)', 'Risque en €', 'Distance au stop (%)', 'Taille = risque € ÷ distance', 'Levier utile']],
      burla: ['Checklist anti-arnaque', ['Personne ne m’a demandé ma seed phrase', 'La plateforme est autorisée et j’ai vérifié l’adresse', 'Aucune promesse de gain garanti', 'Pas d’urgence ni de « aujourd’hui seulement »', 'Je n’ai rien installé de ce qu’on m’a envoyé', 'J’ai testé avec un petit montant', 'Personne ne m’a contacté en premier pour m’aider', 'J’ai vérifié l’adresse du wallet deux fois', 'La double authentification est activée', 'Dans le doute, je me suis arrêté et j’ai demandé']],
      heranca: ['Plan de succession crypto', ['Où sont les actifs (sans la seed)', 'Où est la copie de la seed', 'Qui sait qu’elle existe', 'Instructions pour la famille', 'Revu le']],
    },
    aviso: 'Contenu éducatif. Pas un conseil financier. Le risque de perte est réel et peut être total. Les exemples chiffrés sont illustratifs.',
  },
}

// módulo → nível: 1–5 fundamentos, 6–10 investidor, 11–14 trader, 15 fecho
const nivelDe = n => (n <= 5 ? 0 : n <= 10 ? 1 : n <= 14 ? 2 : 3)

function lerModulos(dir) {
  return fs.readdirSync(dir).filter(f => /^modulo-\d+\.md$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7))).map(f => {
    const md = fs.readFileSync(path.join(dir, f), 'utf8')
    const num = Number(f.match(/\d+/)[0])
    const titulo = limpar((md.match(/^# [^—\n]+— (.+?)(?:\s*\(≈[^)]*\))?\s*$/m) || [])[1] || '')
    const objetivo = limpar((md.match(/\*\*Objetivo:\*\*\s*(.+?)(?=\s*\*\*No fim|\n)/) || [])[1] || '')
    const aulas = [...md.matchAll(/^## [^—\n]+— (.+?)(?:\s*\(≈[^)]*\))?\s*$/gm)].map(m => limpar(m[1]))
    return { num, titulo, objetivo, aulas }
  })
}

const CSS = `@font-face{font-family:Anton;src:${fonte('Anton.ttf')}}@font-face{font-family:Inter;src:${fonte('Inter-1.ttf')};font-weight:400}@font-face{font-family:Inter;src:${fonte('Inter-2.ttf')};font-weight:700}@font-face{font-family:Kalam;src:${fonte('Kalam.ttf')}}
@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;font-size:10.5pt;line-height:1.5;color:#1b1813}
.pg{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:20mm 18mm 22mm}
.escura{background:radial-gradient(160mm 110mm at 90% 0%,rgba(210,166,60,.22),transparent 60%),#0b0a08;color:#f3ede1}
.k{font-family:Anton,Impact;text-transform:uppercase;line-height:.95}
.sup{font-weight:700;letter-spacing:.3em;text-transform:uppercase;font-size:9pt;color:#B8871F}.escura .sup{color:#E9C46A}
h1{font-family:Anton;text-transform:uppercase;font-size:30pt;line-height:1;margin:2mm 0 6mm}
h3{font-family:Anton;text-transform:uppercase;font-size:14pt;margin:6mm 0 2mm;color:#0b0a08}
.pe{position:absolute;left:18mm;right:18mm;bottom:10mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#8a8170;border-top:.5pt solid #e0d7c4;padding-top:2mm}
.escura .pe{border-color:rgba(233,196,106,.2);color:rgba(243,237,225,.5)}
.ouro{color:#D2A63C}.lista li{margin:1.6mm 0 1.6mm 5mm}
.nivel{border-left:3pt solid #D2A63C;padding:1mm 0 1mm 5mm;margin:5mm 0 2mm}
.nivel b{font-family:Anton;text-transform:uppercase;font-size:13pt;letter-spacing:.02em}
.mod{display:grid;grid-template-columns:13mm 1fr;gap:3mm;margin:2.2mm 0}.mod .n{font-family:Anton;font-size:16pt;color:#D2A63C;line-height:1}
.mod .t{font-weight:700}.mod .a{font-size:8.5pt;color:#6b6457}
.missao{background:#faf5ea;border:1pt solid #e7d6a8;border-radius:2.5mm;padding:2.5mm 4mm;font-size:9pt;margin:2mm 0 0 16mm}
table{width:100%;border-collapse:collapse;margin:4mm 0}th{font-size:8.5pt;letter-spacing:.12em;text-transform:uppercase;color:#8a6414;text-align:left;border-bottom:1.2pt solid #D2A63C;padding:2mm}
td{padding:2.6mm 2mm;border-bottom:.6pt solid #e8e0cf}td:first-child{font-family:Anton;font-size:12.5pt;color:#0b0a08}
.caixa{border:1.2pt solid #D2A63C;border-radius:3mm;padding:4mm 5mm;margin:4mm 0}
.cartoes{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}.cartao{border:1pt solid #e2d4ad;border-radius:3mm;padding:4mm}.cartao b{display:block;font-family:Anton;text-transform:uppercase;font-size:12pt;margin-bottom:1mm}
.linha{display:grid;grid-template-columns:62mm 1fr;align-items:end;gap:4mm;margin:4.2mm 0}.linha span:last-child{border-bottom:.7pt solid #bdb39f;height:7mm}
.tab td{height:9mm;font-family:Inter;font-size:9pt}.tab td:first-child{font-family:Inter;font-size:9pt}
.check{display:flex;gap:3mm;align-items:center;margin:3.4mm 0}.check i{width:5mm;height:5mm;border:1.2pt solid #8a6414;border-radius:1mm;flex:none}
.aviso{font-size:8pt;color:#6b6457;margin-top:6mm}`

for (const l of LINGUAS) {
  const t = T[l], slug = l === 'pt' ? 'a-primeira-chave' : `a-primeira-chave-${l}`
  const dir = path.join(RAIZ, 'conteudo-privado/ebooks/bootcamps', slug)
  const mods = lerModulos(dir)
  let np = 0
  const pe = () => `<div class="pe"><span>${esc(t.curso)} · ${esc(t.guia)}</span><span>${++np}</span></div>`
  const pags = []
  pags.push(`<section class="pg escura"><div class="sup">MoreThanMoney · ${esc(t.guia)}</div>
<div class="k" style="font-size:60pt;margin-top:48mm">${esc(t.curso)}</div><div style="font-family:Kalam;font-size:22pt;color:#E9C46A;margin-top:4mm">${esc(t.sub)}</div>
<img src="${img('public/educadores/ruben/retrato.jpg')}" style="position:absolute;right:18mm;bottom:30mm;width:78mm;height:98mm;object-fit:cover;border-radius:3mm;border:1pt solid rgba(233,196,106,.45)">
<div style="position:absolute;left:18mm;bottom:30mm;max-width:85mm;font-size:10pt;color:rgba(243,237,225,.8)">${esc(t.educ)}</div>${pe()}</section>`)
  pags.push(`<section class="pg"><div class="sup">${esc(t.guia)}</div><h1>${esc(t.ola)}</h1>${t.intro.map(p => `<p style="margin-bottom:3mm">${esc(p)}</p>`).join('')}
<h3>${esc(t.como)}</h3><ul class="lista">${t.comoItens.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
<h3>${esc(t.regras)}</h3><ul class="lista">${t.regrasItens.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="aviso">${esc(t.aviso)}</p>${pe()}</section>`)
  // mapa do curso: 2 páginas (níveis 1–2 e 3–fecho)
  for (const grupo of [[0, 1], [2, 3]]) {
    pags.push(`<section class="pg"><div class="sup">${esc(t.guia)}</div><h1>${esc(t.mapa)}</h1>${grupo.map(nv => `<div class="nivel"><b>${esc(t.niveis[nv])}</b></div>
${mods.filter(m => nivelDe(m.num) === nv).map(m => `<div class="mod"><div class="n">${String(m.num).padStart(2, '0')}</div><div><div class="t">${esc(m.titulo)}</div><div class="a">${m.aulas.map(esc).join(' · ')}</div></div></div>`).join('')}
<div class="missao">${esc(t.missoesNivel[nv])}</div>`).join('')}${pe()}</section>`)
  }
  pags.push(`<section class="pg"><div class="sup">${esc(t.guia)}</div><h1>${esc(t.dca)}</h1><p>${esc(t.dcaIntro)}</p>
<table><tr>${t.dcaCols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${t.dcaLinhas.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
<div class="caixa">${esc(t.dcaNota)}</div>
<h3>${esc(t.ferr)}</h3><div class="cartoes">${t.ferrItens.map(([a, b]) => `<div class="cartao"><b>${esc(a)}</b>${esc(b)}</div>`).join('')}</div>${pe()}</section>`)
  pags.push(`<section class="pg"><div class="sup">${esc(t.guia)}</div><h1>${esc(t.plano)}</h1>
${t.planoItens.map(([a, b]) => `<div class="caixa"><b class="ouro" style="font-family:Anton;font-size:15pt;text-transform:uppercase">${esc(a)}</b><p style="margin-top:1mm">${esc(b)}</p><div style="margin-top:3mm">${'<div class="linha"><span></span><span></span></div>'.repeat(0)}${'<div style="border-bottom:.6pt solid #cfc6b4;height:8mm"></div>'.repeat(3)}</div></div>`).join('')}
<h3>${esc(t.cert)}</h3><p>${esc(t.certTxt)}</p>${pe()}</section>`)
  // templates
  const tp = t.tpl
  const formulario = ([nome, campos]) => `<section class="pg"><div class="sup">${esc(t.templates)}</div><h1>${esc(nome)}</h1>${campos.map(c => `<div class="linha"><span>${esc(c)}</span><span></span></div>`).join('')}
<div style="margin-top:8mm">${'<div style="border-bottom:.6pt solid #cfc6b4;height:9mm"></div>'.repeat(8)}</div><p class="aviso">${esc(t.aviso)}</p>${pe()}</section>`
  const tabela = ([nome, cols], linhas) => `<section class="pg"><div class="sup">${esc(t.templates)}</div><h1>${esc(nome)}</h1><table class="tab"><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${`<tr>${cols.map(() => '<td></td>').join('')}</tr>`.repeat(linhas)}</table><p class="aviso">${esc(t.aviso)}</p>${pe()}</section>`
  pags.push(formulario(tp.dca), tabela(tp.sexta, 18), tabela(tp.diario, 18), formulario(tp.calc))
  pags.push(`<section class="pg"><div class="sup">${esc(t.templates)}</div><h1>${esc(tp.burla[0])}</h1>${tp.burla[1].map(c => `<div class="check"><i></i><span>${esc(c)}</span></div>`).join('')}<p class="aviso">${esc(t.aviso)}</p>${pe()}</section>`)
  pags.push(formulario(tp.heranca))
  const html = `<!doctype html><html lang="${t.html}"><meta charset="utf-8"><style>${CSS}</style><body>${pags.join('\n')}</body></html>`
  const out = path.join(dir, 'producao/guia'); fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch(); const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path: path.join(out, 'guia-do-aluno.pdf'), format: 'A4', printBackground: true })
  await browser.close()
  console.log(`${l}: guia com ${pags.length} páginas, ${mods.length} módulos → ${path.relative(RAIZ, out)}/guia-do-aluno.pdf`)
}
