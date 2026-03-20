import { type ReactNode } from "react";
import { NavBar, type NavBarProps } from "@/components/ui/NavBar";

type PageShellProps = {
  children: ReactNode;
  nav: NavBarProps;
};

export function PageShell({ children, nav }: PageShellProps) {
  return (
    <main className="page-wrap">
      <NavBar {...nav} />
      {children}
    </main>
  );
}
