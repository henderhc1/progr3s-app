import Link from "next/link";
import { Progr3sLogo } from "@/components/ui/Progr3sLogo";

const productLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#workflow", label: "How It Works" },
  { href: "/dashboard", label: "Dashboard" },
];

const companyLinks = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const accountLinks = [
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Sign up" },
];

export const SUPPORT_EMAIL = "support@progr3s.app";

export function SiteFooter() {
  return (
    <footer className="site-footer shell-card">
      <div className="site-footer__brand">
        <Link href="/" className="brand">
          <Progr3sLogo />
        </Link>
        <p>
          Progr3s helps people stay consistent with routines and one-time goals using proof, history, and simple
          accountability.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="site-footer__email">
          {SUPPORT_EMAIL}
        </a>
      </div>

      <div className="site-footer__grid">
        <nav className="site-footer__group" aria-label="Product footer links">
          <h2>Product</h2>
          {productLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="site-footer__group" aria-label="Company footer links">
          <h2>Company</h2>
          {companyLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="site-footer__group" aria-label="Account footer links">
          <h2>Account</h2>
          {accountLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
