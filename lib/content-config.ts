// Configuração centralizada de todo o conteúdo externo do site
// Gerenciável através do painel de admin

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
      url: '/mtm/Problema.png',
      alt: 'O Problema',
      page: '/mtm',
      section: 'O Diagnóstico',
      width: 1200,
      height: 600
    },
    {
      id: 'mtm-ecossistema',
      title: 'O Ecossistema',
      url: '/mtm/Ecossistema.png',
      alt: 'O Ecossistema',
      page: '/mtm',
      section: 'EARN WHILE YOU LEARN',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-estrategia',
      title: 'A Escada do Sucesso',
      url: '/mtm/Estratégia.png',
      alt: 'A Escada do Sucesso',
      page: '/mtm',
      section: 'A Escada do Sucesso',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-escolha-caminho',
      title: 'Escolhe o Teu Caminho',
      url: '/mtm/Escolha de Caminho.png',
      alt: 'Escolhe o Teu Caminho',
      page: '/mtm',
      section: 'As Soluções Tecnológicas',
      width: 1400,
      height: 800
    },
    {
      id: 'mtm-diferenca',
      title: 'A Diferença',
      url: '/mtm/Diferença.png',
      alt: 'A Diferença',
      page: '/mtm',
      section: 'O Modelo de Negócio',
      width: 1400,
      height: 800
    }
  ],
  videos: [
    // IQONIC
    {
      id: 'iqonic-presentation',
      title: 'Apresentação IQONIC',
      videoId: 'RQIimjljeMI',
      page: '/iqonic',
      section: 'Hero',
      autoplay: false
    },
    
    // ONBOARDING
    {
      id: 'onboarding-playlist',
      title: 'Fast Start Educativo - Playlist Completa',
      videoId: 'RQ0CI0jWAnM',
      playlist: 'PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu',
      page: '/onboarding',
      section: 'Video Modal',
      autoplay: true
    },
    
    // SWIPE TO TRADE
    {
      id: 'swipetotrade-tutorial',
      title: 'Como Aceitar uma Trade - Swipe to Trade',
      videoId: 'TxQS2GW5NkE',
      page: '/swipetotrade',
      section: 'Tutorial Modal',
      autoplay: true
    },
    
    // FAST START
    {
      id: 'faststart-sistema',
      title: 'Sistema MoreThanMoney',
      videoId: 'TJ_1rvK-DgY',
      page: '/fast-start',
      section: 'Step 1',
      autoplay: false
    },
    {
      id: 'faststart-chamada',
      title: 'Chamada Semanal MTM',
      videoId: 'q-23MppHFDI',
      page: '/fast-start',
      section: 'Step 4 - Chamada',
      autoplay: false
    },
    {
      id: 'faststart-educativo',
      title: 'Fast Start Educativo - Playlist',
      videoId: 'RQ0CI0jWAnM',
      playlist: 'PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu',
      page: '/fast-start',
      section: 'Step 4 - Educativo',
      autoplay: false
    },
    {
      id: 'faststart-apresentacao',
      title: 'Apresentação Completa MoreThanMoney',
      videoId: 'HemX7AlLhqg',
      page: '/fast-start',
      section: 'Apresentação do Negócio',
      autoplay: false
    },
    {
      id: 'faststart-mindset',
      title: 'Mindset IQONIC Vision',
      videoId: 'LqlJTEa3cFU',
      page: '/fast-start',
      section: 'Apresentação do Negócio',
      autoplay: false
    },
    
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
      id: 'whatsapp-iqonic',
      title: 'WhatsApp IQONIC',
      url: 'https://wa.me/message/5NMUP53HEXVMB1',
      type: 'whatsapp',
      page: '/iqonic',
      section: 'Primary CTA',
      description: 'Contacto direto para informações sobre IQONIC'
    },
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
      id: 'whatsapp-swipetotrade',
      title: 'WhatsApp Swipe to Trade',
      url: 'https://api.whatsapp.com/send/?phone=351912666699&text=Ola%20Gostaria%20de%20saber%20mais%20sobre%20o%20Swipe%20to%20Trade',
      type: 'whatsapp',
      page: '/swipetotrade',
      section: 'Contact Specialist',
      description: 'Falar com especialista sobre Swipe to Trade'
    },
    {
      id: 'whatsapp-community',
      title: 'Grupo WhatsApp Comunidade',
      url: 'https://chat.whatsapp.com/CBBUkRWAJnfJgFseTaoSFT?mode=wwt',
      type: 'whatsapp',
      page: '/fast-start',
      section: 'Step 2',
      description: 'Grupo de apoio direto'
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
      id: 'iqonic-registration',
      title: 'Registo IQONIC',
      url: 'https://iqonic.life/morethanmoney',
      type: 'website',
      page: '/iqonic',
      section: 'Secondary CTA',
      description: 'Registo direto na plataforma IQONIC'
    },
    {
      id: 'iqonic-academy',
      title: 'IQonic Academy',
      url: 'https://iqonic.vip',
      type: 'website',
      page: '/iqonic',
      section: 'Additional Resources',
      description: 'Plataforma de cursos IQONIC'
    },
    {
      id: 'iqonic-backoffice',
      title: 'BackOffice IQONIC',
      url: 'https://user.iqonic.life',
      type: 'website',
      page: '/iqonic',
      section: 'Additional Resources',
      description: 'Área de membros IQONIC'
    },
    {
      id: 'iqonic-trading',
      title: 'IQONIC Trading Platform',
      url: 'https://trading.iqonic.life',
      type: 'website',
      page: '/swipetotrade',
      section: 'Learn More CTA',
      description: 'Plataforma de trading IQONIC'
    },
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
      url: 'https://www.skool.com/morethanmoney/about?ref=8e3afe86cbc7407ca7b411cece0512bd',
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
    {
      id: 'skool-mtm-hero',
      title: 'Comunidade Skool MoreThanMoney',
      url: 'https://www.skool.com/morethanmoney',
      type: 'skool',
      page: '/mtm',
      section: 'Hero CTA',
      description: 'Acesso gratuito à comunidade Skool - CTA principal'
    },
    {
      id: 'skool-mtm-cta',
      title: 'Começar no Skool',
      url: 'https://www.skool.com/morethanmoney',
      type: 'skool',
      page: '/mtm',
      section: 'Final CTA',
      description: 'CTA final para acesso ao Skool'
    },
    
    // GOOGLE DRIVE
    {
      id: 'drive-ebook-forex',
      title: 'Ebook Introdução aos Mercados Financeiros',
      url: 'https://drive.google.com/file/d/1weh_pjUMIje370wSw7o3OnojcR1zsoqy/view?usp=sharing',
      type: 'drive',
      page: '/fast-start',
      section: 'Step 4 - Ebook',
      description: 'Ebook sobre mercados financeiros'
    },
    {
      id: 'drive-apresentacao',
      title: 'Apresentação do Negócio (Google Slides)',
      url: 'https://docs.google.com/presentation/d/1dgfNVp4J4ok6ZrkLk3q54rux_0rSCVfanRYITXC1_pI/edit?slide=id.g3401419a59b_0_233#slide=id.g3401419a59b_0_233',
      type: 'drive',
      page: '/fast-start',
      section: 'Step 5',
      description: 'Como apresentar o negócio'
    },
    
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

