"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  // Form fields are controlled to keep UI and state in sync.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Loading state prevents duplicate submits.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Message area is used for success and validation feedback.
  const [feedback, setFeedback] = useState("Use demo credentials: demo@progr3s.dev / progress123");
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
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Login failed. Please try again.");
        return;
      }

      setDidSucceed(true);
      setFeedback(
        `Success. Welcome, ${data.user?.name ?? "Starter User"} (${data.user?.role ?? "user"} access).`,
      );
      setPassword("");

      // Small delay helps users see success feedback before navigation.
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 500);
    } catch {
      setFeedback("Network error. Please retry in a moment.");
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
        placeholder="demo@progr3s.dev"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        placeholder="progress123"
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
        No account yet? <Link href="/">Return to home and add sign-up later.</Link>
      </p>
    </form>
  );
}
