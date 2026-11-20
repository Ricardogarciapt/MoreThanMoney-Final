import { redirect } from "next/navigation"

/** Os leads passaram a ser uma secção do Centro Social. A morada antiga continua a dar lá. */
export default function SocialLeadsPage() {
  redirect("/admin/social?s=leads")
}
