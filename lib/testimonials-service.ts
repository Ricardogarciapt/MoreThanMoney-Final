// Serviço compartilhado para gerenciar testemunhos

export interface Testimonial {
  id: string
  name: string
  role: string
  company?: string
  image: string
  content: string
  rating: number
  profit?: string
  profitPercentage?: number
  monthlyReturn?: number
  investmentAmount?: number
  timeframe?: string
  tradingPeriod?: string
  location?: string
  avatar?: string
  verified: boolean
  featured: boolean
  createdAt: Date
  updatedAt?: Date
}

// Dados iniciais para testemunhos
const initialTestimonials: Testimonial[] = [
  {
    id: "1",
    name: "Rafael Bastos",
    location: "Leiria, Portugal",
    role: "Pai Profissional",
    content:
      "Rising Star foi uma conquista 100%! Com dedicação ao máximo consegui resultados incríveis usando os scanners MTM.",
    rating: 5,
    profit: "+450 pips",
    profitPercentage: 45,
    timeframe: "3 meses",
    tradingPeriod: "3 meses",
    image: "/testimonials/rafael-bastos.jpg",
    avatar: "/testimonials/rafael-bastos.jpg",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "2",
    name: "Sandra Oliveira",
    location: "Leiria, Portugal",
    role: "Contabilista",
    content:
      "Focada em criptomoedas, uso o método MoreThanMoney em dinâmica de cripto. Juntar-me à JIFU trouxe-me confiança e clareza sobre os meus objetivos financeiros.",
    rating: 5,
    profit: "+1,820 pips",
    profitPercentage: 182,
    timeframe: "18 meses",
    tradingPeriod: "18 meses",
    image: "/testimonials/sandra-oliveira.jpg",
    avatar: "/testimonials/sandra-oliveira.jpg",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "3",
    name: "Liliana Faria",
    location: "Alpiarça, Portugal",
    role: "Gold Manager JIFU",
    content:
      "A tua fundação para director foi criada! Estás a um passo de distância! Trabalhar contigo tem sido uma inspiração diária.",
    rating: 5,
    profit: "+3,200 pips",
    profitPercentage: 320,
    timeframe: "18 meses",
    tradingPeriod: "18 meses",
    image: "/testimonials/liliana-faria.jpg",
    avatar: "/testimonials/liliana-faria.jpg",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "4",
    name: "Gonçalo & Vânia",
    location: "Braga, Portugal",
    role: "Casal Empreendedor",
    content:
      "Mais uma recompensa pelo bom trabalho para este casal incrível da minha equipa. Parabéns, feliz por vocês! Withdraw Club conquistado!",
    rating: 5,
    profit: "+4,100 pips",
    profitPercentage: 410,
    timeframe: "5 meses",
    tradingPeriod: "5 meses",
    image: "/testimonials/goncalo-vania.jpg",
    avatar: "/testimonials/goncalo-vania.jpg",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "5",
    name: "Rui & Carla",
    location: "Coimbra, Portugal",
    role: "Casal Investidor",
    content:
      "Somos um casal lindo. Estes quatro meses de JIFU têm sido intensos, loucos, mas muito prazerosos. Ser ensinável e grato por tudo predomina nos nossos dias.",
    rating: 5,
    profit: "+2,850 pips",
    profitPercentage: 285,
    timeframe: "18 meses",
    tradingPeriod: "18 meses",
    image: "/testimonials/rui-carla.jpg",
    avatar: "/testimonials/rui-carla.jpg",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "6",
    name: "André Dias",
    location: "Suíça",
    role: "Chefe de Equipa de Construção",
    content:
      "Muito obrigado pelo vosso apoio, maltinha, principalmente ao Ricardo e Liliana que não me deixaram desistir nos momentos mais difíceis. Withdraw Club alcançado!",
    rating: 5,
    profit: "+3,650 pips",
    profitPercentage: 365,
    timeframe: "6 meses",
    tradingPeriod: "6 meses",
    image: "/testimonials/andre-dias.jpg",
    avatar: "/testimonials/andre-dias.jpg",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "7",
    name: "Sandra Oliveira",
    location: "Leiria, Portugal",
    role: "Investidora",
    content:
      "Depois de 2 anos a usar os scanners MTM, consegui resultados consistentes e uma nova perspectiva sobre investimentos. A comunidade é incrível!",
    rating: 5,
    profit: "+2,500 pips",
    profitPercentage: 250,
    timeframe: "24 meses",
    tradingPeriod: "24 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "8",
    name: "Miguel Costa",
    location: "Porto, Portugal",
    role: "Trader Profissional",
    content:
      "Os scanners MTM revolucionaram a minha forma de operar. A precisão é impressionante e o suporte da equipa é excepcional.",
    rating: 5,
    profit: "+5,200 pips",
    profitPercentage: 520,
    timeframe: "8 meses",
    tradingPeriod: "8 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "9",
    name: "Ana Marques",
    location: "Lisboa, Portugal",
    role: "Empresária",
    content:
      "A plataforma MoreThanMoney combinada com os scanners MTM deu-me as ferramentas necessárias para criar uma fonte de rendimento passivo. Recomendo a todos!",
    rating: 5,
    profit: "+3,800 pips",
    profitPercentage: 380,
    timeframe: "12 meses",
    tradingPeriod: "12 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "10",
    name: "Paulo Ferreira",
    location: "Faro, Portugal",
    role: "Trader Iniciante",
    content:
      "Em apenas 3 meses consegui resultados que nunca imaginei. O onboarding personalizado e o acompanhamento constante fazem toda a diferença!",
    rating: 5,
    profit: "+1,200 pips",
    profitPercentage: 120,
    timeframe: "3 meses",
    tradingPeriod: "3 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "11",
    name: "Carla Silva",
    location: "Viseu, Portugal",
    role: "Investidora",
    content:
      "A automatização do copytrading permitiu-me ter resultados sem precisar estar 24/7 a monitorizar. Perfeito para quem tem pouco tempo!",
    rating: 5,
    profit: "+2,100 pips",
    profitPercentage: 210,
    timeframe: "6 meses",
    tradingPeriod: "6 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "12",
    name: "João Mendes",
    location: "Aveiro, Portugal",
    role: "Engenheiro",
    content:
      "A educação IQONIC abriu-me os olhos para oportunidades que desconhecia. Hoje sinto-me confiante para tomar decisões financeiras informadas.",
    rating: 5,
    profit: "+1,850 pips",
    profitPercentage: 185,
    timeframe: "9 meses",
    tradingPeriod: "9 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "13",
    name: "Beatriz Santos",
    location: "Setúbal, Portugal",
    role: "Professora",
    content:
      "Nunca pensei que pudesse ter uma segunda fonte de rendimento tão estável. Os scanners são incríveis e fáceis de usar!",
    rating: 5,
    profit: "+1,450 pips",
    profitPercentage: 145,
    timeframe: "4 meses",
    tradingPeriod: "4 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "14",
    name: "Ricardo Alves",
    location: "Braga, Portugal",
    role: "Gestor de Projetos",
    content:
      "A transparência e profissionalismo da equipa MTM são impressionantes. Sinto-me parte de uma família que quer ver todos a crescer!",
    rating: 5,
    profit: "+4,300 pips",
    profitPercentage: 430,
    timeframe: "14 meses",
    tradingPeriod: "14 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "15",
    name: "Teresa Rodrigues",
    location: "Évora, Portugal",
    role: "Médica",
    content:
      "Consegui conciliar a minha profissão com o trading graças à automatização. Os portfólios inteligentes são um game changer!",
    rating: 5,
    profit: "+2,900 pips",
    profitPercentage: 290,
    timeframe: "10 meses",
    tradingPeriod: "10 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "16",
    name: "Hugo Pereira",
    location: "Guimarães, Portugal",
    role: "Eletricista",
    content:
      "Comecei sem saber nada de trading. Hoje, com o Scanner GoldKiller, já tenho uma rotina diária de análise que me dá confiança para entrar no mercado.",
    rating: 5,
    profit: "+1,680 pips",
    profitPercentage: 168,
    timeframe: "5 meses",
    tradingPeriod: "5 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "17",
    name: "Inês Carvalho",
    location: "Vila Real, Portugal",
    role: "Designer Gráfica",
    content:
      "O acompanhamento da equipa MTM faz toda a diferença. Sinto que não estou sozinha nesta caminhada e isso muda tudo na forma como encaro o trading.",
    rating: 5,
    profit: "+980 pips",
    profitPercentage: 98,
    timeframe: "2 meses",
    tradingPeriod: "2 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "18",
    name: "Tiago Nogueira",
    location: "Funchal, Madeira",
    role: "Programador",
    content:
      "A automatização com copytrading foi o que me convenceu a avançar. Em poucos meses já vejo resultados consistentes sem ter de estar agarrado aos gráficos.",
    rating: 5,
    profit: "+2,340 pips",
    profitPercentage: 234,
    timeframe: "7 meses",
    tradingPeriod: "7 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "19",
    name: "Marta & Filipe",
    location: "Ponta Delgada, Açores",
    role: "Casal Empreendedor",
    content:
      "Decidimos arriscar juntos e foi a melhor decisão. O método MTM deu-nos uma estrutura clara para gerir o nosso dinheiro e construir o nosso futuro.",
    rating: 5,
    profit: "+3,050 pips",
    profitPercentage: 305,
    timeframe: "11 meses",
    tradingPeriod: "11 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "20",
    name: "Bruno Antunes",
    location: "Covilhã, Portugal",
    role: "Professor de Educação Física",
    content:
      "Nunca pensei que conseguisse perceber os mercados financeiros. A formação IQONIC explica tudo de forma simples e prática, passo a passo.",
    rating: 5,
    profit: "+1,520 pips",
    profitPercentage: 152,
    timeframe: "4 meses",
    tradingPeriod: "4 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "21",
    name: "Cláudia Esteves",
    location: "Santarém, Portugal",
    role: "Enfermeira",
    content:
      "Trabalho por turnos e precisava de algo que se adaptasse à minha vida. Os scanners MTM dão-me sinais claros e eu decido quando tenho tempo. Perfeito!",
    rating: 5,
    profit: "+1,940 pips",
    profitPercentage: 194,
    timeframe: "6 meses",
    tradingPeriod: "6 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "22",
    name: "Nuno Ribeiro",
    location: "Matosinhos, Portugal",
    role: "Empresário",
    content:
      "Já passei por várias formações de trading, mas nada se compara ao acompanhamento próximo que recebo aqui. A diferença está nos detalhes e no apoio constante.",
    rating: 5,
    profit: "+4,680 pips",
    profitPercentage: 468,
    timeframe: "16 meses",
    tradingPeriod: "16 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "23",
    name: "Patrícia Gomes",
    location: "Beja, Portugal",
    role: "Advogada",
    content:
      "Entrei cética, mas a transparência dos resultados e a comunidade fizeram-me mudar de ideias rapidamente. Hoje recomendo a todos os meus amigos.",
    rating: 5,
    profit: "+2,210 pips",
    profitPercentage: 221,
    timeframe: "8 meses",
    tradingPeriod: "8 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "24",
    name: "Diogo Martins",
    location: "Sintra, Portugal",
    role: "Estudante Universitário",
    content:
      "Comecei com pouco capital só para aprender e hoje já construí uma base sólida para o meu futuro. O Plano em 3 Passos foi o ponto de viragem para mim.",
    rating: 5,
    profit: "+760 pips",
    profitPercentage: 76,
    timeframe: "3 meses",
    tradingPeriod: "3 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "25",
    name: "Sofia Lourenço",
    location: "Cascais, Portugal",
    role: "Gestora de Marketing",
    content:
      "O que mais valorizo é a clareza da comunicação da equipa MTM. Sem promessas vazias, só método, prática e resultados reais ao longo do tempo.",
    rating: 5,
    profit: "+2,670 pips",
    profitPercentage: 267,
    timeframe: "9 meses",
    tradingPeriod: "9 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "26",
    name: "Vasco & Joana",
    location: "Faro, Portugal",
    role: "Casal de Empreendedores Digitais",
    content:
      "Juntos decidimos investir na nossa educação financeira e foi o melhor presente que demos à nossa família. O retorno já superou todas as nossas expectativas.",
    rating: 5,
    profit: "+3,920 pips",
    profitPercentage: 392,
    timeframe: "13 meses",
    tradingPeriod: "13 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: true,
    createdAt: new Date(),
  },
  {
    id: "27",
    name: "Rodrigo Sousa",
    location: "Viana do Castelo, Portugal",
    role: "Mecânico",
    content:
      "Trabalho fisicamente cansativo todos os dias, mas à noite dedico uma hora aos scanners e à análise. Já estou a ver a diferença na minha conta poupança.",
    rating: 5,
    profit: "+1,380 pips",
    profitPercentage: 138,
    timeframe: "5 meses",
    tradingPeriod: "5 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "28",
    name: "Mariana Pinto",
    location: "Almada, Portugal",
    role: "Psicóloga",
    content:
      "Aprendi não só sobre mercados, mas também sobre gestão emocional e disciplina. Isso mudou a forma como lido com o dinheiro em todas as áreas da minha vida.",
    rating: 5,
    profit: "+2,050 pips",
    profitPercentage: 205,
    timeframe: "7 meses",
    tradingPeriod: "7 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "29",
    name: "Eduardo Faria",
    location: "Portimão, Portugal",
    role: "Skipper / Marinheiro",
    content:
      "Passo longas temporadas no mar e precisava de um sistema que funcionasse mesmo quando não estou disponível. A automatização da MTM resolveu isso por completo.",
    rating: 5,
    profit: "+2,790 pips",
    profitPercentage: 279,
    timeframe: "10 meses",
    tradingPeriod: "10 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
  {
    id: "30",
    name: "Carolina Mendes",
    location: "Leiria, Portugal",
    role: "Fisioterapeuta",
    content:
      "Sempre tive medo de investir, mas o acompanhamento passo a passo deu-me a segurança que precisava. Hoje sinto-me no controlo total das minhas finanças.",
    rating: 5,
    profit: "+1,610 pips",
    profitPercentage: 161,
    timeframe: "4 meses",
    tradingPeriod: "4 meses",
    image: "",
    avatar: "",
    verified: true,
    featured: false,
    createdAt: new Date(),
  },
]

function normalizeTestimonial(raw: unknown): Testimonial | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as Record<string, unknown>
  if (typeof t.id !== "string" || !t.id) return null
  if (typeof t.name !== "string" || !t.name.trim()) return null
  if (typeof t.content !== "string" || !t.content.trim()) return null

  return {
    id: t.id,
    name: t.name.trim(),
    role: typeof t.role === "string" ? t.role : "",
    company: typeof t.company === "string" ? t.company : undefined,
    image: typeof t.image === "string" ? t.image : "",
    content: t.content.trim(),
    rating: typeof t.rating === "number" ? t.rating : 5,
    profit: typeof t.profit === "string" ? t.profit : undefined,
    profitPercentage: typeof t.profitPercentage === "number" ? t.profitPercentage : undefined,
    monthlyReturn: typeof t.monthlyReturn === "number" ? t.monthlyReturn : undefined,
    investmentAmount: typeof t.investmentAmount === "number" ? t.investmentAmount : undefined,
    timeframe: typeof t.timeframe === "string" ? t.timeframe : undefined,
    tradingPeriod: typeof t.tradingPeriod === "string" ? t.tradingPeriod : undefined,
    location: typeof t.location === "string" ? t.location : undefined,
    avatar: typeof t.avatar === "string" ? t.avatar : undefined,
    verified: t.verified !== false,
    featured: t.featured === true,
    createdAt: t.createdAt ? new Date(String(t.createdAt)) : new Date(),
    updatedAt: t.updatedAt ? new Date(String(t.updatedAt)) : undefined,
  }
}

