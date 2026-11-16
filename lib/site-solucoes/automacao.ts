/**
 * O que automatizamos, os casos-tipo e o simulador de horas recuperáveis do /solucoes.
 *
 * Pedido do Ricardo (16/11/2026): o site não pode falar só da MTM. Tem de mostrar, para quem ainda
 * trabalha sem IA, as dores do dia-a-dia e o que implementamos para cada uma, com casos por sector e
 * uma simulação ao estilo da calculadora de trabalho recuperável que a NILG.ai fez para nós.
 *
 * REGRAS:
 * - Os casos-tipo são SIMULAÇÕES com pressupostos médios, não clientes. A página tem de o dizer.
 * - As horas por semana e a parte automatizável são estimativas nossas, editáveis no simulador.
 *   Nada aqui é um resultado medido de um cliente.
 * - Puro (sem React, sem rede) para se poder verificar numa guarda (automacao.check.ts).
 */

export type AreaId = 'atendimento' | 'agenda' | 'vendas' | 'financas' | 'dados' | 'marketing' | 'operacoes' | 'equipa' | 'conhecimento'

export interface Area {
  id: AreaId
  titulo: string
  /** A dor, dita como quem a vive. */
  dor: string
  /** O que implementamos. */
  implementamos: string
  /** Exemplos concretos de automações. */
  exemplos: string[]
  /** Onde a MTM entra: a oferta que resolve. */
  oferta: string
}

export const AREAS: Area[] = [
  {
    id: 'atendimento',
    titulo: 'Atendimento',
    dor: 'Respondes às mesmas perguntas no WhatsApp, no Instagram e por email, muitas vezes à noite.',
    implementamos: 'Um agente de IA treinado no teu negócio que responde 24 horas e passa-te só o que precisa de ti.',
    exemplos: ['Respostas a preços, horários e disponibilidade', 'Triagem do email com rascunho pronto', 'Balão de apoio no site'],
    oferta: 'Agente de IA',
  },
  {
    id: 'agenda',
    titulo: 'Marcações',
    dor: 'Marcas à mão, trocas mensagens para acertar horas e perdes dinheiro com faltas.',
    implementamos: 'Agenda própria ligada ao teu calendário, com lembretes automáticos e reagendamento pelo cliente.',
    exemplos: ['Marcação online sem subscrição', 'Lembretes 24 h e 2 h antes', 'Lista de espera que preenche desistências'],
    oferta: 'Página + app',
  },
  {
    id: 'vendas',
    titulo: 'Vendas e propostas',
    dor: 'Os contactos chegam e ficam esquecidos. Cada orçamento é feito do zero.',
    implementamos: 'Qualificação automática dos contactos, seguimento por mensagem e propostas geradas a partir de modelos.',
    exemplos: ['Seguimento de contactos sem resposta', 'Orçamento em PDF a partir de um formulário', 'CRM simples com o estado de cada cliente'],
    oferta: 'Agente de IA',
  },
  {
    id: 'financas',
    titulo: 'Faturas e cobranças',
    dor: 'Andas atrás de pagamentos e juntas papéis para o contabilista no fim do mês.',
    implementamos: 'Lembretes de pagamento, recolha de faturas do email e uma pasta mensal pronta para a contabilidade.',
    exemplos: ['Avisos de pagamento em atraso', 'Faturas do email arrumadas por mês', 'Resumo mensal de entradas e saídas'],
    oferta: 'Automação à medida',
  },
  {
    id: 'dados',
    titulo: 'Papelada e relatórios',
    dor: 'Copias dados de um sítio para outro e montas o mesmo relatório todas as semanas.',
    implementamos: 'Formulários que alimentam a base de dados sozinhos e relatórios que chegam prontos ao teu email.',
    exemplos: ['Fim das folhas de Excel copiadas à mão', 'Leitura de documentos e faturas com IA', 'Painel com os números da semana'],
    oferta: 'Automação à medida',
  },
  {
    id: 'marketing',
    titulo: 'Redes e reputação',
    dor: 'Sabes que devias publicar e pedir avaliações, mas nunca há tempo.',
    implementamos: 'Calendário de publicações com IA, respostas a comentários e pedido de avaliação depois de cada serviço.',
    exemplos: ['Publicações agendadas a partir de um pedido', 'Resposta a comentários com palavra-chave', 'Pedido de avaliação no Google'],
    oferta: 'Agente de IA',
  },
  {
    id: 'operacoes',
    titulo: 'Encomendas e operação',
    dor: 'Stock, encomendas e relatórios de serviço vivem em cadernos, fotos e mensagens soltas.',
    implementamos: 'Uma app para a equipa registar o trabalho e alertas quando algo falta ou atrasa.',
    exemplos: ['Encomendas a fornecedores com aviso de stock baixo', 'Relatório de serviço com fotos, no telemóvel', 'Estado de cada trabalho num só sítio'],
    oferta: 'Página + app',
  },
  {
    id: 'equipa',
    titulo: 'Equipa',
    dor: 'Escalas, férias e formação de quem entra tiram-te horas todos os meses.',
    implementamos: 'Escalas e pedidos na app e um assistente que ensina os procedimentos da casa a quem chega.',
    exemplos: ['Escalas e trocas aprovadas na app', 'Manual da casa com perguntas e respostas', 'Integração de novos colaboradores'],
    oferta: 'Página + app',
  },
  {
    id: 'conhecimento',
    titulo: 'Formação e conteúdos',
    dor: 'Explicas a mesma coisa a cada cliente ou aluno, ou gravar aulas come-te semanas.',
    implementamos: 'Cursos narrados com voz, legendas noutras línguas e um mentor de IA que responde sobre o teu método.',
    exemplos: ['Aulas narradas a partir de um guião', 'Mentor de IA com o teu conteúdo', 'Área de membros na app'],
    oferta: 'Cursos narrados',
  },
]

