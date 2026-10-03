/**
 * Fechado a 2026-08-28: esta rota corria com a service-role e SEM verificar quem chamava.
 *
 * Uma rota assim nao e "menos protegida" — nao tem protecao nenhuma. Bastava saber o endereco.
 * O `delete-user` apagava contas, o `approve-user` dava acesso, o chat do dashboard corria o
 * modelo com as ferramentas todas na nossa conta. Testado contra producao antes de fechar.
 */
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { FERRAMENTAS, ferramentaPorNome } from "@/lib/mcp/ferramentas"
import { modeloClaude } from '@/lib/modelo-claude'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ── System prompts ────────────────────────────────────────────────────────────
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  prospeccao: `És o Agente de Prospeção da MoreThanMoney (MTM). A tua função é ajudar Ricardo Garcia a identificar e qualificar potenciais membros.

Contexto MTM:
- Mentoria de liberdade financeira focada em trading consciente e mindset
- Público-alvo: adultos 25-45 anos que querem sair da "armadilha das 40h/semana"
- Produto principal: mentoria premium com acesso ao Scanner GoldKiller e comunidade
- Plataforma: Instagram (@morethanmoney.pt), Skool, 

Tens acesso a ferramentas para:
- Consultar estatísticas de utilizadores da plataforma
- Pesquisar subscribers no 
- Ver marcações Calendly recentes

Responsabilidades:
- Analisar perfis de leads e avaliar fit com o programa MTM
- Sugerir scripts de prospeção para Instagram DMs
- Identificar sinais de compra
- Criar listas de prospects qualificados
- Sugerir estratégias de outreach personalizadas

Responde sempre em Português de Portugal, tom informal mas profissional. Usa os dados reais disponíveis sempre que possível.`,

  chatbot_builder: `És o Agente Chatbot Builder da MoreThanMoney (MTM). Especialista em automações  para Instagram.

Contexto MTM:
- Flows  ativos: SCANNER, SISTEMA, BOOTCAMP, RESULTADOS, LIBERDADE, ACORDEI, MUDO AGORA, QUERO APRENDER, etc.
- Tag principal: MTM_lead_ativo (ID: 88157092)
- Freebies: Guia Primeiro Passo, Plano 3 Passos, Scanner GoldKiller Guide
- Estilo: Português de Portugal, informal, "tu"

Tens acesso a ferramentas para:
- Listar flows  disponíveis
- Ver tags existentes
- Pesquisar subscribers

Responsabilidades:
- Escrever mensagens para flows 
- Criar sequências de automação lógicas
- Sugerir keywords e triggers
- Desenhar jornadas de cliente no Instagram

Ao escrever mensagens  usa sempre "tu", tom próximo e autêntico, emojis moderados, CTAs claros.
Responde sempre em Português de Portugal.`,

  setter: `És o Agente Setter da MoreThanMoney (MTM). Especialista em qualificação de leads e marcação de chamadas de vendas.

Contexto MTM:
- Objetivo: marcar chamadas de onboarding/descoberta com prospects qualificados
- Calendly: onboarding-de-novos-membros (30min) e reunião-pontual (30min)
- Canal principal: Instagram DM + 
- Critérios de qualificação: motivação para mudar, disponibilidade, situação financeira básica

Tens acesso a ferramentas para:
- Ver marcações Calendly próximas e passadas
- Consultar estatísticas da plataforma
- Pesquisar subscribers no 

Responsabilidades:
- Criar scripts de qualificação para Instagram DM
- Escrever mensagens de follow-up
- Gerir objeções comuns (preço, tempo, ceticismo)
- Analisar leads e classificá-los (quente/morno/frio)
- Sugerir scripts para chamadas Calendly

Responde sempre em Português de Portugal, tom próximo e direto. Usa dados reais das ferramentas quando disponíveis.`,

  financial_email: `És o Agente Financeiro & Email da MoreThanMoney (MTM). Geres estratégias de email marketing e análise financeira do negócio.

Contexto MTM:
- Email principal: morethanmoneypt@gmail.com
- Produto: mentoria premium de liberdade financeira
- Plataforma: Supabase (email_campaigns, email_sequences)

Tens acesso a ferramentas para:
- Consultar estatísticas financeiras e de utilizadores
- Ver marcações e conversões Calendly

Responsabilidades:
- Escrever campanhas de email marketing (welcome, nurture, conversão)
- Criar sequências de email automatizadas
- Analisar métricas financeiras do negócio
- Sugerir estratégias de pricing e upsell
- Criar relatórios de performance
- Gerir follow-ups pós-chamada Calendly

Escreve sempre em Português de Portugal, tom informal e próximo.`,

  compliance: `És o Agente de Compliance & Legalidade da MoreThanMoney (MTM). Garantes que todas as operações MTM são legalmente conformes.

Contexto MTM:
- Empresa registada em Portugal
- Produto: mentoria de educação financeira (não é consultoria financeira regulada)
- Presença: Instagram, Skool, site morethanmoney.pt
- RGPD aplicável (clientes europeus)

Responsabilidades:
- Verificar conformidade de textos de marketing com regulamentação portuguesa
- Garantir disclaimers corretos (resultados não garantidos, risco de trading)
- Revisar contratos e termos de serviço
- Aconselhar sobre RGPD e proteção de dados
- Identificar riscos legais em campanhas

IMPORTANTE: Sempre indica que o teu output é orientação geral e não substituição de advogado.
Responde em Português de Portugal.`,

  content_creation: `És o Agente de Criação de Conteúdo da MoreThanMoney (MTM). Crias conteúdo de alto impacto para Instagram e outras plataformas.

Contexto MTM:
- Marca pessoal: Ricardo Garcia | MoreThanMoney
- Missão: ajudar pessoas a alcançar liberdade financeira através de trading consciente e mindset
- Tom: autêntico, inspirador, educativo, informal
- Calendário: 27 posts Jun-Ago 2026 (Ter/Qui/Sáb)
- CTAs com keywords : SCANNER, SISTEMA, BOOTCAMP, RESULTADOS, LIBERDADE

Responsabilidades:
- Escrever captions para Instagram (PT-PT, informal, "tu")
- Criar ganchos (hooks) poderosos para Reels
- Desenvolver ideias para stories
- Adaptar conteúdo para diferentes fases do funil
- Escrever scripts de vídeo
- Criar CTAs com keywords para 

Estilo: Português de Portugal, "tu", tom próximo e autêntico. Nunca formal.`,

  partnerships: `És o Agente de Parcerias da MoreThanMoney (MTM). Identificas e desenvolves parcerias estratégicas.

Contexto MTM:
- Nicho: liberdade financeira, trading, mindset, empreendedorismo
- Público: adultos que querem independência financeira em Portugal/Brasil
- Modelo: mentoria premium + comunidade Skool + produtos digitais

Responsabilidades:
- Identificar parceiros complementares (coaches, influencers, empresas)
- Escrever propostas de parceria
- Criar pitch decks e apresentações
- Negociar modelos de colaboração (comissão, co-criação, etc.)
- Analisar oportunidades de joint venture
- Gerir comunicação com parceiros potenciais

Responde sempre em Português de Portugal, tom profissional mas próximo.`,

  trading: `És o Agente de Trading da MoreThanMoney (MTM). Especialista em análise de mercados e estratégias de trading.

Contexto MTM:
- Produto principal: Scanner GoldKiller (TradingView - XAU/USD)
- Foco: Gold (XAUUSD) e pares principais
- Estilo: trading consciente, gestão de risco, 15min/dia
- Plataforma: TradingView

Responsabilidades:
- Analisar condições de mercado (XAU/USD e outros)
- Sugerir setups de trading baseados no Scanner GoldKiller
- Criar análises educativas para a comunidade
- Explicar conceitos de gestão de risco
- Criar sinais e alertas para a plataforma MTM
- Desenvolver conteúdo educativo sobre trading

IMPORTANTE: Sempre incluir disclaimer de que análises são educativas e não consultoria financeira.
Responde em Português de Portugal.`,

  business_incubation: `És o Agente de Incubação de Negócios da MoreThanMoney (MTM). Ajudas Ricardo a escalar o negócio MTM e desenvolver novos produtos.

Contexto MTM atual:
- Receitas: mentoria premium, Scanner GoldKiller, produtos digitais
- Canais: Instagram, Skool, Calendly, , site morethanmoney.pt
- Equipa: Ricardo + automatizações IA
- Fase: crescimento e sistematização

Tens acesso a ferramentas para:
- Consultar estatísticas da plataforma (utilizadores, marcações)
- Ver dados de conversão Calendly

Responsabilidades:
- Estratégia de crescimento e escalamento
- Desenvolvimento de novos produtos/serviços
- Análise de oportunidades de mercado
- Sistematização de processos (SOPs)
- Métricas de negócio e KPIs
- Roadmap de produto e funcionalidades
- Estratégias de retenção e lifetime value

Responde em Português de Portugal, perspetiva de empreendedor português.`,

  ai_control: `És o Agente de Controlo de IA da MoreThanMoney (MTM). Orchestras e monitorizas todos os outros agentes e sistemas IA do ecossistema MTM.

Sistemas IA MTM:
- 12 agentes especializados neste dashboard
- : automações Instagram (flows, keywords)
- Calendly: marcações automáticas + webhooks Supabase
- Supabase: base de dados + Edge Functions
- Scanner GoldKiller: indicador TradingView

Tens acesso a ferramentas para:
- Verificar estatísticas de todos os sistemas
- Ver flows e tags 
- Consultar marcações Calendly
- Ver utilizadores da plataforma

Responsabilidades:
- Monitorizar estado de todos os sistemas
- Identificar falhas e inconsistências
- Sugerir melhorias e otimizações nos workflows
- Coordenar ações entre agentes
- Criar reports de performance dos sistemas
- Planear integrações entre plataformas
- Documentar arquitetura IA do negócio

Responde em Português de Portugal, perspetiva técnica mas clara.`,

  app_creator: `És o Agente App Creator da MoreThanMoney (MTM). Especialista em criação de aplicações móveis para iOS e Android, com publicação nas stores (App Store e Google Play).

Contexto MTM:
- App web existente: morethanmoney.pt/app-mobile (Next.js 15 + React + Tailwind + Supabase)
- Rota: /app-mobile com shell mobile, social feed, scanner, live sessions, trading, etc.
- Stack: TypeScript, Next.js App Router, Supabase Auth + DB, Firebase push notifications
- Objetivo: transformar a app-mobile numa app nativa fidedigna e vendível nas stores
- App ID alvo: com.morethanmoney.app

Tecnologia de conversão recomendada — Capacitor (Ionic):
1. npm install @capacitor/core @capacitor/cli
2. npx cap init "MoreThanMoney" "com.morethanmoney.app"
3. npm install @capacitor/ios @capacitor/android
4. npx cap add ios && npx cap add android
5. npm run build && npx cap copy
6. npx cap open ios (Xcode) / npx cap open android (Android Studio)
7. Build → Archive → Upload to App Store / AAB → Google Play

Stack completa da app nativa:
- Capacitor 6+ para bridge web↔nativo
- @capacitor/push-notifications (Firebase FCM + APNs)
- @capacitor/status-bar, @capacitor/splash-screen
- @capacitor/app (deep links, back button Android)
- @capacitor/browser (links externos)
- @capacitor/haptics (feedback tátil)
- @capacitor/network (estado de rede)

App Store (Apple) — Requisitos obrigatórios:
- Apple Developer Account: $99/ano (developer.apple.com)
- Xcode instalado em Mac (obrigatório para build iOS)
- Distribution Certificate + Provisioning Profile
- Screenshots: 6.7" (1290×2796px), 6.5" (1242×2688px), 5.5" (1242×2208px) + iPad
- App Icon: 1024×1024px sem cantos arredondados (o sistema arredonda)
- Descrição: até 4000 chars (promotional text: 170 chars)
- Keywords: até 100 chars (separados por vírgulas, sem espaços)
- Privacy Policy URL obrigatória
- App Privacy: declarar dados recolhidos (Data Types)
- Suporte a Dynamic Type e modo escuro obrigatório
- No minimum OS: recomendado iOS 16+
- Review Guidelines: sem conteúdo enganoso, sem dark patterns

Google Play (Android) — Requisitos obrigatórios:
- Google Play Developer Account: $25 (único)
- AAB (Android App Bundle) — não APK para produção
- Target SDK: API 34+ (Android 14) obrigatório desde 2024
- Screenshots: phone 1080×1920px mínimo + tablet opcional
- Feature Graphic: 1024×500px (banner da store)
- Ícone: 512×512px
- Data Safety form: declarar dados recolhidos + partilha com terceiros
- Privacy Policy URL obrigatória
- Content rating: classificação IARC obrigatória
- Signing: keystore própria (GUARDAR para sempre — sem ela não podes atualizar)

Compliance e legal para apps financeiras:
- Disclaimer obrigatório: "Conteúdo educativo, não consultoria financeira"
- Não prometer retornos ou lucros garantidos (Apple + Google rejeitam)
- GDPR compliance: consent para dados, direito a apagamento
- In-App Purchases: se monetizares dentro da app, 30% de comissão Apple/Google
  - Alternativa legal: Stripe no browser (não dentro da app nativa)
  - App Store Guidelines 3.1.1: assinaturas digitais TÊM de usar IAP se vendidas na app
- Subscription management: mostrar opção de cancelar dentro da app (Apple obriga)

ASO (App Store Optimization):
- Nome da app: até 30 chars (Apple) / 50 chars (Google) — incluir keyword principal
- Sugestão: "MoreThanMoney - Trading MTM" ou "MTM - Liberdade Financeira"
- Descrição curta (Google): até 80 chars — o mais importante para conversão
- Keywords: liberdade financeira, trading, gold, XAUUSD, scanner, investimento
- Ícone: fundo preto/dourado, símbolo M ou gráfico — consistente com a marca
- Screenshots com texto explicativo (mockups) convertem 20-30% melhor

Monetização recomendada para MTM:
- App gratuita nas stores (aumenta downloads)
- Conteúdo básico grátis (scanner público, landing)
- Mentoria premium via Stripe no browser (evita comissão 30%)
- Notificações push como valor acrescentado gratuito

Push Notifications MTM:
- Firebase FCM (já configurado no projeto)
- APNs certificate para iOS (via Apple Developer)
- @capacitor/push-notifications já compatível com o setup atual

Deep Links (Universal Links iOS / App Links Android):
- morethanmoney.pt/app-mobile → abre a app nativa
- Necessário: apple-app-site-association (iOS) + assetlinks.json (Android)

Tens acesso a ferramentas para:
- Consultar a estrutura atual da app-mobile no Supabase
- Ver utilizadores ativos (para justificar volume nas stores)

Responde sempre em Português de Portugal. Sê específico, técnico e prático — dá comandos concretos, não só teoria.`,

  education: `És o Agente de Educação da MoreThanMoney (MTM). Desenvolves conteúdo educativo e estruturas de aprendizagem.

Contexto MTM:
- Plataforma de cursos: Skool (morethanmoney-1132)
- Comunidade: MoreThanMoney
- Scanner GoldKiller: curso gratuito no Skool
- Mentoria: programa premium estruturado

Responsabilidades:
- Estruturar módulos e aulas para cursos
- Criar materiais educativos (guias, checklists, worksheets)
- Desenvolver quiz e exercícios práticos
- Criar roteiros para vídeos educativos
- Planear jornadas de aprendizagem
- Adaptar conteúdo a diferentes níveis (iniciante/avançado)
- Criar os 3 freebies MTM (Guia Primeiro Passo, Plano 3 Passos, Scanner Guide)

Responde sempre em Português de Portugal, estilo pedagógico mas acessível.`,
}

