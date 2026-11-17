/**
 * DEMO B2B DO DIA — uma demonstração nova por dia em /solucoes/demos (pedido do Ricardo, 17/11/2026).
 *
 * Como funciona, sem deploy diário:
 *  · cada demo tem uma `data` (YYYY-MM-DD, hora de Lisboa). Só aparece no site a partir desse dia;
 *  · a fila vive aqui mesmo: a rotina diária «B2B · Demo do dia» mantém sempre ≥ 7 dias de demos à
 *    frente (escreve as seguintes, corre a guarda e faz merge), por isso todos os dias sai uma sem
 *    ninguém tocar em nada;
 *  · o motor de prospeção B2B (lib/b2b/sequencias.ts) junta ao 1.º email o link da demo do dia que
 *    serve o segmento do destinatário.
 *
 * Regras (decisões do dono): é uma DEMONSTRAÇÃO, não um caso de cliente (DL 57/2008: nunca dizer
 * que um negócio real a usa). Nenhum número de resultado inventado. Português de Portugal.
 */
import type { Segmento } from '@/lib/b2b/sequencias'

export type Quem = 'cliente' | 'agente' | 'sistema' | 'dono'

export interface Passo {
  quem: Quem
  texto: string
}

export interface DemoDiaria {
  slug: string
  /** Dia em que entra no site (Lisboa). */
  data: string
  titulo: string
  /** Para quem é, em poucas palavras. */
  para: string
  /** A dor, na voz do dono do negócio. */
  dor: string
  /** O que muda, numa frase. Sem números. */
  promessa: string
  /** O ecrã da demo: a conversa ou o fluxo, passo a passo. */
  roteiro: Passo[]
  /** O que fica feito sem o dono tocar. */
  fica: string[]
  /** Peças que usamos (para quem pergunta «com quê?»). */
  pecas: string[]
  /** Segmentos B2B a quem o email do dia mostra esta demo. */
  segmentos: Segmento[]
}