export interface Tarefa {
  id: string
  nome: string
  area: AreaId
  /** Parte que a automação tira das tuas mãos (0 a 1). Estimativa nossa, conservadora. */
  automatizavel: number
}

export const TAREFAS: Record<string, Tarefa> = {
  mensagens: { id: 'mensagens', nome: 'Responder a mensagens repetidas (WhatsApp, Instagram, telefone)', area: 'atendimento', automatizavel: 0.6 },
  email: { id: 'email', nome: 'Ler e responder a emails', area: 'atendimento', automatizavel: 0.4 },
  marcacoes: { id: 'marcacoes', nome: 'Marcar e reagendar', area: 'agenda', automatizavel: 0.7 },
  lembretes: { id: 'lembretes', nome: 'Lembrar clientes e tratar faltas', area: 'agenda', automatizavel: 0.8 },
  orcamentos: { id: 'orcamentos', nome: 'Fazer orçamentos e propostas', area: 'vendas', automatizavel: 0.5 },
  seguimento: { id: 'seguimento', nome: 'Seguir contactos que não responderam', area: 'vendas', automatizavel: 0.6 },
  faturas: { id: 'faturas', nome: 'Faturar e cobrar pagamentos', area: 'financas', automatizavel: 0.5 },
  contabilidade: { id: 'contabilidade', nome: 'Juntar documentos para a contabilidade', area: 'financas', automatizavel: 0.6 },
  dados: { id: 'dados', nome: 'Copiar dados entre folhas e sistemas', area: 'dados', automatizavel: 0.7 },
  relatorios: { id: 'relatorios', nome: 'Montar relatórios', area: 'dados', automatizavel: 0.7 },
  redes: { id: 'redes', nome: 'Publicar e responder nas redes', area: 'marketing', automatizavel: 0.5 },
  avaliacoes: { id: 'avaliacoes', nome: 'Pedir e responder a avaliações', area: 'marketing', automatizavel: 0.8 },
  encomendas: { id: 'encomendas', nome: 'Encomendas e stock', area: 'operacoes', automatizavel: 0.4 },
  servico: { id: 'servico', nome: 'Relatórios de serviço e registo de trabalho', area: 'operacoes', automatizavel: 0.4 },
  escalas: { id: 'escalas', nome: 'Escalas e horários da equipa', area: 'equipa', automatizavel: 0.5 },
  explicar: { id: 'explicar', nome: 'Explicar o mesmo a cada cliente ou aluno', area: 'conhecimento', automatizavel: 0.6 },
  inscricoes: { id: 'inscricoes', nome: 'Inscrições, quotas e renovações', area: 'financas', automatizavel: 0.6 },
}

export interface Sector {
  id: string
  nome: string
  /** O retrato do dia-a-dia sem IA. */
  retrato: string
  /** Horas por semana em cada tarefa, num negócio pequeno típico (2 a 5 pessoas). Estimativa. */
  horas: Partial<Record<keyof typeof TAREFAS, number>>
  /** O que entregávamos primeiro. */
  plano: string[]
  /** Texto de exemplo para o ecrã do simulador. */
  ecra: { cliente: string; pergunta: string; resposta: string; servico: string }
}

