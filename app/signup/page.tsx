import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/ui/NavBar";
import { SignupForm } from "@/components/ui/SignupForm";
import { readEmailFromSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export default async function SignupPage() {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionEmail = readEmailFromSession(rawSession);

  if (sessionEmail) {
    redirect("/dashboard");
  }

  return (
    <main className="page-wrap">
      <NavBar ctaLabel="Back Home" ctaHref="/" showMarketingLinks={false} />

      <section className="login shell-card">
        <div className="login__intro">
          <p className="eyebrow">Create account</p>
          <h1>Start your progress workspace.</h1>
          <p>Sign up with name, email, and password. You will be signed in automatically.</p>
        </div>

        <SignupForm />
      </section>
    </main>
  );
}
