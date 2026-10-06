import { withOpinlyConfig } from '@opinly/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'iwscxotvmtkphajmasof.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  serverExternalPackages: ["ssh2", "metaapi.cloud-sdk", "pdfkit"],
  async redirects() {
    return [
      {
        // AIOS saiu do site (decisão do dono 06/10): links guardados de /aios e /jarvis vão para
        // o admin em vez de dar 404. O AIOS vive agora só localmente.
        source: '/aios/:path*',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/jarvis/:path*',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/logo-new.png',
        destination: '/icon-512x512.png',
        permanent: false,
      },
      {
        // Página /trading-ideas removida — encaminha para a homepage.
        source: '/trading-ideas',
        destination: '/',
        permanent: true,
      },
      {
        // Documentos legais da MTM Auto: vivem na app (é lá que são mantidos), mas os links que
        // vão para a App Store e para os clientes são do domínio da marca.
        source: '/mtmauto/legal/:caminho*',
        destination: 'https://mtm-auto.vercel.app/legal/:caminho*',
        permanent: false,
      },
      // ── MTM Copy descontinuado (fase 1) ─────────────────────────────────────────────────────
      // As páginas do MTM Copy passam a MTM Auto. 308 (permanente, mantém o método). As rotas
      // /api/mtmcopy/* NÃO entram aqui — as apps instaladas continuam a chamá-las (o caminho da
      // API é /api/mtmcopy, que não bate com '/mtmcopy/:caminho*').
      // As métricas não têm página própria no MTM Auto (o histórico vive dentro da app), por
      // isso vão também para /mtmauto.
      { source: '/mtmcopy', destination: '/mtmauto', statusCode: 308 },
      { source: '/mtmcopy/:caminho*', destination: '/mtmauto', statusCode: 308 },
      { source: '/app-mobile/mtmcopier', destination: '/mtmauto', statusCode: 308 },
      {
        // Atalho de marca para a app. É um REDIRECT, não um domínio: um domínio na Vercel é um
        // hostname, e um caminho não pode ser um. Para a app viver mesmo em morethanmoney.pt o
        // caminho certo é um subdomínio (app.morethanmoney.pt) apontado ao projeto mtm-auto.
        //
        // `?casa=1` diz à app que esta é a porta da MTM: apaga o cookie de um convite antigo,
        // para quem abre a app pelo site não a ver com a marca de um franchisado que espreitou
        // há três semanas. A marca só muda por convite.
        source: '/mtmautoapp',
        destination: 'https://mtm-auto.vercel.app/?casa=1',
        permanent: false,
      },
      {
        source: '/mtmautoapp/:caminho*',
        destination: 'https://mtm-auto.vercel.app/:caminho*',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/app-mobile',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ]
  },
}

// Blog Opinly: injeta env vars OPINLY_* e o rewrite /blog-images/* → cdn.opinly.ai/<namespace>.
export default withOpinlyConfig({
  blogPath: '/blog',
  imagesPath: '/blog-images',
  companyName: 'MoreThanMoney',
  cdnNamespace: 'fwjEFLvk0748WGopncr8A',
  siteUrl: 'https://www.morethanmoney.pt',
  // o projeto já corre com images.unoptimized — mantém coerência nas imagens do blog
  unoptimizedImages: true,
})(nextConfig)