export const SECTORES: Sector[] = [
  {
    id: 'ginasio',
    nome: 'Ginásio ou estúdio',
    retrato: 'Aulas cheias num dia e vazias no outro, quotas em atraso e o telemóvel sempre a tocar com dúvidas de horários.',
    horas: { mensagens: 6, marcacoes: 4, lembretes: 2, inscricoes: 3, redes: 3, escalas: 2 },
    plano: ['App do sócio com horários e reservas de aulas', 'Agente que responde a preços e horários', 'Avisos de quota e renovação automáticos'],
    ecra: { cliente: 'Marta', pergunta: 'Olá! Ainda há vaga no treino das 19h?', resposta: 'Há 3 lugares no treino das 19h. Queres que te reserve um? Confirmas aqui na app.', servico: 'Treino de grupo' },
  },
  {
    id: 'clinica',
    nome: 'Clínica ou estética',
    retrato: 'A receção passa o dia ao telefone a marcar, confirmar e remarcar, e cada falta é uma hora perdida.',
    horas: { mensagens: 5, marcacoes: 6, lembretes: 3, faturas: 2, avaliacoes: 1, email: 2 },
    plano: ['Marcação online com confirmação e lembretes', 'Lista de espera para preencher desistências', 'Pedido de avaliação depois da consulta'],
    ecra: { cliente: 'Rui', pergunta: 'Boa tarde, queria marcar uma limpeza de pele.', resposta: 'Claro! Tenho quinta às 10h ou sexta às 16h. Qual preferes? Envio-te lembrete na véspera.', servico: 'Limpeza de pele' },
  },
  {
    id: 'restaurante',
    nome: 'Restaurante ou café',
    retrato: 'Reservas por mensagem, fornecedores por telefone e as redes sempre para amanhã.',
    horas: { mensagens: 4, marcacoes: 3, encomendas: 3, redes: 3, avaliacoes: 1, escalas: 2 },
    plano: ['Reservas online com lembrete', 'Encomendas a fornecedores com aviso de stock', 'Publicações semanais preparadas com IA'],
    ecra: { cliente: 'Sofia', pergunta: 'Têm mesa para 4 no sábado ao jantar?', resposta: 'Temos às 20h30. Fica reservada em nome de Sofia, com lembrete no próprio dia.', servico: 'Mesa para 4' },
  },
  {
    id: 'imobiliaria',
    nome: 'Imobiliária',
    retrato: 'Contactos de portais a chegar a toda a hora, visitas a combinar e propostas feitas à mão.',
    horas: { mensagens: 6, seguimento: 5, marcacoes: 3, orcamentos: 3, dados: 3, redes: 2 },
    plano: ['Qualificação automática de cada contacto', 'Marcação de visitas com lembrete', 'Seguimento de quem não respondeu'],
    ecra: { cliente: 'Tiago', pergunta: 'Vi o T2 no portal. Ainda está disponível?', resposta: 'Está! Para te mostrar as opções certas: compra ou arrendamento, e até que valor? Posso marcar a visita já.', servico: 'Visita T2' },
  },
  {
    id: 'servicos',
    nome: 'Contabilidade ou escritório de serviços',
    retrato: 'Clientes a mandar documentos por email, WhatsApp e papel, e prazos que dependem de os ir buscar.',
    horas: { email: 6, contabilidade: 6, dados: 5, relatorios: 3, mensagens: 3 },
    plano: ['Recolha de documentos com lembretes por cliente', 'Leitura de faturas com IA', 'Relatório mensal enviado sozinho'],
    ecra: { cliente: 'Ana', pergunta: 'Onde vos envio as faturas deste mês?', resposta: 'Podes tirar foto aqui mesmo. Eu leio, arrumo na pasta de novembro e aviso a equipa.', servico: 'Entrega de documentos' },
  },
  {
    id: 'tecnico',
    nome: 'Instalações, obras ou oficina',
    retrato: 'Orçamentos ao fim do dia, relatórios de serviço em fotos soltas e faturas que saem tarde.',
    horas: { orcamentos: 5, servico: 4, marcacoes: 3, faturas: 3, mensagens: 3, seguimento: 2 },
    plano: ['Orçamento em PDF a partir de um formulário', 'Relatório de serviço com fotos na app', 'Faturação e lembrete de pagamento'],
    ecra: { cliente: 'Paulo', pergunta: 'Quanto custa instalar um ar condicionado na sala?', resposta: 'Depende da área. Diz-me os metros e envia uma foto da parede: o orçamento chega-te em PDF.', servico: 'Visita técnica' },
  },
  {
    id: 'loja',
    nome: 'Loja ou venda online',
    retrato: 'Perguntas sobre envios e trocas, stock em folhas e clientes que compram uma vez e não voltam.',
    horas: { mensagens: 6, encomendas: 4, dados: 3, redes: 3, seguimento: 2, avaliacoes: 1 },
    plano: ['Agente que responde a envios, trocas e tamanhos', 'Aviso de stock baixo', 'Campanha automática para clientes que não voltaram'],
    ecra: { cliente: 'Inês', pergunta: 'A encomenda chega até sexta?', resposta: 'Saiu hoje do armazém e chega quinta. Aqui tens o link para acompanhar.', servico: 'Recolha em loja' },
  },
  {
    id: 'clube',
    nome: 'Clube ou associação',
    retrato: 'Quotas cobradas à porta, avisos espalhados por grupos e voluntários sem tempo.',
    horas: { inscricoes: 4, mensagens: 4, redes: 2, escalas: 2, relatorios: 2 },
    plano: ['App do sócio com quotas e avisos', 'Inscrições em eventos e atividades', 'Escalas de voluntários na app'],
    ecra: { cliente: 'João', pergunta: 'Como pago a quota deste mês?', resposta: 'Na app do sócio, separador Quotas: pagas em dois toques e recebes o recibo.', servico: 'Treino de captação' },
  },
  {
    id: 'educador',
    nome: 'Educador, coach ou trader com comunidade',
    retrato: 'Respondes às mesmas dúvidas todos os dias e gravar aulas novas nunca acaba.',
    horas: { explicar: 6, mensagens: 5, inscricoes: 2, redes: 3, marcacoes: 2 },
    plano: ['Mentor de IA treinado no teu método', 'Cursos narrados com voz', 'Área de membros com pagamentos'],
    ecra: { cliente: 'Beatriz', pergunta: 'Não percebi a aula 3. Quando é que entro?', resposta: 'Na aula 3 o sinal só vale depois do fecho da vela. Revê o minuto 4:10 e testa no simulado antes de usar dinheiro.', servico: 'Sessão de dúvidas' },
  },
]

