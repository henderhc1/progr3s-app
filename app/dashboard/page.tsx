import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { PageShell } from "@/components/ui/PageShell";
import { getSessionIdentity } from "@/lib/session";

export default async function DashboardPage() {
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
        activeUserLink: "dashboard",
      }}
    >
      <DashboardClient userName={identity.name} userUsername={identity.username} />
    </PageShell>
  );
}
