import Link from "next/link";
import { InfoCard } from "@/components/ui/InfoCard";
import { HomeWelcomeTransition } from "@/components/ui/HomeWelcomeTransition";
import { NavBar } from "@/components/ui/NavBar";
import { ProgressPlayground } from "@/components/ui/ProgressPlayground";
import { getSessionIdentity } from "@/lib/session";

const features = [
  {
    title: "Goals and routines in one place",
    body: "Track one-time goals and weekly routines without juggling multiple apps.",
  },
  {
    title: "Proof that stays useful",
    body: "Use photo, location, or connection approval, then keep lightweight proof history in your calendar.",
  },
  {
    title: "Built for consistency",
    body: "Break goals into subtasks, stay focused on daily actions, and keep your streak momentum visible.",
  },
];

const examples = [
  {
    title: "Gym routine",
    body: "Set Tue/Thu/Fri/Sat training days, track subtasks like Push/Pull/Legs, and repeat weekly.",
  },
  {
    title: "Coding routine",
    body: "Schedule Thu/Fri/Sat coding blocks with proof and confirmation from your network.",
  },
  {
    title: "One-time goal",
    body: "Track projects like homework or applications with subtasks until complete.",
  },
];

export default async function Home() {
  const identity = await getSessionIdentity();
  const hasSession = !!identity;
  const dashboardHref = identity?.role === "admin" ? "/admin" : "/dashboard";

  return (
    <HomeWelcomeTransition>
      <main className="page-wrap">
        <NavBar ctaLabel={hasSession ? "Open Dashboard" : "Login"} ctaHref={hasSession ? dashboardHref : "/login"} />

        <section className="hero shell-card">
          <div>
            <p className="eyebrow">Routines + Goals {"\u2728"}</p>
            <p className="app-motto">Plan it. Prove it. Keep the streak alive.</p>
            <h1>Stay consistent with goals and routines you can actually keep.</h1>
            <p className="lead">
              Build your weekly routines and one-time goals, add subtasks, and keep a clean verified history you can review anytime.
            </p>

            <div className="hero__cta">
              <Link href={hasSession ? dashboardHref : "/signup"} className="btn btn--primary">
                {hasSession ? "Open dashboard" : "Create account"}
              </Link>
              {!hasSession && (
                <Link href="/login" className="btn btn--ghost">
                  Log in
                </Link>
              )}
            </div>
          </div>

          <aside className="stat-panel">
            <h2>What You Can Do</h2>
            <ul>
              <li>
                <span>Create one-time goals</span>
                <strong>Homework, projects</strong>
              </li>
              <li>
                <span>Set weekly routines</span>
                <strong>Gym, coding, habits</strong>
              </li>
              <li>
                <span>Share with connections</span>
                <strong>Simple in-app requests</strong>
              </li>
              <li>
                <span>Review completion history</span>
                <strong>Calendar timeline</strong>
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
          <h2>How It Works</h2>
          <ol>
            <li>Add a goal (one-time) or routine (weekly reset).</li>
            <li>Break it into subtasks and pick your scheduled days.</li>
            <li>Choose verification type: photo, location, or share with a connection.</li>
            <li>Track confirmed completions in your calendar and keep progress moving.</li>
          </ol>
        </section>

        <ProgressPlayground />

        <section className="teaser shell-card">
          <h2>Popular Ways To Use Progr3s</h2>
          <div className="section-grid">
            {examples.map((example) => (
              <InfoCard key={example.title} title={example.title} body={example.body} />
            ))}
          </div>
        </section>
      </main>
    </HomeWelcomeTransition>
  );
}
