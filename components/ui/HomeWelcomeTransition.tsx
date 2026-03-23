"use client";

import { ReactNode, useEffect, useState } from "react";
import { Progr3sLogo } from "@/components/ui/Progr3sLogo";

type HomeWelcomeTransitionProps = {
  children: ReactNode;
};

export function HomeWelcomeTransition({ children }: HomeWelcomeTransitionProps) {
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsDone(true);
    }, 1600);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="home-stage">
      <div className={isDone ? "home-intro home-intro--exit" : "home-intro"} aria-hidden={isDone}>
        <div className="home-intro__content">
          <p className="home-intro__eyebrow">welcome to</p>
          <div className="home-intro__logo">
            <Progr3sLogo />
          </div>
          <p className="home-intro__sub">resilience through systems</p>
        </div>
      </div>

      <div className={isDone ? "home-stage__content home-stage__content--ready" : "home-stage__content"}>{children}</div>
    </div>
  );
}
