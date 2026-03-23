import { type ReactNode } from "react";
import { NavBar, type NavBarProps } from "@/components/ui/NavBar";
import { SiteFooter } from "@/components/ui/SiteFooter";

type PageShellProps = {
  children: ReactNode;
  nav: NavBarProps;
  showFooter?: boolean;
};

export function PageShell({ children, nav, showFooter = false }: PageShellProps) {
  return (
    <div className="page-wrap">
      <NavBar {...nav} />
      {children}
      {showFooter ? <SiteFooter /> : null}
    </div>
  );
}
