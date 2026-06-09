import * as React from "react"
import { subscribeMediaQueryChange } from "@/lib/browser-compat"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return subscribeMediaQueryChange(mql, onChange)
  }, [])

  return !!isMobile
}
