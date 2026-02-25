"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type LoginResponse = {
  ok: boolean;
  message?: string;
  user?: {
    email: string;
    name: string;
    role?: "user" | "admin";
  };
};

export function LoginForm() {
  // Form fields are controlled to keep UI and state in sync.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Loading state prevents duplicate submits.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Message area is used for success and validation feedback.
  const [feedback, setFeedback] = useState("Use your configured credentials to sign in.");
  const [didSucceed, setDidSucceed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop browser default submit so we can call the API with fetch.
    event.preventDefault();
    setIsSubmitting(true);
    setDidSucceed(false);
    setFeedback("Checking credentials...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const rawBody = await response.text();
      let data: LoginResponse | null = null;

      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as LoginResponse;
        } catch {
          data = null;
        }
      }

      if (!response.ok || !data?.ok) {
        if (data?.message) {
          setFeedback(data.message);
          return;
        }

        const serverHint = rawBody.trim().slice(0, 140);
        setFeedback(
          serverHint
            ? `Login failed (${response.status}). ${serverHint}`
            : `Login failed (${response.status}). Unexpected server response.`,
        );
        return;
      }

      setDidSucceed(true);
      setFeedback(
        `Success. Welcome, ${data.user?.name ?? "Starter User"} (${data.user?.role ?? "user"} access).`,
      );
      setPassword("");
      const nextPath = data.user?.role === "admin" ? "/admin" : "/dashboard";

      // Force a full navigation so fresh auth cookies are always picked up.
      setTimeout(() => {
        window.location.assign(nextPath);
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setFeedback(`Network error: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login__form" onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        placeholder="name@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        placeholder="Enter password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button type="submit" className="btn btn--primary btn--full" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log in"}
      </button>

      <p className={didSucceed ? "form-feedback form-feedback--ok" : "form-feedback"}>{feedback}</p>

      <p className="form-note">
        No account yet? <Link href="/signup">Create one now.</Link>
      </p>
    </form>
  );
}
