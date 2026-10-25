/**
 * O CATÁLOGO DO ESTÚDIO — os 18 geradores e os 11 optimizadores do OpenAdKit (MIT, Dicecodes),
 * reescritos como DADOS em vez de 29 páginas.
 *
 * No OpenAdKit cada ferramenta é uma página com o seu formulário e o seu prompt. Aqui cada uma é
 * uma entrada desta lista: os campos que pede, o que escreve e os limites de caracteres de cada
 * plataforma. Um só ecrã (Marketing → Estúdio) e uma só rota (`/api/admin/marketing/gerar`) servem
 * todas — juntar uma ferramenta é juntar uma entrada, sem página nova nem rota nova.
 *
 * O que não veio do OpenAdKit: a chave de IA de cada utilizador (aqui é a cadeia da casa,
 * `lib/ia/chamar`, grátis primeiro), o armazenamento no browser (aqui fica tudo no servidor) e
 * os números de desempenho de exemplo (a casa não inventa números — ver lib/marketing/regras).
 */

export type GrupoEstudio = 'Meta' | 'Google' | 'TikTok' | 'Outras redes' | 'Campanha' | 'Optimizar'

export interface CampoEntrada {
  id: string
  rotulo: string
  tipo?: 'texto' | 'area' | 'escolha'
  opcoes?: string[]
  exemplo?: string
  obrigatorio?: boolean
}

export interface CampoSaida {
  rotulo: string
  /** Limite de caracteres da plataforma. O ecrã pinta de vermelho o que passar. */
  limite?: number
  /** Várias linhas (lista) — cada linha conta o limite à parte. */
  lista?: boolean
}

export interface Gerador {
  id: string
  nome: string
  grupo: GrupoEstudio
  descricao: string
  entradas: CampoEntrada[]
  saida: CampoSaida[]
  variacoes: number
  /** O que se pede à IA, para além das regras da casa e da marca. */
  pede: string
}

const PRODUTO: CampoEntrada = { id: 'produto', rotulo: 'O que anuncias', exemplo: 'Bootcamp de trading · Scanner GoldKiller · Mentoria Premium', obrigatorio: true }
const PUBLICO: CampoEntrada = { id: 'publico', rotulo: 'Público (opcional)', exemplo: 'Pais 30-45 sem tempo, já perderam dinheiro sozinhos' }
const ANGULO: CampoEntrada = { id: 'angulo', rotulo: 'Ângulo (opcional)', exemplo: 'tempo · liberdade · método · medo de perder' }
const OBJECTIVO: CampoEntrada = { id: 'objectivo', rotulo: 'Objectivo', tipo: 'escolha', opcoes: ['Leads', 'Mensagens / comentários', 'Marcações', 'Vendas', 'Alcance'] }
const TEXTO_ACTUAL: CampoEntrada = { id: 'actual', rotulo: 'O anúncio / texto actual', tipo: 'area', obrigatorio: true }
const PLATAFORMA: CampoEntrada = { id: 'plataforma', rotulo: 'Plataforma', tipo: 'escolha', opcoes: ['Meta Feed', 'Meta Reels/Stories', 'Google Search', 'TikTok', 'YouTube', 'LinkedIn'] }
const DADOS: CampoEntrada = { id: 'dados', rotulo: 'Números reais (opcional: gasto, impressões, cliques, leads, frequência…)', tipo: 'area' }

