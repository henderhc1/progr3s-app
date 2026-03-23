import { InfoCard } from "@/components/ui/InfoCard";
import { PageShell } from "@/components/ui/PageShell";
import { createMarketingPageNav } from "@/components/ui/NavBar";

const principles = [
  {
    title: "Clarity over clutter",
    body: "Goals, weekly routines, proof, and completion history should live in one place instead of across scattered tools.",
  },
  {
    title: "Consistency needs proof",
    body: "A task system is stronger when progress can be verified with photos, location, or a trusted connection.",
  },
  {
    title: "Accountability should stay simple",
    body: "Sharing and confirmations should feel lightweight enough to use every week, not like managing a project suite.",
  },
];

export default function AboutPage() {
  return (
    <PageShell nav={createMarketingPageNav("about")} showFooter>
      <section className="marketing-hero shell-card">
        <p className="eyebrow">About Progr3s</p>
        <h1>A progress workspace built for routines, goals, and accountability.</h1>
        <p className="lead">
          Progr3s is an MVP focused on helping people keep promises to themselves. It combines one-time goals, recurring
          routines, proof, peer confirmation, and visible history in a single workflow.
        </p>
      </section>

      <section className="marketing-section shell-card">
        <div className="marketing-section__header">
          <p className="eyebrow">Why it exists</p>
          <h2>Most productivity tools manage tasks. Few help you stay consistent.</h2>
        </div>
        <div className="section-grid section-grid--feature">
          {principles.map((principle) => (
            <InfoCard key={principle.title} title={principle.title} body={principle.body} />
          ))}
        </div>
      </section>

      <section className="marketing-section shell-card">
        <div className="marketing-copy">
          <p className="eyebrow">MVP Focus</p>
          <h2>What the product is trying to do well</h2>
          <p>
            The product is built around a simple promise: define work clearly, complete it consistently, and keep a
            trustworthy record of what actually happened.
          </p>
          <ul className="marketing-list">
            <li>Plan one-time goals and weekly routines in the same workspace.</li>
            <li>Break work into subtasks so progress feels concrete.</li>
            <li>Use proof and peer confirmation when consistency matters.</li>
            <li>Review completion history instead of relying on memory.</li>
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
