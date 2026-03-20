import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { PageShell } from "@/components/ui/PageShell";
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
    <PageShell
      nav={{
        ctaLabel: "Logout",
        ctaHref: "/api/auth/logout",
        showMarketingLinks: false,
        showAdminLink: false,
        showUserLinks: true,
        activeUserLink: "settings",
      }}
    >
      <SettingsClient
        profile={{
          name: identity.name,
          username: identity.username,
          email: identity.email,
        }}
      />
    </PageShell>
  );
}
