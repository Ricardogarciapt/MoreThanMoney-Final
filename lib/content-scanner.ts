// Scanner de conteúdo do site - extrai todos os vídeos e links
export interface ContentItem {
  id: string
  type: 'video' | 'link'
  location: string // Página onde está localizado
  title: string
  url: string
  description?: string
  autoplay?: boolean
  controls?: boolean
}

export const siteContent: ContentItem[] = [
  // NEW LANDING
  {
    id: 'new-landing-main-video',
    type: 'video',
    location: '/new-landing',
    title: 'Vídeo de Apresentação Principal',
    url: 'https://youtu.be/dgd0-mLIrMw',
    description: 'Vídeo principal da landing page',
    autoplay: true,
    controls: false
  },
  
  // IQONIC
  {
    id: 'iqonic-presentation-video',
    type: 'video',
    location: '/iqonic',
    title: 'Apresentação IQONIC',
    url: 'https://youtu.be/RQIimjljeMI',
    description: 'Vídeo de apresentação da plataforma IQONIC',
    autoplay: false,
    controls: true
  },
  {
    id: 'iqonic-registration-link',
    type: 'link',
    location: '/iqonic',
    title: 'Registo IQONIC',
    url: 'https://iqonic.life/morethanmoney',
    description: 'Link para registo na plataforma IQONIC'
  },
  {
    id: 'iqonic-whatsapp-link',
    type: 'link',
    location: '/iqonic',
    title: 'WhatsApp IQONIC',
    url: 'https://wa.me/message/5NMUP53HEXVMB1',
    description: 'Link para contacto via WhatsApp'
  },
  {
    id: 'iqonic-academy-link',
    type: 'link',
    location: '/iqonic',
    title: 'IQonic Academy',
    url: 'https://iqonic.vip',
    description: 'Link para IQonic Academy'
  },
  {
    id: 'iqonic-backoffice-link',
    type: 'link',
    location: '/iqonic',
    title: 'BackOffice IQ',
    url: 'https://user.iqonic.life',
    description: 'Link para BackOffice IQONIC'
  },
  
  // ONBOARDING
  {
    id: 'onboarding-video',
    type: 'video',
    location: '/onboarding',
    title: 'Vídeo de Onboarding',
    url: 'https://youtu.be/q-23MppHFDI',
    description: 'Vídeo explicativo do processo de onboarding',
    autoplay: false,
    controls: true
  },
  {
    id: 'onboarding-playlist',
    type: 'video',
    location: '/onboarding',
    title: 'Playlist Fast Start Educativo',
    url: 'https://www.youtube.com/watch?v=RQ0CI0jWAnM&list=PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu',
    description: 'Playlist completa de onboarding educativo',
    autoplay: false,
    controls: true
  },
  {
    id: 'onboarding-calendly-link',
    type: 'link',
    location: '/onboarding',
    title: 'Agendar Onboarding',
    url: 'https://calendly.com/morethanmoneypt/onboarding-de-novos-membros',
    description: 'Link para agendar onboarding via Calendly'
  },
  {
    id: 'onboarding-international-link',
    type: 'link',
    location: '/onboarding',
    title: 'Equipa Internacional',
    url: 'https://www.visionxambition.com',
    description: 'Link para equipa internacional'
  },
  
  // FAST START
  {
    id: 'fast-start-step1-video',
    type: 'video',
    location: '/fast-start',
    title: 'Sistema MoreThanMoney',
    url: 'https://youtu.be/TJ_1rvK-DgY',
    description: 'Vídeo explicativo do sistema - Passo 1',
    autoplay: false,
    controls: true
  },
  {
    id: 'fast-start-step4-video1',
    type: 'video',
    location: '/fast-start',
    title: 'Onboarding Rápido',
    url: 'https://youtu.be/q-23MppHFDI',
    description: 'Vídeo de onboarding - Passo 4',
    autoplay: false,
    controls: true
  },
  {
    id: 'fast-start-step4-playlist',
    type: 'video',
    location: '/fast-start',
    title: 'Fast Start Educativo - Playlist',
    url: 'https://www.youtube.com/watch?v=RQ0CI0jWAnM&list=PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu',
    description: 'Playlist educativa completa - Passo 4',
    autoplay: false,
    controls: true
  },
  {
    id: 'fast-start-presentation-video',
    type: 'video',
    location: '/fast-start',
    title: 'Apresentação do Negócio',
    url: 'https://www.youtube.com/watch?v=HemX7AlLhqg&t=3s',
    description: 'Vídeo de apresentação do negócio MoreThanMoney',
    autoplay: false,
    controls: true
  },
  {
    id: 'fast-start-mindset-video',
    type: 'video',
    location: '/fast-start',
    title: 'Mindset Calvin Becerra',
    url: 'https://www.youtube.com/watch?v=LqlJTEa3cFU',
    description: 'Vídeo sobre mindset e mentalidade empreendedora',
    autoplay: false,
    controls: true
  },
  {
    id: 'fast-start-whatsapp-community',
    type: 'link',
    location: '/fast-start',
    title: 'Comunidade WhatsApp',
    url: 'https://chat.whatsapp.com/CBBUkRWAJnfJgFseTaoSFT?mode=wwt',
    description: 'Grupo de WhatsApp da comunidade - Passo 2'
  },
  {
    id: 'fast-start-presentation-slides',
    type: 'link',
    location: '/fast-start',
    title: 'Apresentação Google Slides',
    url: 'https://docs.google.com/presentation/d/1dgfNVp4J4ok6ZrkLk3q54rux_0rSCVfanRYITXC1_pI/edit?slide=id.g3401419a59b_0_233',
    description: 'Slides de apresentação do negócio - Passo 5'
  },
  {
    id: 'fast-start-ebook-link',
    type: 'link',
    location: '/fast-start',
    title: 'Ebook Mercados Financeiros',
    url: 'https://drive.google.com/file/d/1weh_pjUMIje370wSw7o3OnojcR1zsoqy/view?usp=sharing',
    description: 'Ebook sobre mercados financeiros'
  },
  
  // SWIPE TO TRADE
  {
    id: 'swipetotrade-tutorial-video',
    type: 'video',
    location: '/swipetotrade',
    title: 'Como Aceitar uma Trade',
    url: 'https://youtu.be/TxQS2GW5NkE',
    description: 'Tutorial de como aceitar trades no IQ Sync',
    autoplay: true,
    controls: true
  },
  {
    id: 'swipetotrade-platform-link',
    type: 'link',
    location: '/swipetotrade',
    title: 'Plataforma IQ Sync',
    url: 'https://trading.iqonic.life',
    description: 'Link para plataforma de trading IQONIC'
  },
  {
    id: 'swipetotrade-whatsapp-link',
    type: 'link',
    location: '/swipetotrade',
    title: 'WhatsApp Especialista',
    url: 'https://api.whatsapp.com/send/?phone=351912666699&text=Ola%20Gostaria%20de%20saber%20mais%20sobre%20o%20Swipe%20to%20Trade',
    description: 'Link para falar com especialista'
  },
  {
    id: 'swipetotrade-app-android',
    type: 'link',
    location: '/swipetotrade',
    title: 'App IQ Sync - Android',
    url: 'https://play.google.com/store/apps/details?id=com.iqonic.trading',
    description: 'Download da app para Android'
  },
  {
    id: 'swipetotrade-app-ios',
    type: 'link',
    location: '/swipetotrade',
    title: 'App IQ Sync - iOS',
    url: 'https://apps.apple.com/pt/app/iq-sync/id6744239083',
    description: 'Download da app para iOS'
  },
  
  // SCANNER
  {
    id: 'scanner-whatsapp-access',
    type: 'link',
    location: '/scanner',
    title: 'WhatsApp Acesso Scanners',
    url: 'https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM',
    description: 'Link para solicitar acesso aos scanners'
  },
  
  // SCANNER ACCESS
  {
    id: 'scanner-access-trading-journal',
    type: 'link',
    location: '/scanner-access',
    title: 'Plano de Trading (Notion)',
    url: 'https://harmonious-comma-e85.notion.site/Trading-Journal-2025-cf6b2aa1b6594973b9554b33696667f1?pvs=73',
    description: 'Link para o plano de trading no Notion'
  },
  
  // AUTOMATION
  {
    id: 'automation-whatsapp-copytrading',
    type: 'link',
    location: '/automation',
    title: 'WhatsApp Copytrading',
    url: 'https://wa.me/message/5NMUP53HEXVMB1',
    description: 'Link para agendar apresentação de copytrading'
  },
  
  // EDUCATION LINKS (Navbar)
  {
    id: 'navbar-iqonic-academy',
    type: 'link',
    location: 'navbar',
    title: 'IQonic Academy',
    url: 'https://iqonic.vip',
    description: 'Link para IQonic Academy'
  },
  {
    id: 'navbar-educacao-mtm',
    type: 'link',
    location: 'navbar',
    title: 'Educação MTM (Skool)',
    url: 'https://www.skool.com/morethanmoney',
    description: 'Link para cursos MoreThanMoney no Skool'
  },
  {
    id: 'navbar-ai-gemeos',
    type: 'link',
    location: 'navbar',
    title: 'AI Com Os Gemeos',
    url: 'https://www.skool.com/ai-com-osgemeos/about?ref=bc17a1ec65954570926520a936f7355b',
    description: 'Link para comunidade AI com os Gêmeos'
  },
  {
    id: 'navbar-backoffice',
    type: 'link',
    location: 'navbar',
    title: 'BackOffice IQ',
    url: 'https://user.iqonic.life',
    description: 'Link para BackOffice IQONIC'
  }
]

export function getContentByLocation(location: string): ContentItem[] {
  return siteContent.filter(item => item.location === location)
}

export function getContentById(id: string): ContentItem | undefined {
  return siteContent.find(item => item.id === id)
}

export function getAllVideos(): ContentItem[] {
  return siteContent.filter(item => item.type === 'video')
}

export function getAllLinks(): ContentItem[] {
  return siteContent.filter(item => item.type === 'link')
}

export function getContentByType(type: 'video' | 'link'): ContentItem[] {
  return siteContent.filter(item => item.type === type)
}
