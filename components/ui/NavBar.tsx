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
  const isLogoutCta = ctaHref === "/api/auth/logout";

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
        </nav>
      )}

      {!showMarketingLinks && showAdminLink && (
        <nav className="topbar__links" aria-label="Admin navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      )}

      {isLogoutCta ? (
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="btn btn--primary">
            {ctaLabel}
          </button>
        </form>
      ) : (
        <Link href={ctaHref} className="btn btn--primary">
          {ctaLabel}
        </Link>
      )}
    </header>
  );
}
