import Link from "next/link";
import { Progr3sLogo } from "@/components/ui/Progr3sLogo";

type NavBarProps = {
  ctaLabel?: string;
  ctaHref?: string;
  showMarketingLinks?: boolean;
  showAdminLink?: boolean;
  showUserLinks?: boolean;
  activeUserLink?: "dashboard" | "connections" | "settings";
};

export function NavBar({
  ctaLabel = "Login",
  ctaHref = "/login",
  showMarketingLinks = true,
  showAdminLink = false,
  showUserLinks = false,
  activeUserLink = "dashboard",
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
          <Link href="#workflow">How It Works</Link>
        </nav>
      )}

      {!showMarketingLinks && showAdminLink && (
        <nav className="topbar__links" aria-label="Admin navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      )}

      {!showMarketingLinks && !showAdminLink && showUserLinks && (
        <nav className="topbar__links" aria-label="User navigation">
          <Link href="/dashboard" className={activeUserLink === "dashboard" ? "is-active" : undefined}>
            Goals
          </Link>
          <Link href="/connections" className={activeUserLink === "connections" ? "is-active" : undefined}>
            Network
          </Link>
          <Link href="/settings" className={activeUserLink === "settings" ? "is-active" : undefined}>
            Settings
          </Link>
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
