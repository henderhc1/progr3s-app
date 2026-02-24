import Link from "next/link";
import { Progr3sLogo } from "@/components/ui/Progr3sLogo";

type NavBarProps = {
  ctaLabel?: string;
  ctaHref?: string;
  showMarketingLinks?: boolean;
  showAdminLink?: boolean;
};

export function NavBar({
  ctaLabel = "Login",
  ctaHref = "/login",
  showMarketingLinks = true,
  showAdminLink = false,
}: NavBarProps) {
  // Shared nav component so top-level pages stay visually consistent.
  return (
    <header className="topbar shell-card">
      <Link href="/" className="brand">
        <Progr3sLogo />
      </Link>

      {showMarketingLinks && (
        <nav className="topbar__links" aria-label="Primary navigation">
          <Link href="#features">Features</Link>
          <Link href="#workflow">Workflow</Link>
          <Link href="#pricing">Pricing</Link>
        </nav>
      )}

      {!showMarketingLinks && showAdminLink && (
        <nav className="topbar__links" aria-label="Admin navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      )}

      <Link href={ctaHref} className="btn btn--primary">
        {ctaLabel}
      </Link>
    </header>
  );
}
