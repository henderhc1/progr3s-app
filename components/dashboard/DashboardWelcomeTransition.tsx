"use client";

import { ReactNode, useEffect, useState } from "react";

type DashboardWelcomeTransitionProps = {
  userName: string;
  children: ReactNode;
};

export function DashboardWelcomeTransition({ userName, children }: DashboardWelcomeTransitionProps) {
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsDone(true);
    }, 1850);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="dashboard-stage">
      <div className={isDone ? "welcome-intro welcome-intro--exit" : "welcome-intro"} aria-hidden={isDone}>
        <div className="welcome-intro__content">
          <p className="welcome-intro__eyebrow">system initialized</p>
          <h1 className="welcome-intro__title">WELCOME</h1>
          <p className="welcome-intro__subtitle">{userName.toUpperCase()}</p>
        </div>
      </div>

      <div className={isDone ? "dashboard-stage__content dashboard-stage__content--ready" : "dashboard-stage__content"}>
        {children}
      </div>
    </div>
  );
}
