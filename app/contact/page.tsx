import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { createMarketingPageNav } from "@/components/ui/NavBar";
import { SUPPORT_EMAIL } from "@/components/ui/SiteFooter";

const contactRows = [
  {
    title: "Product questions",
    body: "Questions about the MVP, roadmap direction, or how the workflow is intended to be used.",
  },
  {
    title: "Account support",
    body: "Trouble signing in, confusion about routines or goal sharing, or issues with task verification.",
  },
  {
    title: "Partnerships",
    body: "Feedback, pilot interest, or accountability and coaching partnerships.",
  },
];

export default function ContactPage() {
  return (
    <PageShell nav={createMarketingPageNav("contact")} showFooter>
      <section className="marketing-hero shell-card">
        <p className="eyebrow">Contact</p>
        <h1>Reach the team behind Progr3s.</h1>
        <p className="lead">
          For this MVP, the simplest path is direct email. Use the address below for questions, support, or feedback.
        </p>
        <div className="marketing-actions">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn--primary">
            Email {SUPPORT_EMAIL}
          </a>
          <Link href="/signup" className="btn btn--ghost">
            Create an account
          </Link>
        </div>
      </section>

      <section className="marketing-section shell-card">
        <div className="marketing-section__header">
          <p className="eyebrow">Get in touch</p>
          <h2>Use one contact path, fast.</h2>
        </div>
        <div className="marketing-grid">
          {contactRows.map((row) => (
            <article key={row.title} className="info-card">
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section shell-card">
        <div className="marketing-copy">
          <p className="eyebrow">Before you email</p>
          <h2>A few quick routes</h2>
          <ul className="marketing-list">
            <li>Returning users can go straight to the <Link href="/login">login page</Link>.</li>
            <li>New users can create an account on the <Link href="/signup">signup page</Link>.</li>
            <li>For product context and positioning, visit the <Link href="/about">About page</Link>.</li>
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
