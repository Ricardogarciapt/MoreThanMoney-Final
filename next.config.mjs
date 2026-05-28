import webpack from 'webpack'

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
  serverExternalPackages: ["ssh2"],
  webpack: (config) => {
    // The dynamic `import(`@capacitor/${plugin}`)` in use-capacitor.ts causes webpack
    // to create a context module that pulls in ALL @capacitor files, including
    // non-JS binary/config files from @capacitor/android. IgnorePlugin prevents this.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.(pro|xml|gradle|java|kt|plist|md)$/,
        contextRegExp: /@capacitor/,
      })
    )
    return config
  },
}

export default nextConfig
