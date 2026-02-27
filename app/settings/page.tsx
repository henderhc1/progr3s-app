import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { NavBar } from "@/components/ui/NavBar";
import { getSessionIdentity } from "@/lib/session";

export default async function SettingsPage() {
  const identity = await getSessionIdentity();

  if (!identity) {
    redirect("/login");
  }

  if (identity.role === "admin") {
    redirect("/admin");
  }

  return (
    <main className="page-wrap">
      <NavBar
        ctaLabel="Logout"
        ctaHref="/api/auth/logout"
        showMarketingLinks={false}
        showAdminLink={false}
        showUserLinks
        activeUserLink="settings"
      />

      <SettingsClient />
    </main>
  );
}
