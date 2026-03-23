import { PageShell } from "@/components/ui/PageShell";
import { LoginForm } from "@/components/ui/LoginForm";
import { createMarketingPageNav } from "@/components/ui/NavBar";
import { redirectAuthenticatedUser } from "@/lib/session";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  // Server page wrapper around a client form component.
  return (
    <PageShell nav={{ ...createMarketingPageNav(), ctaLabel: "Sign up", ctaHref: "/signup" }} showFooter>
      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Welcome back</p>
          <h1>Log in to continue building progress.</h1>
          <p>Use your account credentials. If you are new, sign up first.</p>
        </div>

        <LoginForm />
      </section>
    </PageShell>
  );
}
