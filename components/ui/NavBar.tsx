import Link from "next/link";
import { Progr3sLogo } from "@/components/ui/Progr3sLogo";

type NavigationItem = {
  href: string;
  label: string;
  active?: boolean;
};

export type NavBarProps = {
  ctaLabel?: string;
  ctaHref?: string;
  showMarketingLinks?: boolean;
  showAdminLink?: boolean;
  showUserLinks?: boolean;
  showAuthCtas?: boolean;
  activeUserLink?: "dashboard" | "connections" | "settings";
  activeMarketingLink?: "about" | "contact";
};

const LOGOUT_NAV = {
  ctaLabel: "Logout",
  ctaHref: "/api/auth/logout",
  showMarketingLinks: false,
} satisfies NavBarProps;

export const BACK_HOME_NAV = {
  ctaLabel: "Back Home",
  ctaHref: "/",
  showMarketingLinks: false,
} satisfies NavBarProps;

export function createMarketingPageNav(activeMarketingLink?: NonNullable<NavBarProps["activeMarketingLink"]>): NavBarProps {
  return {
    ctaLabel: "Sign up",
    ctaHref: "/signup",
    showMarketingLinks: true,
    activeMarketingLink,
  };
}

export function createUserShellNav(activeUserLink: NonNullable<NavBarProps["activeUserLink"]>): NavBarProps {
  return {
    ...LOGOUT_NAV,
    showAdminLink: false,
    showUserLinks: true,
    activeUserLink,
  };
}

export function createAdminShellNav(): NavBarProps {
  return {
    ...LOGOUT_NAV,
    showAdminLink: false,
  };
}

function getNavConfig({
  showMarketingLinks,
  showAdminLink,
  showUserLinks,
  activeUserLink,
  activeMarketingLink,
}: Pick<NavBarProps, "showMarketingLinks" | "showAdminLink" | "showUserLinks" | "activeUserLink" | "activeMarketingLink">): {
  ariaLabel: string;
  links: NavigationItem[];
} | null {
  if (showMarketingLinks) {
    return {
      ariaLabel: "Primary navigation",
      links: [
        { href: "/#features", label: "Features" },
        { href: "/#workflow", label: "How It Works" },
        { href: "/about", label: "About", active: activeMarketingLink === "about" },
        { href: "/contact", label: "Contact", active: activeMarketingLink === "contact" },
      ],
    };
  }

  if (showAdminLink) {
    return {
      ariaLabel: "Admin navigation",
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/admin", label: "Admin" },
      ],
    };
  }

  if (showUserLinks) {
    return {
      ariaLabel: "User navigation",
      links: [
        { href: "/dashboard", label: "Goals", active: activeUserLink === "dashboard" },
        { href: "/connections", label: "Network", active: activeUserLink === "connections" },
        { href: "/settings", label: "Settings", active: activeUserLink === "settings" },
      ],
    };
  }

  return null;
}

export function NavBar({
  ctaLabel = "Login",
  ctaHref = "/login",
  showMarketingLinks = true,
  showAdminLink = false,
  showUserLinks = false,
  showAuthCtas = false,
  activeUserLink = "dashboard",
  activeMarketingLink,
}: NavBarProps) {
  const isLogoutCta = ctaHref === "/api/auth/logout";
  const navConfig = getNavConfig({
    showMarketingLinks,
    showAdminLink,
    showUserLinks,
    activeUserLink,
    activeMarketingLink,
  });

  // Shared nav component so top-level pages stay visually consistent.
  return (
    <header className="topbar shell-card">
      <Link href="/" className="brand">
        <Progr3sLogo />
      </Link>

      {navConfig && (
        <nav className="topbar__links" aria-label={navConfig.ariaLabel}>
          {navConfig.links.map((link) => (
            <Link key={link.href} href={link.href} className={link.active ? "is-active" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      {showAuthCtas ? (
        <div className="topbar__actions">
          <Link href="/signup" className="btn btn--primary btn--soft">
            Sign up
          </Link>
          <Link href="/login" className="btn btn--ghost btn--soft">
            Login
          </Link>
        </div>
      ) : isLogoutCta ? (
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