function dedupeTestimonials(items: Testimonial[]): Testimonial[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

// Função para carregar testemunhos
export const getTestimonials = (): Testimonial[] => {
  if (typeof window === "undefined") {
    return initialTestimonials
  }

  try {
    const saved = localStorage.getItem("testimonials")
    if (saved) {
      const parsed = dedupeTestimonials(
        JSON.parse(saved)
          .map(normalizeTestimonial)
          .filter((t: Testimonial | null): t is Testimonial => t !== null)
      )

      if (parsed.length > 0) {
        return parsed
      }

      localStorage.removeItem("testimonials")
    }

    // Se não existir, salva os dados iniciais
    localStorage.setItem("testimonials", JSON.stringify(initialTestimonials))
    return initialTestimonials
  } catch (error) {
    console.error("Erro ao carregar testemunhos:", error)
    localStorage.removeItem("testimonials")
    return initialTestimonials
  }
}

// Função para salvar testemunhos
export const saveTestimonials = (testimonials: Testimonial[]): boolean => {
  try {
    localStorage.setItem("testimonials", JSON.stringify(testimonials))
    return true
  } catch (error) {
    console.error("Erro ao salvar testemunhos:", error)
    return false
  }
}

// Função para obter testemunhos em destaque
export const getFeaturedTestimonials = (): Testimonial[] => {
  const all = getTestimonials()
  return all.filter((t) => t.featured)
}

// Função para obter testemunhos verificados
export const getVerifiedTestimonials = (): Testimonial[] => {
  const all = getTestimonials()
  return all.filter((t) => t.verified)
}

// Função para obter testemunhos aleatórios (landing pública — ignora localStorage corrompido)
export const getRandomTestimonials = (count: number): Testimonial[] => {
  const source = dedupeTestimonials(
    initialTestimonials.filter((t) => t.verified && t.name?.trim() && t.content?.trim())
  )
  const shuffled = [...source].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

// Função para adicionar um testemunho
export const addTestimonial = (testimonial: Omit<Testimonial, "id" | "createdAt">): Testimonial => {
  const all = getTestimonials()
  const newTestimonial: Testimonial = {
    ...testimonial,
    id: Date.now().toString(),
    createdAt: new Date(),
  }

  const updated = [...all, newTestimonial]
  saveTestimonials(updated)
  return newTestimonial
}

// Função para atualizar um testemunho
export const updateTestimonial = (id: string, data: Partial<Testimonial>): Testimonial | null => {
  const all = getTestimonials()
  const index = all.findIndex((t) => t.id === id)

  if (index === -1) return null

  const updated = [...all]
  updated[index] = {
    ...updated[index],
    ...data,
    updatedAt: new Date(),
  }

  saveTestimonials(updated)
  return updated[index]
}

// Função para excluir um testemunho
export const deleteTestimonial = (id: string): boolean => {
  const all = getTestimonials()
  const updated = all.filter((t) => t.id !== id)

  if (updated.length === all.length) return false

  saveTestimonials(updated)
  return true
}

// Função para alternar o status de destaque
export const toggleFeatured = (id: string): Testimonial | null => {
  const all = getTestimonials()
  const testimonial = all.find((t) => t.id === id)

  if (!testimonial) return null

  return updateTestimonial(id, { featured: !testimonial.featured })
}

// Função para alternar o status de verificado
export const toggleVerified = (id: string): Testimonial | null => {
  const all = getTestimonials()
  const testimonial = all.find((t) => t.id === id)

  if (!testimonial) return null

  return updateTestimonial(id, { verified: !testimonial.verified })
}
