"use client";

import Link from "next/link";
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("Sign up to start tracking progress.");
  const [didSucceed, setDidSucceed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setDidSucceed(false);
    setFeedback("Signing up...");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, username, password }),
      });

      const data = (await response.json()) as SignupResponse;

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Sign-up failed. Please try again.");
        return;
      }

      setDidSucceed(true);
      setPassword("");
      setFeedback(`Signup complete. Welcome, ${data.user?.name ?? "Builder"}. Redirecting to dashboard...`);

      setTimeout(() => {
        window.location.assign("/dashboard");
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

      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        type="text"
        placeholder="your_username"
        minLength={3}
        maxLength={24}
        pattern="[A-Za-z0-9_]+"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
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
        {isSubmitting ? "Signing up..." : "Sign up"}
      </button>

      <p className={didSucceed ? "form-feedback form-feedback--ok" : "form-feedback"}>{feedback}</p>

      <p className="form-note">
        Already have an account? <Link href="/login">Log in.</Link>
      </p>
    </form>
  );
}
