import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/ui/NavBar";
import { LoginForm } from "@/components/ui/LoginForm";
import { readEmailFromSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export default async function LoginPage() {
  // Prevent showing login form to users who already have a valid session.
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionEmail = readEmailFromSession(rawSession);

  if (sessionEmail) {
    redirect("/dashboard");
  }

  // Server page wrapper around a client form component.
  return (
    <main className="page-wrap">
      <NavBar ctaLabel="Back Home" ctaHref="/" showMarketingLinks={false} />

      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Welcome back</p>
          <h1>Log in to continue building progress.</h1>
          <p>
            Demo user: <strong>demo@progr3s.dev / progress123</strong>. Demo admin:{" "}
            <strong>admin@progr3s.dev / admin12345</strong>.
          </p>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
