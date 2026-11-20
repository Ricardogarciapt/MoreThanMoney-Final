import { Suspense } from "react"
import CentroSocial from "@/components/admin/social/centro-social"

export const metadata = { title: "Centro Social · Admin MTM" }

export default function AdminSocialPage() {
  return (
    <Suspense>
      <CentroSocial />
    </Suspense>
  )
}
