import type { Lang } from "../config"

/**
 * Namespace i18n do MTM Funded e dos torneios.
 *
 * Os idiomas em falta caem para PT, por desenho do dicionário — e, nestas páginas, o seletor
 * do Google Translate cobre o resto enquanto a migração para dicionário nativo não chega a
 * cada componente. Este ficheiro é o que essa migração vai consumir, e já é a fonte das
 * peças de navegação.
 *
 * O que NÃO se traduz, de propósito: nomes de produtos («MTM Funded», «Trading Tournament»),
 * o texto do contrato (é um documento jurídico, e uma tradução aproximada de um contrato é
 * pior do que o original noutra língua) e os códigos de certificado.
 */
export const MTMFUNDED_MESSAGES: Partial<Record<Lang, Record<string, string>>> = {
  pt: {
    "mtmfunded.nav.programas": "Programas",
    "mtmfunded.nav.torneio": "Torneio",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "A minha área",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prova o que vales numa conta avaliada.",
    "mtmfunded.hero.sub":
      "Escolhes o tamanho, negoceias com as regras à vista, e as métricas actualizam sozinhas. Sem letra pequena e sem promessas de rendimento.",
    "mtmfunded.hero.ver": "Ver os programas",
    "mtmfunded.hero.torneio": "Torneio gratuito",

    "mtmfunded.facto.simuladas": "Contas simuladas",
    "mtmfunded.facto.simuladasNota":
      "Dinheiro virtual. Não há fundos de participantes em lado nenhum.",
    "mtmfunded.facto.regras": "Regras publicadas",
    "mtmfunded.facto.regrasNota": "Antes de te inscreveres, e não mudam a meio da prova.",
    "mtmfunded.facto.classificacao": "Classificação pública",
    "mtmfunded.facto.classificacaoNota":
      "Actualiza de hora a hora, com o motivo à vista de quem não conta.",

    "mtmfunded.escada.titulo": "Escolhe o tamanho — e o caminho",
    "mtmfunded.escada.conta": "Conta",
    "mtmfunded.escada.caminho": "Caminho",
    "mtmfunded.escada.objetivo": "Objectivo",
    "mtmfunded.escada.perdaDiaria": "Perda diária",
    "mtmfunded.escada.perdaMaxima": "Perda máxima",
    "mtmfunded.escada.diasMin": "Dias mín.",
    "mtmfunded.escada.preco": "Preço",
    "mtmfunded.escada.comecar": "Começar",
    "mtmfunded.escada.brevemente": "Brevemente",
    "mtmfunded.escada.umaFase": "1 fase · difícil",
    "mtmfunded.escada.duasFases": "2 fases",

    "mtmfunded.passos.titulo": "Como funciona",
    "mtmfunded.regras.titulo": "O que podes e não podes fazer",
    "mtmfunded.certificados.titulo": "Certificados",
    "mtmfunded.certificados.verificar": "verificar",
    "mtmfunded.certificados.exemplar": "exemplar",

    "mtmfunded.entrar.titulo": "Entrar",
    "mtmfunded.entrar.criar": "Criar conta",
    "mtmfunded.entrar.jaTenho": "Já tenho conta",
    "mtmfunded.entrar.naoTenho": "Ainda não tenho conta",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Palavra-passe",

    "mtmfunded.conta.primeiroNome": "Primeiro nome",
    "mtmfunded.conta.apelido": "Apelido",
    "mtmfunded.conta.pais": "País",
    "mtmfunded.conta.telemovel": "Telemóvel",
    "mtmfunded.conta.nascimento": "Data de nascimento",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Contas de Trading",
    "mtmfunded.painel.contratos": "Contratos",
    "mtmfunded.painel.levantamentos": "Levantamentos",
    "mtmfunded.painel.competicoes": "Competições",
    "mtmfunded.painel.classificacao": "Classificação",
    "mtmfunded.painel.terminal": "Terminal MTM",
    "mtmfunded.painel.certificados": "Certificados",
    "mtmfunded.painel.comunidade": "Comunidade",
    "mtmfunded.painel.apoio": "Apoio",

    "mtmfunded.levantar.pedir": "Pedir levantamento",
    "mtmfunded.levantar.disponivel": "Levantável",
    "mtmfunded.levantar.almofada": "Almofada (3%)",
    "mtmfunded.levantar.copiar": "copiar",
    "mtmfunded.levantar.copiado": "copiado",

    "mtmfunded.rodape.produto": "Produto",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Aviso de risco",
  },
  en: {
    "mtmfunded.nav.programas": "Programs",
    "mtmfunded.nav.torneio": "Tournament",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "My area",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prove what you're worth on an evaluated account.",
    "mtmfunded.hero.sub":
      "You pick the size, you trade with the rules in plain sight, and the metrics update on their own. No small print and no promises of returns.",
    "mtmfunded.hero.ver": "See the programs",
    "mtmfunded.hero.torneio": "Free tournament",

    "mtmfunded.facto.simuladas": "Simulated accounts",
    "mtmfunded.facto.simuladasNota": "Virtual money. No participant funds are held anywhere.",
    "mtmfunded.facto.regras": "Published rules",
    "mtmfunded.facto.regrasNota": "Before you sign up, and they don't change mid-challenge.",
    "mtmfunded.facto.classificacao": "Public leaderboard",
    "mtmfunded.facto.classificacaoNota":
      "Updated hourly, and it says why anyone isn't counting yet.",

    "mtmfunded.escada.titulo": "Pick the size — and the path",
    "mtmfunded.escada.conta": "Account",
    "mtmfunded.escada.caminho": "Path",
    "mtmfunded.escada.objetivo": "Target",
    "mtmfunded.escada.perdaDiaria": "Daily loss",
    "mtmfunded.escada.perdaMaxima": "Max loss",
    "mtmfunded.escada.diasMin": "Min. days",
    "mtmfunded.escada.preco": "Price",
    "mtmfunded.escada.comecar": "Start",
    "mtmfunded.escada.brevemente": "Coming soon",
    "mtmfunded.escada.umaFase": "1 phase · hard",
    "mtmfunded.escada.duasFases": "2 phases",

    "mtmfunded.passos.titulo": "How it works",
    "mtmfunded.regras.titulo": "What you can and can't do",
    "mtmfunded.certificados.titulo": "Certificates",
    "mtmfunded.certificados.verificar": "verify",
    "mtmfunded.certificados.exemplar": "sample",

    "mtmfunded.entrar.titulo": "Sign in",
    "mtmfunded.entrar.criar": "Create account",
    "mtmfunded.entrar.jaTenho": "I already have an account",
    "mtmfunded.entrar.naoTenho": "I don't have an account yet",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Password",

    "mtmfunded.conta.primeiroNome": "First name",
    "mtmfunded.conta.apelido": "Last name",
    "mtmfunded.conta.pais": "Country",
    "mtmfunded.conta.telemovel": "Mobile phone",
    "mtmfunded.conta.nascimento": "Date of birth",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Trading Accounts",
    "mtmfunded.painel.contratos": "Contracts",
    "mtmfunded.painel.levantamentos": "Withdrawals",
    "mtmfunded.painel.competicoes": "Competitions",
    "mtmfunded.painel.classificacao": "Leaderboard",
    "mtmfunded.painel.terminal": "MTM Terminal",
    "mtmfunded.painel.certificados": "Certificates",
    "mtmfunded.painel.comunidade": "Community",
    "mtmfunded.painel.apoio": "Support",

    "mtmfunded.levantar.pedir": "Request withdrawal",
    "mtmfunded.levantar.disponivel": "Withdrawable",
    "mtmfunded.levantar.almofada": "Cushion (3%)",
    "mtmfunded.levantar.copiar": "copy",
    "mtmfunded.levantar.copiado": "copied",

    "mtmfunded.rodape.produto": "Product",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Risk warning",
  },
}