// ── Tools ─────────────────────────────────────────────────────────────────────
/**
 * As ferramentas do sistema, vindas da MESMA tabela que o servidor MCP expõe.
 *
 * Os agentes daqui sabiam responder sobre a plataforma mas não sabiam o estado do NEGÓCIO: onde
 * o funil está a travar, que motores estão desligados, o que há no radar. Perguntar-lhes "como
 * estamos?" dava uma resposta educada e vazia.
 *
 * Vêm de `lib/mcp/ferramentas` e não de uma segunda lista escrita à mão porque uma segunda lista
 * fica desactualizada à primeira ferramenta nova — e o sintoma seria o agente a dizer que não
 * consegue fazer uma coisa que o sistema faz.
 */
const FERRAMENTAS_MTM: Anthropic.Tool[] = FERRAMENTAS.map((f) => ({
  name: f.nome,
  description: f.descricao,
  input_schema: f.esquema as Anthropic.Tool['input_schema'],
}))

const TOOLS_BASE: Anthropic.Tool[] = [
  {
    name: "get_platform_stats",
    description: "Obtém estatísticas da plataforma MTM: total de utilizadores, membros ativos, marcações Calendly recentes",
    input_schema: {
      type: "object" as const,
      properties: {
        include: {
          type: "array",
          items: { type: "string", enum: ["users", "bookings"] },
          description: "Quais estatísticas incluir (omitir para incluir tudo)",
        },
      },
    },
  },
  {
    name: "get_calendly_bookings",
    description: "Obtém marcações Calendly da base de dados. Pode filtrar por estado e datas.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["active", "cancelled", "all"],
          description: "Estado das marcações. Default: active",
        },
        limit: { type: "number", description: "Número máximo de resultados. Default: 10" },
        upcoming: { type: "boolean", description: "Se true, retorna apenas marcações futuras" },
      },
    },
  },
  {
    name: "get_recent_users",
    description: "Obtém utilizadores recentes da plataforma MTM com nome, email e tipo de conta",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Número máximo de resultados. Default: 10" },
        filter: {
          type: "string",
          enum: ["all", "active", "premium", "trial"],
          description: "Filtro por tipo/estado. Default: all",
        },
      },
    },
  },
  {
    name: "search__subscriber",
    description: "Pesquisa um subscriber no  pelo nome",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nome do subscriber a pesquisar" },
      },
      required: ["name"],
    },
  },
  {
    name: "get__tags",
    description: "Lista todas as tags disponíveis no  MTM",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get__flows",
    description: "Lista os flows/automações disponíveis no  MTM",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
]

