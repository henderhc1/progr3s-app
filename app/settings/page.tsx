import { SettingsClient } from "@/components/settings/SettingsClient";
import { PageShell } from "@/components/ui/PageShell";
import { createUserShellNav } from "@/components/ui/NavBar";
import { requireUserPageIdentity } from "@/lib/session";

export default async function SettingsPage() {
  const identity = await requireUserPageIdentity();

  return (
    <PageShell nav={createUserShellNav("settings")}>
      <SettingsClient
        profile={{
          name: identity.name,
          username: identity.username,
          email: identity.email,
        }}
      />
    </PageShell>
  );
}
