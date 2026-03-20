import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SignupForm } from "@/components/ui/SignupForm";
import { getSessionIdentity } from "@/lib/session";

export default async function SignupPage() {
  const identity = await getSessionIdentity();

  if (identity) {
    redirect(identity.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <PageShell nav={{ ctaLabel: "Back Home", ctaHref: "/", showMarketingLinks: false }}>
      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Sign up {"\uD83D\uDE80"}</p>
          <h1>Start your progress workspace.</h1>
          <p>Sign up with name, email, username, and password. You will be signed in automatically.</p>
        </div>

        <SignupForm />
      </section>
    </PageShell>
  );
}