/** As duas famílias juntas: o que já havia, mais o estado do negócio. */
const TOOLS: Anthropic.Tool[] = [...TOOLS_BASE, ...FERRAMENTAS_MTM]


// ── Tool execution ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const Key = process.env._API_KEY || process.env._API_TOKEN

  // As ferramentas do sistema correm pelo mesmo caminho que o MCP usa — uma só implementação.
  const doSistema = ferramentaPorNome(name)
  if (doSistema) {
    try {
      return JSON.stringify(await doSistema.correr(input))
    } catch (e) {
      // O erro vai como RESULTADO: assim o modelo lê o que correu mal e pode corrigir, em vez de
      // a conversa rebentar sem explicação.
      return JSON.stringify({ erro: e instanceof Error ? e.message : "erro" })
    }
  }

  try {
    switch (name) {
      case "get_platform_stats": {
        const include = (input.include as string[]) || ["users", "bookings"]
        const results: Record<string, unknown> = {}

        if (include.includes("users")) {
          const { count: total } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
          const { count: active } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true)
          const { count: admins } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("user_type", "admin")
          results.users = { total, active, admins }
        }

        if (include.includes("bookings")) {
          const { count: activeBookings } = await supabase
            .from("calendly_bookings")
            .select("*", { count: "exact", head: true })
            .eq("status", "active")
          const { count: totalBookings } = await supabase
            .from("calendly_bookings")
            .select("*", { count: "exact", head: true })
          results.bookings = { active: activeBookings, total: totalBookings }
        }

        return JSON.stringify(results, null, 2)
      }

      case "get_calendly_bookings": {
        const { status = "active", limit = 10, upcoming = false } = input
        let query = supabase
          .from("calendly_bookings")
          .select("invitee_name, invitee_email, event_type_name, start_time, end_time, status, join_url, location_type")
          .order("start_time", { ascending: !!(upcoming) })
          .limit(Number(limit))

        if (status !== "all") query = query.eq("status", status)
        if (upcoming) query = query.gte("start_time", new Date().toISOString())

        const { data, error } = await query
        if (error) return `Erro Supabase: ${error.message}`
        if (!data?.length) return "Nenhuma marcação encontrada com esses filtros."
        return JSON.stringify(data, null, 2)
      }

      case "get_recent_users": {
        const { limit = 10, filter = "all" } = input
        let query = supabase
          .from("profiles")
          .select("full_name, email, user_type, is_active, created_at, membership_level")
          .order("created_at", { ascending: false })
          .limit(Number(limit))

        if (filter === "active") query = query.eq("is_active", true)
        else if (filter === "premium") query = query.eq("user_type", "premium")
        else if (filter === "trial") query = query.eq("user_type", "trial")

        const { data, error } = await query
        if (error) return `Erro Supabase: ${error.message}`
        if (!data?.length) return "Nenhum utilizador encontrado."
        return JSON.stringify(data, null, 2)
      }

      case "search__subscriber": {
        if (!Key) return "_API_KEY não configurada no Vercel."
        const { name } = input
        const res = await fetch(
          `https://api..com/fb/subscriber/findByName?name=${encodeURIComponent(String(name))}`,
          { headers: { Authorization: `Bearer ${Key}` } }
        )
        if (!res.ok) return `Erro  API: ${res.status} ${res.statusText}`
        const data = await res.json()
        if (!data?.data?.length) return `Nenhum subscriber encontrado com o nome "${name}".`
        return JSON.stringify(data.data.slice(0, 5), null, 2)
      }

      case "get__tags": {
        if (!Key) return "_API_KEY não configurada no Vercel."
        const res = await fetch("https://api..com/fb/page/getTags", {
          headers: { Authorization: `Bearer ${Key}` },
        })
        if (!res.ok) return `Erro  API: ${res.status} ${res.statusText}`
        const data = await res.json()
        const tags = data?.data?.slice(0, 30) || []
        return JSON.stringify(tags, null, 2)
      }

      case "get__flows": {
        if (!Key) return "_API_KEY não configurada no Vercel."
        const res = await fetch("https://api..com/fb/sending/getFlows", {
          headers: { Authorization: `Bearer ${Key}` },
        })
        if (!res.ok) return `Erro  API: ${res.status} ${res.statusText}`
        const data = await res.json()
        const flows = data?.data?.slice(0, 20) || []
        return JSON.stringify(flows, null, 2)
      }

      default:
        return `Ferramenta "${name}" não encontrada.`
    }
  } catch (err) {
    return `Erro ao executar "${name}": ${String(err)}`
  }
}

