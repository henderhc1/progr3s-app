import { redirect } from "next/navigation";
import { ConnectionsClient } from "@/components/connections/ConnectionsClient";
import { PageShell } from "@/components/ui/PageShell";
import { getSessionIdentity } from "@/lib/session";

export default async function ConnectionsPage() {
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
        activeUserLink: "connections",
      }}
    >
      <ConnectionsClient />
    </PageShell>
  );
}
