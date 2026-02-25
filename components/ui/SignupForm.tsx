"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type SignupResponse = {
  ok: boolean;
  message?: string;
  user?: {
    email: string;
    name: string;
    role?: "user" | "admin";
  };
};

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("Create your account to start tracking progress.");
  const [didSucceed, setDidSucceed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setDidSucceed(false);
    setFeedback("Creating account...");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = (await response.json()) as SignupResponse;

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Sign-up failed. Please try again.");
        return;
      }

      setDidSucceed(true);
      setPassword("");
      setFeedback(`Account created. Welcome, ${data.user?.name ?? "Builder"}. Redirecting to dashboard...`);

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
      <label htmlFor="name">Name</label>
      <input
        id="name"
        name="name"
        type="text"
        placeholder="Your name"
        minLength={2}
        maxLength={80}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

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
        placeholder="Create a password"
        minLength={8}
        maxLength={72}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button type="submit" className="btn btn--primary btn--full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>

      <p className={didSucceed ? "form-feedback form-feedback--ok" : "form-feedback"}>{feedback}</p>

      <p className="form-note">
        Already have an account? <Link href="/login">Log in.</Link>
      </p>
    </form>
  );
}
