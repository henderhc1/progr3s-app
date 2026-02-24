import Link from "next/link";
import { cookies } from "next/headers";
import { InfoCard } from "@/components/ui/InfoCard";
import { HomeWelcomeTransition } from "@/components/ui/HomeWelcomeTransition";
import { NavBar } from "@/components/ui/NavBar";
import { ProgressPlayground } from "@/components/ui/ProgressPlayground";
import { readEmailFromSession, SESSION_COOKIE_NAME } from "@/lib/auth";

const features = [
  {
    title: "Action-first planning",
    body: "Break goals into concrete daily tasks and keep your momentum visible.",
  },
  {
    title: "Live progress signal",
    body: "View streak health, output trends, and blocker alerts in one place.",
  },
  {
    title: "Team-ready structure",
    body: "A starter layout that can grow into roles, projects, and reporting.",
  },
];

export default async function Home() {
  // Server-side cookie read lets us adapt nav based on login state.
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionEmail = readEmailFromSession(rawSession);
  const hasSession = !!sessionEmail;

  // Home stays a server component while rendering client components below.
  return (
    <HomeWelcomeTransition>
      <main className="page-wrap">
        <NavBar ctaLabel={hasSession ? "Open Dashboard" : "Login"} ctaHref={hasSession ? "/dashboard" : "/login"} />

        <section className="hero shell-card">
          <div>
            <p className="eyebrow">Productivity Operating System</p>
            <h1>Progress tracking that feels modern, calm, and practical.</h1>
            <p className="lead">
              This starter gives you a clean base to keep shipping: landing sections, auth UI, and an API endpoint.
            </p>

            <div className="hero__cta">
              <Link href={hasSession ? "/dashboard" : "/signup"} className="btn btn--primary">
                {hasSession ? "Open dashboard" : "Create account"}
              </Link>
              <Link href="/login" className="btn btn--ghost">
                Log in
              </Link>
            </div>
          </div>

          <aside className="stat-panel">
            <h2>Starter status</h2>
            <ul>
              <li>
                <span>UI foundation</span>
                <strong>Done</strong>
              </li>
              <li>
                <span>Login view</span>
                <strong>Done</strong>
              </li>
              <li>
                <span>Auth API draft</span>
                <strong>Done</strong>
              </li>
              <li>
                <span>Database & sessions</span>
                <strong>In progress</strong>
              </li>
            </ul>
          </aside>
        </section>

        <section id="features" className="section-grid">
          {features.map((feature) => (
            <InfoCard key={feature.title} title={feature.title} body={feature.body} />
          ))}
        </section>

        <section id="workflow" className="workflow shell-card">
          <h2>How this can evolve</h2>
          <ol>
            <li>Create user account and secure session storage.</li>
            <li>Add dashboard cards for goals, tasks, and streak reports.</li>
            <li>Connect data layer and move mock API responses to real logic.</li>
          </ol>
        </section>

        {/* Interactive section so the landing page feels more alive. */}
        <ProgressPlayground />

        <section id="pricing" className="shell-card teaser">
          <h2>Template-ready pricing area</h2>
          <p>
            Placeholder pricing content so you can shape product tiers later without redesigning the page.
          </p>
        </section>
      </main>
    </HomeWelcomeTransition>
  );
}
