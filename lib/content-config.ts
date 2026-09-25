/**
 * Configuração central do conteúdo externo do site — editável em /admin?tab=content.
 *
 * 2026-08-27: saíram daqui 16 entradas que apontavam para páginas que já não existem — /iqonic e
 * /swipetotrade (removidas com o IQONIC) e /fast-start. Eram conteúdo editável de páginas que
 * ninguém consegue abrir: quem as editasse estava a trabalhar para um 404.
 *
 * REGRA: uma entrada nova tem de ter `page` a apontar para uma rota que exista. Quando uma página
 * for removida, as entradas dela saem daqui no mesmo passo.
 */

export interface VideoConfig {
  id: string
  title: string
  subtitle?: string
  description?: string
  videoId: string
  playlist?: string
  autoplay?: boolean
  page: string
  section: string
  sectionTitle?: string
  sectionSubtitle?: string
  sectionDescription?: string
}

export interface ExternalLinkConfig {
  id: string
  title: string
  subtitle?: string
  url: string
  type: 'whatsapp' | 'calendly' | 'website' | 'drive' | 'notion' | 'skool' | 'other'
  page: string
  section: string
  description?: string
  sectionTitle?: string
  sectionSubtitle?: string
  sectionDescription?: string
}

export interface ImageConfig {
  id: string
  title: string
  url: string
  alt: string
  page: string
  section: string
  width?: number
  height?: number
  description?: string
  sectionTitle?: string
  sectionSubtitle?: string
  sectionDescription?: string
}

export interface ContentConfig {
  videos: VideoConfig[]
  links: ExternalLinkConfig[]
  images: ImageConfig[]
}

