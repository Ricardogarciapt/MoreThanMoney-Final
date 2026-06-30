import { NextResponse } from 'next/server'

/** Digital Asset Links — Android App Links + Credential Sharing (pt.morethanmoney.app) */
const ASSET_LINKS = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'pt.morethanmoney.app',
      sha256_cert_fingerprints: [
        // Google Play App Signing
        '4E:0A:D3:F4:CD:95:F1:33:E8:35:18:ED:43:8D:5E:B7:CD:08:B9:5D:EA:77:7B:8E:8B:63:94:28:B6:C5:EC:B0',
        // Chave de assinatura do APK sideload (mtm-release-key.jks) — distribuído em /downloads
        'F4:0C:27:F8:98:47:13:74:8D:D5:C3:FE:2E:00:59:8B:ED:3C:80:A9:F6:39:24:56:F2:48:6B:A4:34:A4:4F:0F',
      ],
    },
  },
] as const

export function GET() {
  return NextResponse.json(ASSET_LINKS, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
