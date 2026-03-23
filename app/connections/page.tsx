import { ConnectionsClient } from "@/components/connections/ConnectionsClient";
import { PageShell } from "@/components/ui/PageShell";
import { createUserShellNav } from "@/components/ui/NavBar";
import { requireUserPageIdentity } from "@/lib/session";

export default async function ConnectionsPage() {
  await requireUserPageIdentity();

  return (
    <PageShell nav={createUserShellNav("connections")}>
      <ConnectionsClient />
    </PageShell>
  );
}
