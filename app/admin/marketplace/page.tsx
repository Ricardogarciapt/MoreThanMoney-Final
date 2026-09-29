import { redirect } from "next/navigation"

/**
 * O Marketplace do admin vive em /admin?tab=marketplace, ao lado do resto do admin. Esta página
 * existiu durante umas horas como ecrã próprio e pode estar em favoritos e em links já escritos —
 * reencaminha em vez de dar 404.
 */
export default function MarketplaceRedirect() {
  redirect("/admin?tab=marketplace")
}
