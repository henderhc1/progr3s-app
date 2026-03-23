import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { PageShell } from "@/components/ui/PageShell";
import { createUserShellNav } from "@/components/ui/NavBar";
import { requireUserPageIdentity } from "@/lib/session";

export default async function DashboardPage() {
  const identity = await requireUserPageIdentity();

  return (
    <PageShell nav={createUserShellNav("dashboard")}>
      <DashboardClient userName={identity.name} userUsername={identity.username} />
    </PageShell>
  );
}