export const DEMOS_DIARIAS: DemoDiaria[] = [
  {
    slug: 'crm-por-voz',
    data: '2026-11-17',
    titulo: 'CRM por voz: falas, o cliente fica registado',
    para: 'Comerciais, técnicos e quem anda na rua',
    dor: 'Saio de uma visita e já não me lembro do que prometi. À noite ninguém tem cabeça para preencher fichas.',
    promessa: 'Gravas uma nota de voz ao sair do cliente e a ficha, a tarefa e o lembrete ficam feitos.',
    roteiro: [
      { quem: 'dono', texto: 'Nota de voz: «Estive com a Ana da Padaria Central. Quer orçamento para a montra até sexta. Ligar-lhe quinta de manhã.»' },
      { quem: 'sistema', texto: 'Ficha actualizada: Padaria Central · contacto Ana · interesse: montra.' },
      { quem: 'sistema', texto: 'Tarefa criada: enviar orçamento até sexta.' },
      { quem: 'sistema', texto: 'Lembrete: quinta, 10h00 · ligar à Ana.' },
      { quem: 'agente', texto: 'Quinta, 10h00: «Lembrete: ligar à Ana (Padaria Central) sobre o orçamento da montra.»' },
    ],
    fica: ['Ficha do cliente sempre em dia', 'Tarefas e prazos tirados da própria fala', 'Lembretes no telemóvel à hora certa'],
    pecas: ['Nota de voz no WhatsApp ou na app', 'Transcrição e leitura por IA', 'CRM próprio com lembretes'],
    segmentos: ['negocio_local'],
  },
  {
    slug: 'reuniao-com-resumo',
    data: '2026-11-18',
    titulo: 'Reunião no Google Meet com resumo e tarefas no fim',
    para: 'Equipas pequenas, consultores, agências',
    dor: 'Acabamos a reunião e cada um saiu com uma ideia diferente do que ficou decidido.',
    promessa: 'Quando a chamada acaba, todos recebem o resumo, as decisões e quem faz o quê.',
    roteiro: [
      { quem: 'sistema', texto: 'Reunião «Campanha de Natal» terminou · 3 participantes.' },
      { quem: 'agente', texto: 'Resumo: decidiu-se avançar com a montra digital e um email aos clientes antigos.' },
      { quem: 'agente', texto: 'Tarefas: Rita · textos do email até dia 25. Bruno · fotos da montra até dia 27.' },
      { quem: 'sistema', texto: 'Tarefas criadas no quadro da equipa e enviadas por email a cada um.' },
      { quem: 'dono', texto: 'Visto. Assim ninguém se esquece.' },
    ],
    fica: ['Resumo escrito de cada reunião', 'Decisões guardadas num só sítio', 'Tarefas atribuídas com prazo'],
    pecas: ['Google Meet', 'Transcrição e resumo por IA', 'Quadro de tarefas e email'],
    segmentos: ['negocio_local', 'parceria_redes'],
  },
  {
    slug: 'marcacoes-whatsapp',
    data: '2026-11-19',
    titulo: 'Marcações pelo WhatsApp, a qualquer hora',
    para: 'Cabeleireiros, clínicas, ginásios, oficinas',
    dor: 'Passo o dia a responder «tem vaga amanhã?» entre clientes. À noite as mensagens ficam sem resposta.',
    promessa: 'O cliente pergunta, vê as vagas e marca sozinho. Tu só vês a agenda a encher.',
    roteiro: [
      { quem: 'cliente', texto: 'Olá! Tem vaga para corte amanhã ao fim da tarde?' },
      { quem: 'agente', texto: 'Olá! Amanhã tenho 17h30 ou 18h15. Qual prefere?' },
      { quem: 'cliente', texto: '18h15 por favor.' },
      { quem: 'agente', texto: 'Marcado: amanhã, 18h15, corte. Envio-lhe um lembrete 2 horas antes. Até amanhã!' },
      { quem: 'sistema', texto: 'Agenda actualizada · lembrete agendado · cliente guardado na ficha.' },
    ],
    fica: ['Respostas imediatas, de dia e de noite', 'Agenda sempre certa, sem marcações duplicadas', 'Lembretes que reduzem faltas'],
    pecas: ['WhatsApp Business (API oficial)', 'Agente de IA com as tuas regras', 'Agenda própria'],
    segmentos: ['negocio_local'],
  },
  {
    slug: 'orcamento-automatico',
    data: '2026-11-20',
    titulo: 'Orçamento em minutos a partir de um formulário',
    para: 'Instaladores, obras, serviços técnicos',
    dor: 'Cada pedido de orçamento são idas e voltas por telefone até ter a informação toda.',
    promessa: 'O cliente responde a 5 perguntas, envia fotos e recebe um orçamento-base para confirmares.',
    roteiro: [
      { quem: 'cliente', texto: 'Preciso de ar condicionado para uma sala de 25 m². Envio fotos.' },
      { quem: 'agente', texto: 'Obrigado! Já tenho as fotos. A parede exterior fica do lado da janela?' },
      { quem: 'cliente', texto: 'Sim, mesmo ao lado.' },
      { quem: 'sistema', texto: 'Orçamento-base preparado com a tua tabela de preços · à espera da tua aprovação.' },
      { quem: 'dono', texto: 'Aprovado. Enviado ao cliente em PDF com o teu logótipo.' },
    ],
    fica: ['Pedidos com a informação completa à primeira', 'Orçamentos com a tua tabela e o teu logótipo', 'Tu só aprovas'],
    pecas: ['Formulário com fotos', 'Leitura por IA', 'Gerador de PDF com a tua marca'],
    segmentos: ['negocio_local'],
  },
  {
    slug: 'avaliacoes-google',
    data: '2026-11-21',
    titulo: 'Pedir avaliações no Google no momento certo',
    para: 'Restaurantes, alojamento local, comércio',
    dor: 'Os clientes satisfeitos vão-se embora sem deixar avaliação; quem reclama escreve sempre.',
    promessa: 'Depois de cada visita, o cliente recebe um pedido simpático. Se algo correu mal, a mensagem vem primeiro para ti.',
    roteiro: [
      { quem: 'sistema', texto: 'Visita concluída: Mesa 4 · jantar.' },
      { quem: 'agente', texto: '«Obrigado por ter jantado connosco! De 1 a 5, como correu?»' },
      { quem: 'cliente', texto: '5' },
      { quem: 'agente', texto: '«Que bom! Ajuda-nos com uma avaliação no Google? Leva 20 segundos.» + link' },
      { quem: 'sistema', texto: 'Se a nota fosse 1 a 3: alerta ao dono para responder pessoalmente antes de qualquer pedido público.' },
    ],
    fica: ['Pedidos de avaliação sem esforço', 'Reclamações tratadas em privado primeiro', 'Respostas às avaliações sugeridas por IA'],
    pecas: ['SMS, email ou WhatsApp', 'Perfil da Empresa no Google', 'Agente de IA para respostas'],
    segmentos: ['negocio_local'],
  },
  {
    slug: 'linktree-para-app',
    data: '2026-11-22',
    titulo: 'Do Linktree a uma página com app que vende',
    para: 'Quem hoje só tem Beacons ou Linktree',
    dor: 'Tenho seguidores mas a página de links não explica o que faço nem deixa marcar nada.',
    promessa: 'Página no teu domínio, com marcações, horários e pagamentos, e uma app para os teus clientes.',
    roteiro: [
      { quem: 'cliente', texto: 'Abre o link da bio no Instagram.' },
      { quem: 'sistema', texto: 'Página com a tua marca: o que fazes, horários, preços e botão «Marcar».' },
      { quem: 'cliente', texto: 'Escolhe o serviço e marca para sábado.' },
      { quem: 'agente', texto: 'Confirmação imediata + convite para instalar a app e ver as próximas marcações.' },
      { quem: 'dono', texto: 'Vês tudo no painel: visitas, marcações e clientes novos.' },
    ],
    fica: ['Domínio próprio e marca tua', 'Marcações e contactos num só sítio', 'App para os clientes voltarem'],
    pecas: ['Página rápida para telemóvel', 'App instalável (PWA)', 'Agenda e base de dados próprias'],
    segmentos: ['negocio_local', 'parceria_redes'],
  },
  {
    slug: 'faturas-por-email',
    data: '2026-11-23',
    titulo: 'Faturas de fornecedores arrumadas sozinhas',
    para: 'Pequenas empresas e o seu contabilista',
    dor: 'No fim do mês ando à procura de faturas perdidas no email para mandar ao contabilista.',
    promessa: 'Cada fatura que chega ao email é lida, arrumada por fornecedor e enviada ao contabilista.',
    roteiro: [
      { quem: 'sistema', texto: 'Email novo de «Fornecedor de Embalagens» com PDF anexo.' },
      { quem: 'agente', texto: 'Fatura lida: fornecedor, data, valor e NIF. Guardada na pasta de Novembro.' },
      { quem: 'agente', texto: 'Falta a fatura da electricidade deste mês. Pedido enviado ao fornecedor.' },
      { quem: 'sistema', texto: 'Dia 1: pasta do mês enviada ao contabilista com a lista resumida.' },
      { quem: 'dono', texto: 'Zero procura no email.' },
    ],
    fica: ['Faturas arrumadas por mês e fornecedor', 'Avisos de faturas em falta', 'Envio mensal ao contabilista'],
    pecas: ['Gmail ou Outlook', 'Leitura de PDFs por IA', 'Google Drive'],
    segmentos: ['negocio_local'],
  },
  {
    slug: 'mentor-ia-comunidade',
    data: '2026-11-24',
    titulo: 'Mentor IA com a estratégia da tua comunidade de trading',
    para: 'Educadores de trading, canais de sinais, comunidades',
    dor: 'Os alunos fazem as mesmas perguntas todos os dias e eu não consigo responder a todos.',
    promessa: 'Um mentor IA treinado no teu método responde aos alunos 24 h, com as tuas regras de risco.',
    roteiro: [
      { quem: 'cliente', texto: 'O sinal de ouro de hoje ainda está válido? Entrei atrasado.' },
      { quem: 'agente', texto: 'Segundo as regras da comunidade, se o preço já passou a entrada em mais de metade do caminho até ao TP1, não se entra. Espera pelo próximo.' },
      { quem: 'cliente', texto: 'E quanto devo arriscar?' },
      { quem: 'agente', texto: 'A regra do método é 1% da conta por operação. Conteúdo educativo, não é aconselhamento financeiro.' },
      { quem: 'sistema', texto: 'Perguntas frequentes da semana enviadas ao educador para a próxima aula.' },
    ],
    fica: ['Alunos com resposta imediata', 'Sempre as tuas regras e o teu tom', 'Resumo semanal das dúvidas'],
    pecas: ['Telegram, app ou site', 'IA com a base de conhecimento do teu método', 'Painel do educador'],
    segmentos: ['licenca_scanners', 'parceria_redes'],
  },
  {
    slug: 'checkin-alojamento-local',
    data: '2026-11-25',
    titulo: 'Check-in do alojamento local sem telefonemas',
    para: 'Alojamento local, guest houses, turismo rural',
    dor: 'Passo o dia a responder à mesma pergunta: a que horas posso entrar e como chego aí?',
    promessa: 'O hóspede recebe tudo antes de chegar e tu só sabes dele quando já está instalado.',
    roteiro: [
      { quem: 'sistema', texto: 'Reserva confirmada · Anne, 2 noites, chega sexta.' },
      { quem: 'agente', texto: 'Olá Anne! Na véspera envio-te o código da porta, a morada no mapa e onde estacionar.' },
      { quem: 'cliente', texto: 'Posso deixar as malas antes da hora de entrada?' },
      { quem: 'agente', texto: 'Podes. Há um cacifo à entrada; o código segue com as instruções.' },
      { quem: 'sistema', texto: 'Dados de registo do hóspede recolhidos e prontos para comunicar.' },
      { quem: 'dono', texto: 'Recebi o aviso de entrada. Nem precisei de pegar no telefone.' },
    ],
    fica: ['Instruções de chegada enviadas sozinhas', 'Respostas às perguntas de sempre, em várias línguas', 'Dados dos hóspedes recolhidos antes da chegada'],
    pecas: ['WhatsApp e email', 'Agente de IA com as regras da casa', 'Formulário de registo de hóspedes'],
    segmentos: ['negocio_local'],
  },
]

