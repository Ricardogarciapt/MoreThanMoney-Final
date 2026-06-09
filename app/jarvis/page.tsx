import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata = {
  title: "JARVIS — MTM AI OS",
  description: "MoreThanMoney AI Operating System",
}

export default async function JarvisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/jarvis")
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#050810" }}>
      <iframe
        src="/aios/index.html"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
        allow="microphone; autoplay"
        title="JARVIS MTM AI OS"
      />
    </div>
  )
}
