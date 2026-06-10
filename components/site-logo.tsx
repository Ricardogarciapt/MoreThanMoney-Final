"use client"

import { SITE_LOGO_PATH } from "@/lib/site-logo"

type SiteLogoProps = {
  className?: string
  width?: number
  height?: number
  priority?: boolean
  alt?: string
}

/** Logo MTM — sempre `/icon-512x512.png` (Safari-friendly vs next/image). */
export function SiteLogo({
  className = "rounded-lg",
  width = 40,
  height = 40,
  priority = false,
  alt = "MoreThanMoney",
}: SiteLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SITE_LOGO_PATH}
      alt={alt}
      width={width}
      height={height}
      className={className}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  )
}