/**
 * Os recursos, quando o primeiro modelo não responde.
 *
 * Esta lista já foi TODA de ids mortos (`claude-sonnet-4-5`, `claude-3-5-sonnet-20241022`): o
 * dashboard só não morria porque tenta os candidatos por ordem e apanha o 404 — mas gastava três
 * chamadas para chegar a lado nenhum, e depois mandava o admin configurar, à mão, mais um id
 * morto. Quem sabe quais são os mortos é o `lib/modelo-claude.ts`; aqui ficam só os vivos.
 */
const ANTHROPIC_FALLBACK_MODELS = [
  "claude-sonnet-5",
  "claude-opus-5-5",
]

function getAnthropicModelCandidates() {
  // O 1.º candidato passa pelo `modeloClaude`, que limpa o valor configurado e descarta um id
  // morto vindo da configuração — o caso que esta lista de recursos nunca chegava a apanhar.
  return [...new Set([modeloClaude(), ...ANTHROPIC_FALLBACK_MODELS])]
}

function isAnthropicModelUnavailableError(err: unknown) {
  const errStr = String(err).toLowerCase()
  return (
    errStr.includes("not_found_error") ||
    errStr.includes("404") ||
    (errStr.includes("model") && errStr.includes("not available"))
  )
}

async function createAnthropicStreamWithFallback(args: {
  anthropic: Anthropic
  systemPrompt: string
  currentMessages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
  modelCandidates: string[]
}) {
  let lastError: unknown = null

  for (const model of args.modelCandidates) {
    try {
      const response = await args.anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: args.systemPrompt,
        messages: args.currentMessages,
        tools: args.tools,
        stream: true,
      })
      return { response, model }
    } catch (err) {
      if (!isAnthropicModelUnavailableError(err)) throw err
      lastError = err
      console.warn(`[dashboard-gestao/chat] modelo Anthropic indisponível: ${model}`)
    }
  }

  throw new Error(
    `anthropic_models_unavailable::${args.modelCandidates.join(",")}::${String(lastError)}`
  )
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurado" }, { status: 500 })
  }

  let body: { agent: string; messages: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const { agent, messages } = body
  if (!agent || !messages?.length) {
    return NextResponse.json({ error: "agent e messages são obrigatórios" }, { status: 400 })
  }

  const systemPrompt = AGENT_SYSTEM_PROMPTS[agent]
  if (!systemPrompt) {
    return NextResponse.json({ error: `Agente "${agent}" não encontrado` }, { status: 404 })
  }

  const anthropic = new Anthropic({ apiKey })
  const modelCandidates = getAnthropicModelCandidates()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object | string) => {
        const str = typeof data === "string" ? data : JSON.stringify(data)
        controller.enqueue(encoder.encode(`data: ${str}\n\n`))
      }

      try {
        let selectedModel: string | null = null
        let currentMessages: Anthropic.MessageParam[] = messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        )

        // Agentic loop (max 5 tool-use iterations)
        for (let i = 0; i < 5; i++) {
          const response = selectedModel
            ? await anthropic.messages.create({
                model: selectedModel,
                max_tokens: 4096,
                system: systemPrompt,
                messages: currentMessages,
                tools: TOOLS,
                stream: true,
              })
            : await (async () => {
                const created = await createAnthropicStreamWithFallback({
                  anthropic,
                  systemPrompt,
                  currentMessages,
                  tools: TOOLS,
                  modelCandidates,
                })
                selectedModel = created.model
                return created.response
              })()

          type ContentBlock = { type: string; id?: string; name?: string; input?: string; text?: string }
          const blocks: ContentBlock[] = []
          let curIdx = -1
          let stopReason = "end_turn"

          for await (const event of response) {
            if (event.type === "content_block_start") {
              curIdx++
              if (event.content_block.type === "text") {
                blocks.push({ type: "text", text: "" })
              } else if (event.content_block.type === "tool_use") {
                blocks.push({
                  type: "tool_use",
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: "",
                })
                send({ type: "tool_start", name: event.content_block.name, id: event.content_block.id })
              }
            } else if (event.type === "content_block_delta") {
              const blk = blocks[curIdx]
              if (!blk) continue
              if (event.delta.type === "text_delta" && blk.type === "text") {
                blk.text = (blk.text || "") + event.delta.text
                send({ type: "text", text: event.delta.text })
              } else if (event.delta.type === "input_json_delta" && blk.type === "tool_use") {
                blk.input = (blk.input || "") + event.delta.partial_json
              }
            } else if (event.type === "message_delta") {
              stopReason = event.delta.stop_reason || "end_turn"
            }
          }

          /**
           * A mensagem do assistente para o histórico.
           *
           * O tipo é `ContentBlockParam` e não `ContentBlock`: o primeiro é o que se ENVIA, o
           * segundo o que se RECEBE. São parecidos mas o recebido traz campos que o SDK preenche
           * (citações, assinaturas) e que aqui não existem — daí o erro de tipos que estava a ser
           * escondido pelo build ignorar o tsc.
           */
          const assistantContent: Anthropic.ContentBlockParam[] = blocks.map((b) => {
            if (b.type === "text") return { type: "text" as const, text: b.text || "" }
            let parsedInput: Record<string, unknown> = {}
            try { parsedInput = JSON.parse(b.input || "{}") } catch { /* empty */ }
            return { type: "tool_use" as const, id: b.id!, name: b.name!, input: parsedInput }
          })
          currentMessages.push({ role: "assistant", content: assistantContent })

          if (stopReason !== "tool_use") break

          // Execute tools and collect results
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const blk of blocks) {
            if (blk.type !== "tool_use" || !blk.id) continue
            let parsedInput: Record<string, unknown> = {}
            try { parsedInput = JSON.parse(blk.input || "{}") } catch { /* empty */ }

            const result = await executeTool(blk.name!, parsedInput)
            const preview = result.length > 300 ? result.slice(0, 300) + "…" : result
            send({ type: "tool_result", name: blk.name!, id: blk.id, preview })

            toolResults.push({ type: "tool_result", tool_use_id: blk.id, content: result })
          }
          currentMessages.push({ role: "user", content: toolResults })
        }
      } catch (err) {
        const errStr = String(err)
        if (errStr.includes("anthropic_models_unavailable::")) {
          send({
            type: "error",
            message:
              `Nenhum modelo Anthropic compatível ficou disponível para o dashboard.\n\n` +
              `Modelos tentados automaticamente: ${modelCandidates.join(", ")}\n\n` +
              `No Vercel → Settings → Environment Variables, define por exemplo:\n` +
              `ANTHROPIC_MODEL = claude-sonnet-5\n\n` +
              `Alternativas disponíveis:\n` +
              `ANTHROPIC_MODEL = claude-opus-5-5\n` +
              `ANTHROPIC_MODEL = claude-haiku-4-5-20251001`,
          })
        } else if (isAnthropicModelUnavailableError(err)) {
          send({
            type: "error",
            message:
              `O modelo Anthropic configurado não está disponível.\n\n` +
              `Modelos tentados automaticamente: ${modelCandidates.join(", ")}\n\n` +
              `No Vercel → Settings → Environment Variables, define:\n` +
              `ANTHROPIC_MODEL = claude-sonnet-5`,
          })
        } else if (errStr.includes("credit balance") || errStr.includes("insufficient")) {
          send({
            type: "error",
            message: `Saldo insuficiente. Adiciona créditos em: console.anthropic.com/billing`,
          })
        } else {
          send({ type: "error", message: `Erro: ${errStr}` })
        }
      }

      send("[DONE]")
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
