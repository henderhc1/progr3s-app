import { redirect } from "next/navigation";
import { NavBar } from "@/components/ui/NavBar";
import { LoginForm } from "@/components/ui/LoginForm";
import { getSessionIdentity } from "@/lib/session";

export default async function LoginPage() {
  const identity = await getSessionIdentity();

  if (identity) {
    redirect(identity.role === "admin" ? "/admin" : "/dashboard");
  }

  // Server page wrapper around a client form component.
  return (
    <main className="page-wrap">
      <NavBar ctaLabel="Back Home" ctaHref="/" showMarketingLinks={false} />

      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Welcome back {"\uD83D\uDC4B"}</p>
          <h1>Log in to continue building progress.</h1>
          <p>Use your account credentials. If you are new, create an account first.</p>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