export const GERADORES: readonly Gerador[] = [
  // ── Meta ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'meta', nome: 'Anúncio Meta · Feed/Reels', grupo: 'Meta', variacoes: 3,
    descricao: 'Gancho, texto principal, título, descrição e CTA com a palavra-chave do funil.',
    entradas: [PRODUTO, PUBLICO, OBJECTIVO, ANGULO],
    saida: [{ rotulo: 'Gancho', limite: 90 }, { rotulo: 'Texto principal', limite: 600 }, { rotulo: 'Título', limite: 40 }, { rotulo: 'Descrição', limite: 30 }, { rotulo: 'CTA' }, { rotulo: 'Palavra-chave' }],
    pede: 'Três anúncios Meta com ângulos diferentes. "Palavra-chave" é uma das palavras do funil.',
  },
  {
    id: 'reels', nome: 'Ideias de Reels', grupo: 'Meta', variacoes: 5,
    descricao: 'Ganchos dos primeiros 3 segundos, guião curto, texto no ecrã e legenda.',
    entradas: [PRODUTO, PUBLICO, ANGULO],
    saida: [{ rotulo: 'Gancho (0-3 s)', limite: 80 }, { rotulo: 'Guião', limite: 700 }, { rotulo: 'Texto no ecrã', lista: true, limite: 40 }, { rotulo: 'Legenda', limite: 400 }, { rotulo: 'Palavra-chave' }],
    pede: 'Cinco Reels de 20-40 s, narrador com emoção, sem jargão, com animação/gráfico sugerido no guião em vez de imagem estática.',
  },
  {
    id: 'lead-form', nome: 'Formulário instantâneo', grupo: 'Meta', variacoes: 2,
    descricao: 'Título, introdução, perguntas de qualificação e ecrã de obrigado de um formulário de leads.',
    entradas: [PRODUTO, PUBLICO],
    saida: [{ rotulo: 'Título', limite: 60 }, { rotulo: 'Introdução', limite: 300 }, { rotulo: 'Perguntas', lista: true, limite: 80 }, { rotulo: 'Ecrã de obrigado', limite: 200 }, { rotulo: 'Política de privacidade (nota)' }],
    pede: 'Perguntas que qualificam (tempo disponível, experiência, objectivo) sem afastar. O obrigado leva a morethanmoney.pt/agendar.',
  },
  {
    id: 'hashtags', nome: 'Hashtags', grupo: 'Meta', variacoes: 1,
    descricao: 'Conjuntos de hashtags por alcance (grandes, médias, nicho) para Instagram.',
    entradas: [PRODUTO, { id: 'tema', rotulo: 'Tema do post', obrigatorio: true }],
    saida: [{ rotulo: 'Grandes', lista: true }, { rotulo: 'Médias', lista: true }, { rotulo: 'Nicho PT/BR', lista: true }, { rotulo: 'De marca', lista: true }],
    pede: 'Hashtags reais e em uso em português (PT e BR), sem hashtags proibidas ou de spam.',
  },
  {
    id: 'calendario', nome: 'Calendário de conteúdo', grupo: 'Meta', variacoes: 1,
    descricao: 'Um mês de posts (Ter/Qui/Sáb) com tema, formato e CTA de funil.',
    entradas: [PRODUTO, { id: 'mes', rotulo: 'Mês', exemplo: 'Novembro' }, { id: 'foco', rotulo: 'Foco do mês', exemplo: 'lançamento do TrendShot' }],
    saida: [{ rotulo: 'Semana 1', lista: true }, { rotulo: 'Semana 2', lista: true }, { rotulo: 'Semana 3', lista: true }, { rotulo: 'Semana 4', lista: true }],
    pede: 'Cada linha: "Dia · formato (Reel/Carrossel/Story) · tema · palavra-chave do CTA". Fases do funil: descoberta → consideração → decisão.',
  },
  {
    id: 'prompts-criativos', nome: 'Prompts de imagem e vídeo', grupo: 'Meta', variacoes: 3,
    descricao: 'Prompts para gerar imagens/vídeos (Higgsfield, Canva, Midjourney) no visual da casa.',
    entradas: [PRODUTO, { id: 'formato', rotulo: 'Formato', tipo: 'escolha', opcoes: ['Feed 1:1', 'Story/Reel 9:16', 'Banner 16:9'] }, ANGULO],
    saida: [{ rotulo: 'Prompt', limite: 600 }, { rotulo: 'Texto sobreposto', limite: 50 }, { rotulo: 'Movimento (vídeo)', limite: 200 }],
    pede: 'Paleta ouro #D2A63C sobre carvão quase preto. Gráficos animados, nada de fotos de dinheiro, carros ou luxo.',
  },
  // ── Google ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'google-rsa', nome: 'Google Search · RSA', grupo: 'Google', variacoes: 1,
    descricao: '15 títulos e 4 descrições para um anúncio responsivo de pesquisa.',
    entradas: [PRODUTO, { id: 'palavras', rotulo: 'Palavras-chave', exemplo: 'curso trading portugal, aprender forex' }, PUBLICO],
    saida: [{ rotulo: 'Títulos', lista: true, limite: 30 }, { rotulo: 'Descrições', lista: true, limite: 90 }, { rotulo: 'Caminhos', lista: true, limite: 15 }],
    pede: 'Exactamente 15 títulos (≤30) e 4 descrições (≤90). Variar benefícios, objecções e CTA.',
  },
  {
    id: 'google-pmax', nome: 'Performance Max', grupo: 'Google', variacoes: 1,
    descricao: 'Grupo de recursos: títulos curtos e longos, descrições e sinais de público.',
    entradas: [PRODUTO, PUBLICO],
    saida: [{ rotulo: 'Títulos', lista: true, limite: 30 }, { rotulo: 'Títulos longos', lista: true, limite: 90 }, { rotulo: 'Descrições', lista: true, limite: 90 }, { rotulo: 'Sinais de público', lista: true }],
    pede: '5 títulos, 5 títulos longos, 5 descrições e 5 sinais de público (interesses e pesquisas).',
  },
  {
    id: 'display', nome: 'Banners Display', grupo: 'Google', variacoes: 3,
    descricao: 'Texto para banners: título, subtítulo e botão.',
    entradas: [PRODUTO, ANGULO],
    saida: [{ rotulo: 'Título', limite: 30 }, { rotulo: 'Subtítulo', limite: 60 }, { rotulo: 'Botão', limite: 15 }, { rotulo: 'Ideia visual', limite: 200 }],
    pede: 'Banners legíveis em 300×250: poucas palavras, uma ideia por banner.',
  },
  {
    id: 'youtube', nome: 'YouTube · in-stream', grupo: 'Google', variacoes: 2,
    descricao: 'Guião de 15-30 s com gancho antes do «saltar anúncio».',
    entradas: [PRODUTO, PUBLICO, ANGULO],
    saida: [{ rotulo: 'Gancho (0-5 s)', limite: 120 }, { rotulo: 'Guião', limite: 900 }, { rotulo: 'Título do CTA', limite: 15 }, { rotulo: 'Título do vídeo', limite: 100 }],
    pede: 'O gancho tem de prender antes dos 5 s. Narrador com emoção, sem jargão.',
  },
  {
    id: 'email-assuntos', nome: 'Assuntos de email', grupo: 'Campanha', variacoes: 1,
    descricao: 'Assuntos e pré-cabeçalhos para uma campanha de email.',
    entradas: [PRODUTO, { id: 'objectivo', rotulo: 'Objectivo do email', exemplo: 'reactivar quem não abre há 30 dias' }],
    saida: [{ rotulo: 'Assuntos', lista: true, limite: 50 }, { rotulo: 'Pré-cabeçalhos', lista: true, limite: 90 }],
    pede: '10 assuntos e 10 pré-cabeçalhos. Sem MAIÚSCULAS a gritar nem palavras de spam.',
  },
  // ── TikTok ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'tiktok', nome: 'Anúncio TikTok', grupo: 'TikTok', variacoes: 3,
    descricao: 'Texto do anúncio, gancho falado e guião nativo (parece conteúdo, não anúncio).',
    entradas: [PRODUTO, PUBLICO, ANGULO],
    saida: [{ rotulo: 'Texto do anúncio', limite: 100 }, { rotulo: 'Gancho falado', limite: 80 }, { rotulo: 'Guião', limite: 700 }, { rotulo: 'CTA', limite: 20 }],
    pede: 'Linguagem nativa de TikTok, primeira pessoa, 15-30 s.',
  },
  {
    id: 'spark-ads', nome: 'Spark Ads', grupo: 'TikTok', variacoes: 3,
    descricao: 'Ideias de posts orgânicos para impulsionar como Spark Ads.',
    entradas: [PRODUTO, ANGULO],
    saida: [{ rotulo: 'Conceito', limite: 200 }, { rotulo: 'Guião', limite: 600 }, { rotulo: 'Legenda', limite: 150 }],
    pede: 'Conteúdo que funciona orgânico primeiro (história, bastidores, erro comum) e depois se impulsiona.',
  },
  {
    id: 'desafio-hashtag', nome: 'Desafio de hashtag de marca', grupo: 'TikTok', variacoes: 2,
    descricao: 'Um desafio para a comunidade participar, com regras e hashtag.',
    entradas: [PRODUTO, { id: 'tema', rotulo: 'Tema', exemplo: '15 minutos por dia' }],
    saida: [{ rotulo: 'Nome e hashtag', limite: 60 }, { rotulo: 'Mecânica', limite: 500 }, { rotulo: 'Vídeo de arranque', limite: 500 }],
    pede: 'Um desafio simples, educativo, que não peça a ninguém para mostrar dinheiro ou contas.',
  },
  // ── Outras redes ──────────────────────────────────────────────────────────────────────────
  {
    id: 'linkedin', nome: 'Anúncio LinkedIn', grupo: 'Outras redes', variacoes: 3,
    descricao: 'Texto de introdução, título e CTA para LinkedIn (tom mais profissional).',
    entradas: [PRODUTO, PUBLICO],
    saida: [{ rotulo: 'Introdução', limite: 600 }, { rotulo: 'Título', limite: 70 }, { rotulo: 'CTA', limite: 20 }],
    pede: 'Tom profissional, ainda em "tu". Ângulo: gestão do tempo e literacia financeira.',
  },
  {
    id: 'x', nome: 'Post / anúncio no X', grupo: 'Outras redes', variacoes: 5,
    descricao: 'Posts curtos com gancho para o X (Twitter).',
    entradas: [PRODUTO, ANGULO],
    saida: [{ rotulo: 'Post', limite: 280 }],
    pede: 'Cinco posts com ganchos diferentes.',
  },
  {
    id: 'telegram-whatsapp', nome: 'Mensagem Telegram / WhatsApp', grupo: 'Outras redes', variacoes: 3,
    descricao: 'Mensagem para o grupo de leads ou para uma lista, com botão.',
    entradas: [PRODUTO, { id: 'canal', rotulo: 'Canal', tipo: 'escolha', opcoes: ['Grupo de leads Telegram', 'Canal Telegram', 'WhatsApp (resposta em 24 h)'] }, ANGULO],
    saida: [{ rotulo: 'Mensagem', limite: 700 }, { rotulo: 'Texto do botão', limite: 25 }],
    pede: 'Curta, conversacional, um só CTA. No WhatsApp, só para quem escreveu nas últimas 24 h.',
  },
  // ── Campanha ──────────────────────────────────────────────────────────────────────────────
  {
    id: 'kit-campanha', nome: 'Kit de campanha completo', grupo: 'Campanha', variacoes: 1,
    descricao: 'Do zero ao lançamento: estrutura, públicos, criativos e plano de 14 dias.',
    entradas: [PRODUTO, PUBLICO, OBJECTIVO, { id: 'orcamento', rotulo: 'Orçamento por dia (€)', exemplo: '20' }],
    saida: [{ rotulo: 'Estrutura', limite: 800 }, { rotulo: 'Públicos', lista: true }, { rotulo: 'Criativos a produzir', lista: true }, { rotulo: 'Plano de 14 dias', lista: true }, { rotulo: 'Métricas a vigiar', lista: true }],
    pede: 'Plano realista para orçamento pequeno. Métricas sem valores inventados: diz o que medir e quando decidir.',
  },
  // ── Optimizar ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'pontuar', nome: 'Pontuar criativo', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Nota de 0 a 100 antes de lançar, com o que está bem, o que falha e a versão melhorada.',
    entradas: [TEXTO_ACTUAL, PLATAFORMA],
    saida: [{ rotulo: 'Pontuação (0-100)' }, { rotulo: 'O que está bem', lista: true }, { rotulo: 'O que falha', lista: true }, { rotulo: 'Versão melhorada', limite: 700 }],
    pede: 'Avalia gancho, clareza, prova, CTA, conformidade com as regras da casa e encaixe na plataforma.',
  },
  {
    id: 'ctr', nome: 'Melhorar CTR', grupo: 'Optimizar', variacoes: 3,
    descricao: 'Reescreve um anúncio com cliques fracos, com o porquê de cada mudança.',
    entradas: [TEXTO_ACTUAL, PLATAFORMA, DADOS],
    saida: [{ rotulo: 'Diagnóstico', limite: 300 }, { rotulo: 'Nova versão', limite: 700 }, { rotulo: 'Porque deve clicar mais', limite: 300 }],
    pede: 'Três reescritas com hipóteses diferentes (gancho, oferta, CTA).',
  },
  {
    id: 'ab', nome: 'Plano de teste A/B', grupo: 'Optimizar', variacoes: 1,
    descricao: 'O que testar primeiro, as variantes, o tamanho mínimo e quando decidir.',
    entradas: [TEXTO_ACTUAL, PLATAFORMA, DADOS],
    saida: [{ rotulo: 'Hipótese', limite: 300 }, { rotulo: 'Variante A', limite: 500 }, { rotulo: 'Variante B', limite: 500 }, { rotulo: 'Regra de decisão', limite: 400 }],
    pede: 'Uma variável de cada vez. Regra de decisão com mínimo de impressões/cliques, sem prometer resultado.',
  },
  {
    id: 'fadiga', nome: 'Fadiga do anúncio', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Diz se o anúncio está gasto (frequência, CTR a cair) e o que trocar.',
    entradas: [TEXTO_ACTUAL, DADOS],
    saida: [{ rotulo: 'Estado', limite: 200 }, { rotulo: 'Sinais', lista: true }, { rotulo: 'O que fazer', lista: true }, { rotulo: 'Criativo de substituição', limite: 600 }],
    pede: 'Usa só os números dados. Sem números, diz quais faltam para decidir.',
  },
  {
    id: 'publico', nome: 'Públicos', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Públicos para testar: interesses, semelhantes e remarketing, por plataforma.',
    entradas: [PRODUTO, PLATAFORMA, PUBLICO],
    saida: [{ rotulo: 'Frio (interesses)', lista: true }, { rotulo: 'Semelhantes', lista: true }, { rotulo: 'Remarketing', lista: true }, { rotulo: 'Exclusões', lista: true }],
    pede: 'Portugal e Brasil. Remarketing a partir dos leads do CRM, visitantes do site e quem comentou no Instagram.',
  },
  {
    id: 'orcamento', nome: 'Orçamento e estratégia de licitação', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Como dividir o orçamento e que estratégia de licitação usar.',
    entradas: [PRODUTO, PLATAFORMA, { id: 'orcamento', rotulo: 'Orçamento mensal (€)', obrigatorio: true }, DADOS],
    saida: [{ rotulo: 'Divisão', lista: true }, { rotulo: 'Licitação', limite: 400 }, { rotulo: 'Quando escalar', limite: 400 }, { rotulo: 'Quando cortar', limite: 400 }],
    pede: 'Fase de aprendizagem, regra dos 20% ao escalar, mínimo de dados antes de cortar.',
  },
  {
    id: 'landing', nome: 'Página de destino', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Revê o texto de uma landing: promessa, prova, objecções, CTA.',
    entradas: [{ id: 'actual', rotulo: 'Texto da página (ou o URL e o que lá está)', tipo: 'area', obrigatorio: true }],
    saida: [{ rotulo: 'Acima da dobra', limite: 400 }, { rotulo: 'Problemas', lista: true }, { rotulo: 'Objecções a responder', lista: true }, { rotulo: 'CTA', limite: 60 }],
    pede: 'Foco no que faz alguém marcar uma chamada ou deixar o contacto.',
  },
  {
    id: 'palavras-chave', nome: 'Palavras-chave Google', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Lista de palavras-chave por intenção, com negativas.',
    entradas: [PRODUTO, { id: 'semente', rotulo: 'Palavras de partida', exemplo: 'curso de trading' }],
    saida: [{ rotulo: 'Intenção alta', lista: true }, { rotulo: 'Intenção média', lista: true }, { rotulo: 'Informativas', lista: true }, { rotulo: 'Negativas', lista: true }],
    pede: 'Português de Portugal e do Brasil. Negativas: grátis/pdf/emprego/pirâmide e afins.',
  },
  {
    id: 'qualidade', nome: 'Índice de qualidade', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Como subir o índice de qualidade de um anúncio Google.',
    entradas: [TEXTO_ACTUAL, { id: 'palavras', rotulo: 'Palavras-chave do grupo' }],
    saida: [{ rotulo: 'Relevância', limite: 300 }, { rotulo: 'CTR esperado', limite: 300 }, { rotulo: 'Página de destino', limite: 300 }, { rotulo: 'Versão melhorada', limite: 600 }],
    pede: 'Liga palavra-chave, anúncio e página.',
  },
  {
    id: 'concorrente', nome: 'Analisar concorrente', grupo: 'Optimizar', variacoes: 1,
    descricao: 'Cola o anúncio ou a página de um concorrente: ângulo, promessa, fraquezas e como responder.',
    entradas: [{ id: 'actual', rotulo: 'O que o concorrente diz', tipo: 'area', obrigatorio: true }, PRODUTO],
    saida: [{ rotulo: 'Ângulo', limite: 300 }, { rotulo: 'Promessas (e riscos legais)', lista: true }, { rotulo: 'Fraquezas', lista: true }, { rotulo: 'Como nos diferenciamos', lista: true }],
    pede: 'Sem copiar o concorrente. Aponta promessas que a casa nunca faria.',
  },
  {
    id: 'rever', nome: 'Rever antes de publicar', grupo: 'Optimizar', variacoes: 1,
    descricao: 'A porta antes de sair: regras da casa, tom, conformidade (CMVM, Meta) e versão corrigida.',
    entradas: [TEXTO_ACTUAL],
    saida: [{ rotulo: 'Veredicto' }, { rotulo: 'Problemas', lista: true }, { rotulo: 'Versão corrigida', limite: 1500 }],
    pede: 'Veredicto é "Pode sair", "Sai com correcções" ou "Não sai". Política de anúncios de produtos financeiros da Meta incluída.',
  },
] as const