/** YYYY-MM-DD em Lisboa. */
export function hojeLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** As já publicadas, da mais recente para a mais antiga. */
export function demosPublicadas(hoje: string = hojeLisboa(), lista: DemoDiaria[] = DEMOS_DIARIAS): DemoDiaria[] {
  return lista.filter((d) => d.data <= hoje).sort((a, b) => (a.data < b.data ? 1 : -1))
}

/** A demo do dia (a mais recente publicada), opcionalmente a mais recente que sirva um segmento. */
export function demoDoDia(hoje: string = hojeLisboa(), segmento?: Segmento, lista: DemoDiaria[] = DEMOS_DIARIAS): DemoDiaria | null {
  const pub = demosPublicadas(hoje, lista)
  return (segmento ? pub.find((d) => d.segmentos.includes(segmento)) : pub[0]) ?? null
}

/** Uma demo publicada pelo slug (as futuras não se vêem antes do dia). */
export function demoPorSlug(slug: string, hoje: string = hojeLisboa()): DemoDiaria | null {
  return demosPublicadas(hoje).find((d) => d.slug === slug) ?? null
}

/** Quantos dias de fila há à frente de hoje (a rotina mantém ≥ 7). */
export function diasEmFila(hoje: string = hojeLisboa(), lista: DemoDiaria[] = DEMOS_DIARIAS): number {
  return lista.filter((d) => d.data > hoje).length
}