// Configuração padrão (fallback se não houver no admin_settings)
export const defaultContentConfig: ContentConfig = {
  images: [
    // MTM PAGE IMAGES
    {
      id: 'mtm-problema',
      title: 'O Problema',
      url: '/MTM/Problema.png',
      alt: 'O Problema',
      page: '/mtm',
      section: 'O Diagnóstico',
      width: 1200,
      height: 600
    },
    {
      id: 'mtm-ecossistema',
      title: 'O Ecossistema',
      url: '/MTM/ecossistema-mtm.svg',
      alt: 'O Ecossistema',
      page: '/mtm',
      section: 'EARN WHILE YOU LEARN',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-estrategia-1',
      title: 'A Escada do Sucesso - Parte 1',
      url: '/MTM/A Escada Do Sucesso - Parte 1 .png',
      alt: 'A Escada do Sucesso - Parte 1',
      page: '/mtm',
      section: 'A Escada do Sucesso',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-estrategia-2',
      title: 'A Escada do Sucesso - Parte 2',
      url: '/MTM/Escada do Sucesso  - Parte 2.png',
      alt: 'A Escada do Sucesso - Parte 2',
      page: '/mtm',
      section: 'A Escada do Sucesso',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-escolha-caminho',
      title: 'Escolhe o Teu Caminho',
      url: '/MTM/escolha-caminho-mtm.svg',
      alt: 'Escolhe o Teu Caminho',
      page: '/mtm',
      section: 'As Soluções Tecnológicas',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-diferenca',
      title: 'A Diferença',
      url: '/MTM/A Diferença.png',
      alt: 'A Diferença',
      page: '/mtm',
      section: 'O Modelo de Negócio',
      width: 1400,
      height: 800
    }
  ],
  videos: [
    // 2026-09-16: saiu daqui a entrada `onboarding-playlist` («Fast Start Educativo — Playlist
    // Completa», secção "Video Modal" do /onboarding). Nenhuma página a lia — o /onboarding nunca
    // teve modal de vídeo — e o lugar dela é agora da sala «Introdução» do LMS, cuja playlist o
    // /onboarding abre de facto (components/intro/curso-introducao.tsx). Duas configurações para o
    // mesmo vídeo de arranque, uma delas invisível, é a receita para se editar a errada.

    // MTM PAGE
    {
      id: 'mtm-presentation',
      title: 'Apresentação MoreThanMoney',
      videoId: 'hKAQ72MsAwU',
      page: '/mtm',
      section: 'Video Modal',
      autoplay: true,
      description: 'Vídeo de apresentação do ecossistema MoreThanMoney'
    }
  ],
  
  links: [
    // WHATSAPP
    {
      id: 'whatsapp-scanners',
      title: 'WhatsApp Scanners MTM',
      url: 'https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM',
      type: 'whatsapp',
      page: '/scanner',
      section: 'Scanner Access',
      description: 'Solicitar acesso aos scanners'
    },
    {
      id: 'whatsapp-copytrading',
      title: 'WhatsApp Copytrading',
      url: 'https://wa.me/message/5NMUP53HEXVMB1',
      type: 'whatsapp',
      page: '/automation',
      section: 'Copytrading Card',
      description: 'Agendar apresentação de copytrading'
    },
    
    // CALENDLY
    {
      id: 'calendly-onboarding',
      title: 'Agendar Onboarding',
      url: 'https://calendly.com/morethanmoneypt/onboarding-de-novos-membros',
      type: 'calendly',
      page: '/onboarding',
      section: 'Hero',
      description: 'Agendar sessão de onboarding personalizado'
    },
    
    // WEBSITES EXTERNOS
    {
      id: 'vision-ambition',
      title: 'Equipa Internacional',
      url: 'https://www.visionxambition.com',
      type: 'website',
      page: '/onboarding',
      section: 'International Onboarding',
      description: 'Onboarding internacional'
    },
    
    // SKOOL
    {
      id: 'skool-morethanmoney',
      title: 'Cursos MoreThanMoney (Skool)',
      url: 'https://www.skool.com/morethanmoney-1132/about',
      type: 'skool',
      page: '/new-landing',
      section: 'Community Section',
      description: 'Bootcamp MoreThanMoney no Skool'
    },
    {
      id: 'skool-aigemeos',
      title: 'AI Com Os Gemeos (Skool)',
      url: 'https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b',
      type: 'skool',
      page: '/new-landing',
      section: 'Community Section',
      description: 'Comunidade AI Com Os Gémeos'
    },
    // Estas duas estavam sem `type`, `page` e `section` — e por isso não apareciam agrupadas em
    // sítio nenhum do painel: eram conteúdo que existia no código e que ninguém conseguia editar.
    {
      id: 'skool-mtm-hero',
      title: 'Comunidade Skool MoreThanMoney',
      url: 'https://www.skool.com/morethanmoney-1132/about',
      type: 'skool',
      page: '/new-landing',
      section: 'Community Section',
      description: 'Acesso gratuito à comunidade Skool - CTA principal'
    },
    {
      id: 'skool-mtm-cta',
      title: 'Começar no Skool',
      url: 'https://www.skool.com/morethanmoney-1132/about',
      type: 'skool',
      page: '/new-landing',
      section: 'Community Section',
      description: 'CTA final para acesso ao Skool'
    },
    
    // GOOGLE DRIVE
    
    // NOTION
    {
      id: 'notion-trading-journal',
      title: 'Trading Journal 2025',
      url: 'https://harmonious-comma-e85.notion.site/Trading-Journal-2025-cf6b2aa1b6594973b9554b33696667f0?pvs=73',
      type: 'notion',
      page: '/scanner-access',
      section: 'Trading Plan',
      description: 'Plano de trading completo'
    },
    
    // TRADINGVIEW
    {
      id: 'tradingview-goldkiller',
      title: 'MTM Gold Killer no TradingView',
      url: 'https://www.tradingview.com/script/fhpIupC5-MTM-Gold-Killer-V2-1/',
      type: 'other',
      page: '/scanner/mtm-gold-killer',
      section: 'Scanner Info',
      description: 'Ver scanner no TradingView'
    },
    
    // IMAGENS DOS SCANNERS
    {
      id: 'scanner-goldkiller-image',
      title: 'Imagem Scanner Gold Killer',
      url: 'https://www.tradingview.com/x/5U2bzsHF/',
      type: 'other',
      page: '/scanner',
      section: 'Gold Killer Card',
      description: 'Preview do Gold Killer'
    },
    {
      id: 'scanner-v34-image',
      title: 'Imagem Scanner V3.4',
      url: 'https://www.tradingview.com/x/ZPM47fOg/',
      type: 'other',
      page: '/scanner',
      section: 'Scanner MTM V3.4 Card',
      description: 'Preview do Scanner V3.4'
    }
  ]
}