export const GRUPOS_ESTUDIO: readonly GrupoEstudio[] = ['Meta', 'Google', 'TikTok', 'Outras redes', 'Campanha', 'Optimizar']

export function geradorPorId(id: string): Gerador | undefined {
  return GERADORES.find((g) => g.id === id)
}

export type Variacao = { titulo: string; campos: Record<string, string | string[]> }

/** O formato que se pede à IA para um gerador. */
export function formatoSaida(g: Gerador): string {
  const campos = g.saida
    .map((c) => `"${c.rotulo}": ${c.lista ? '["…", "…"]' : '"…"'}${c.limite ? ` (máx. ${c.limite} caracteres${c.lista ? ' por linha' : ''})` : ''}`)
    .join(', ')
  return `Responde só com JSON: {"variacoes":[{"titulo":"<nome curto da variação>","campos":{${campos}}}],"notas":"<1-3 frases para o dono, opcional>"} com exactamente ${g.variacoes} variaç${g.variacoes === 1 ? 'ão' : 'ões'}.`
}

/** Normaliza o que a IA devolveu: só os campos pedidos, listas como listas, textos como texto. */
export function normalizarVariacoes(g: Gerador, bruto: unknown): Variacao[] {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const lista = Array.isArray(o.variacoes) ? o.variacoes : []
  return lista.slice(0, Math.max(g.variacoes, 1)).map((v, i) => {
    const q = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const c = (q.campos && typeof q.campos === 'object' ? q.campos : q) as Record<string, unknown>
    const campos: Record<string, string | string[]> = {}
    for (const s of g.saida) {
      const bruto = c[s.rotulo]
      if (s.lista) {
        const arr = Array.isArray(bruto) ? bruto : String(bruto ?? '').split('\n')
        campos[s.rotulo] = arr.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 40)
      } else {
        campos[s.rotulo] = Array.isArray(bruto) ? bruto.map(String).join('\n') : String(bruto ?? '').trim()
      }
    }
    return { titulo: String(q.titulo ?? '').trim().slice(0, 80) || `Variação ${i + 1}`, campos }
  })
}

/** Os campos que passam do limite da plataforma — o ecrã mostra-os, a guarda prova a conta. */
export function excessos(g: Gerador, v: Variacao): string[] {
  const fora: string[] = []
  for (const s of g.saida) {
    if (!s.limite) continue
    const val = v.campos[s.rotulo]
    const linhas = Array.isArray(val) ? val : [val ?? '']
    linhas.forEach((l, i) => { if (l.length > s.limite!) fora.push(`${s.rotulo}${Array.isArray(val) ? ` #${i + 1}` : ''} (${l.length}/${s.limite})`) })
  }
  return fora
}
