import { AdminPanelClient } from "@/components/admin/AdminPanelClient";
import { PageShell } from "@/components/ui/PageShell";
import { createAdminShellNav } from "@/components/ui/NavBar";
import { requireAdminPageIdentity } from "@/lib/session";

export default async function AdminPage() {
  const identity = await requireAdminPageIdentity();

  return (
    <PageShell nav={createAdminShellNav()}>
      <AdminPanelClient viewerEmail={identity.email} />
    </PageShell>
  );
}
