import { redirect } from "next/navigation";
import { AdminPanelClient } from "@/components/admin/AdminPanelClient";
import { PageShell } from "@/components/ui/PageShell";
import { getSessionIdentity } from "@/lib/session";

export default async function AdminPage() {
  const identity = await getSessionIdentity();

  if (!identity) {
    redirect("/login");
  }

  if (identity.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <PageShell nav={{ ctaLabel: "Logout", ctaHref: "/api/auth/logout", showMarketingLinks: false, showAdminLink: false }}>
      <AdminPanelClient viewerEmail={identity.email} />
    </PageShell>
  );
}
