/**
 * Resilient AI Framework for MoreThanMoney
 * Ensures that AI components always provide a meaningful response,
 * even when API credits are exhausted or models are unavailable.
 */

export type AIResponse = {
  text: string;
  source: 'api' | 'internal';
  confidence: number;
};

export async function getResilientResponse(
  agentId: string,
  query: string,
  apiCall: () => Promise<string>,
  internalKnowledge: Record<string, string>
): Promise<AIResponse> {
  try {
    const result = await apiCall();
    return {
      text: result,
      source: 'api',
      confidence: 1.0
    };
  } catch (error: any) {
    const errStr = String(error).toLowerCase();
    if (errStr.includes('credit balance') || errStr.includes('insufficient') || errStr.includes('429')) {
      // FALLBACK: Use the internal knowledge base of the project
      const fallback = internalKnowledge[agentId] || internalKnowledge['default'] || 
        "Estou a processar a tua solicitação com base nos dados internos do sistema MTM. Para uma análise profunda, verifica as métricas no Dashboard.";
      
      return {
        text: `[Modo Resiliente] ${fallback}`,
        source: 'internal',
        confidence: 0.7
      };
    }
    throw error; // Rethrow if it's a different kind of error
  }
}

export const PROJECT_KNOWLEDGE_BASE: Record<string, string> = {
  prospeccao: "Análise de leads via ManyChat e Calendly. Foco em adultos 25-45 anos, PT-PT, tom informal.",
  trading: "Análise XAU/USD via Scanner GoldKiller. Foco em trading consciente e gestão de risco (15min/dia).",
  compliance: "Conformidade RGPD e avisos de 'Conteúdo Educativo'. Não é consultoria financeira.",
  ai_control: "Monitorização de ecossistema: Supabase, Vercel, ManyChat e Agentes IA.",
  mentor: "Concierge Digital e Trainer de Desenvolvimento. Acompanha a jornada do aluno desde o Onboarding até ao Rank Premium.",
  default: "Sistema MoreThanMoney: Liberdade financeira, trading consciente e mindset.",
};
