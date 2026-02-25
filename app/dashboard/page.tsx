import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { NavBar } from "@/components/ui/NavBar";
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
    <main className="page-wrap">
      <NavBar
        ctaLabel="Logout"
        ctaHref="/api/auth/logout"
        showMarketingLinks={false}
        showAdminLink={false}
      />
      <DashboardClient userName={identity.name} userEmail={identity.email} />
    </main>
  );
}
