import Image from "next/image";
import { InfoCard } from "@/components/ui/InfoCard";
import { HomeWelcomeTransition } from "@/components/ui/HomeWelcomeTransition";
import { PageShell } from "@/components/ui/PageShell";
import { ProgressPlayground } from "@/components/ui/ProgressPlayground";
import { getSessionIdentity } from "@/lib/session";

const features = [
  {
    title: "Goals and routines in one place",
    body: "Track one-time goals and weekly routines in one clean workspace.",
  },
  {
    title: "Proof that stays useful",
    body: "Use photo, location, or connection approval with a clear activity trail.",
  },
  {
    title: "Built for consistency",
    body: "Break work into subtasks and keep your streak visible every day.",
  },
];

const visualStories = [
  {
    label: "Goal",
    title: "LeetCode problem solved",
    imageSrc: "/landing-goal-leetcode.png",
    imageAlt: "A person working on a coding problem at a laptop as a one-time goal.",
    imageWidth: 800,
    imageHeight: 800,
    maxDisplayPx: 390,
  },
  {
    label: "Routine",
    title: "Gym days completed",
    imageSrc: "/landing-routine.png",
    imageAlt: "A person following a gym routine and lifting weights.",
    imageWidth: 612,
    imageHeight: 408,
    maxDisplayPx: 380,
  },
  {
    label: "Outcome",
    title: "Confidence from consistency",
    imageSrc: "/landing-outcome-v2.png",
    imageAlt: "A happy person celebrating after achieving goals and routines.",
    imageWidth: 360,
    imageHeight: 248,
    maxDisplayPx: 360,
    preserveOriginal: true,
  },
];

const stickyNotes = [
  { text: "Dream Big", tone: "dream" },
  { text: "Set Goals", tone: "goals" },
  { text: "Take Action", tone: "action" },
] as const;

export default async function Home() {
  const identity = await getSessionIdentity();
  const hasSession = !!identity;
  const dashboardHref = identity?.role === "admin" ? "/admin" : "/dashboard";
  const homeNav = hasSession
    ? { ctaLabel: "Open Dashboard", ctaHref: dashboardHref }
    : { showAuthCtas: true };

  return (
    <HomeWelcomeTransition>
      <PageShell nav={homeNav}>

        <section className="hero shell-card">
          <div>
            <p className="eyebrow">Routines + Goals {"\u2728"}</p>
            <p className="app-motto">Plan it. Prove it. Keep the streak alive.</p>
            <h1>Stay consistent with goals and routines you can actually keep.</h1>
            <p className="lead">
              Plan weekly routines and one-time goals, then track progress with clear proof and history.
            </p>
          </div>

          <aside className="stat-panel">
            <div className="hero__notes hero__notes--right" aria-label="Motivation sticky notes">
              {stickyNotes.map((note) => (
                <p key={note.text} className={`sticky-note sticky-note--${note.tone}`}>
                  {note.text}
                </p>
              ))}
            </div>
            <h2>Core Actions</h2>
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

          <div className="hero__stories" aria-label="Visual examples of goals, routines, and outcomes">
            {visualStories.map((story) => (
              <article key={story.title} className="hero-story-card">
                <div className="hero-story-card__media">
                  <Image
                    src={story.imageSrc}
                    alt={story.imageAlt}
                    width={story.imageWidth}
                    height={story.imageHeight}
                    sizes={`(max-width: 620px) 100vw, (max-width: 920px) 48vw, ${story.maxDisplayPx}px`}
                    quality={story.preserveOriginal ? 100 : 92}
                    unoptimized={story.preserveOriginal}
                  />
                </div>
                <div className="hero-story-card__content">
                  <p className="hero-story-card__label">{story.label}</p>
                  <p className="hero-story-card__title">{story.title}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="feature-strip shell-card">
          <div className="section-grid section-grid--feature">
            {features.map((feature) => (
              <InfoCard key={feature.title} title={feature.title} body={feature.body} />
            ))}
          </div>
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
      </PageShell>
    </HomeWelcomeTransition>
  );
}
