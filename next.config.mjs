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
