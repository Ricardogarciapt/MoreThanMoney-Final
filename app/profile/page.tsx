import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"
import ProfilePage from "@/components/profile-page"

export default function Profile() {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <ProfilePage />
    </AuthProvider>
  )
}
