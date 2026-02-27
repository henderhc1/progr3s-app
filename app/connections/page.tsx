import { redirect } from "next/navigation";
import { ConnectionsClient } from "@/components/connections/ConnectionsClient";
import { NavBar } from "@/components/ui/NavBar";
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
    <main className="page-wrap">
      <NavBar
        ctaLabel="Logout"
        ctaHref="/api/auth/logout"
        showMarketingLinks={false}
        showAdminLink={false}
        showUserLinks
        activeUserLink="connections"
      />
      <ConnectionsClient />
    </main>
  );
}
