import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { DashboardWelcomeTransition } from "@/components/dashboard/DashboardWelcomeTransition";
import { NavBar } from "@/components/ui/NavBar";
import { getSessionIdentity } from "@/lib/session";

export default async function DashboardPage() {
  const identity = await getSessionIdentity();

  if (!identity) {
    redirect("/login");
  }

  return (
    <main className="page-wrap">
      <NavBar
        ctaLabel="Logout"
        ctaHref="/api/auth/logout"
        showMarketingLinks={false}
        showAdminLink={identity.role === "admin"}
      />
      <DashboardWelcomeTransition userName={identity.name}>
        <DashboardClient userName={identity.name} userEmail={identity.email} />
      </DashboardWelcomeTransition>
    </main>
  );
}
