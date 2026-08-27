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

export default nextConfig