/** Pressupostos à vista na página e na guarda. */
export const PRESSUPOSTOS = {
  semanasPorAno: 46,
  horasPorPessoaAno: 1760,
  custoHoraOmissao: 12,
}

export interface LinhaSimulada {
  tarefa: Tarefa
  horasSemana: number
  recuperaveisSemana: number
}

export interface Simulacao {
  linhas: LinhaSimulada[]
  horasSemana: number
  recuperaveisSemana: number
  recuperaveisAno: number
  eurosAno: number
  pessoas: number
  /** Áreas por ordem de horas recuperáveis, com a oferta que as resolve. */
  prioridades: { area: Area; horasAno: number }[]
}

function limpo(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function simular(horas: Record<string, number>, custoHora: number = PRESSUPOSTOS.custoHoraOmissao): Simulacao {
  const linhas: LinhaSimulada[] = []
  for (const [id, h] of Object.entries(horas)) {
    const tarefa = TAREFAS[id]
    const hs = limpo(h)
    if (!tarefa || hs === 0) continue
    linhas.push({ tarefa, horasSemana: hs, recuperaveisSemana: hs * tarefa.automatizavel })
  }
  const horasSemana = linhas.reduce((s, l) => s + l.horasSemana, 0)
  const recuperaveisSemana = linhas.reduce((s, l) => s + l.recuperaveisSemana, 0)
  const recuperaveisAno = recuperaveisSemana * PRESSUPOSTOS.semanasPorAno
  const porArea = new Map<AreaId, number>()
  for (const l of linhas) porArea.set(l.tarefa.area, (porArea.get(l.tarefa.area) ?? 0) + l.recuperaveisSemana * PRESSUPOSTOS.semanasPorAno)
  const prioridades = [...porArea.entries()]
    .map(([id, horasAno]) => ({ area: AREAS.find((a) => a.id === id)!, horasAno }))
    .sort((a, b) => b.horasAno - a.horasAno)
  return {
    linhas,
    horasSemana,
    recuperaveisSemana,
    recuperaveisAno,
    eurosAno: recuperaveisAno * limpo(custoHora),
    pessoas: recuperaveisAno / PRESSUPOSTOS.horasPorPessoaAno,
    prioridades,
  }
}

/** O caso real: o que a própria MTM já automatizou (factos, sem números). */
export const CASO_MTM = {
  titulo: 'MoreThanMoney',
  setor: 'Educação financeira e comunidade',
  antes: 'Comentários, mensagens e marcações respondidos à mão, em quatro canais diferentes.',
  feito: [
    'Comentários com palavra-chave no Instagram passam a conversa privada sozinhos',
    'WhatsApp e Telegram com respostas automáticas e funil de entrada',
    'Agenda própria em vez de Calendly, com lembretes',
    'Resultados da semana em imagem, enviados e publicados sozinhos',
    'Prospeção por email com saída automática',
    'Balão de apoio com IA no site',
  ],
}
