import { PageShell } from "@/components/ui/PageShell";
import { SignupForm } from "@/components/ui/SignupForm";
import { createMarketingPageNav } from "@/components/ui/NavBar";
import { redirectAuthenticatedUser } from "@/lib/session";

export default async function SignupPage() {
  await redirectAuthenticatedUser();

  return (
    <PageShell nav={{ ...createMarketingPageNav(), ctaLabel: "Login", ctaHref: "/login" }} showFooter>
      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Create your account</p>
          <h1>Start your progress workspace.</h1>
          <p>Sign up with name, email, username, and password. You will be signed in automatically.</p>
        </div>

        <SignupForm />
      </section>
    </PageShell>
  );
}
