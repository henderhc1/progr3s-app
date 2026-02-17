import { redirect } from "next/navigation";
import { AdminPanelClient } from "@/components/admin/AdminPanelClient";
import { NavBar } from "@/components/ui/NavBar";
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
    <main className="page-wrap">
      <NavBar ctaLabel="Logout" ctaHref="/api/auth/logout" showMarketingLinks={false} showAdminLink={false} />
      <AdminPanelClient viewerEmail={identity.email} />
    </main>
  );
}
