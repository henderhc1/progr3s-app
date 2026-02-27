"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SettingsResponse = {
  ok: boolean;
  message?: string;
  stats?: {
    deletedOwnedGoals?: number;
    cleanedSharedGoals?: number;
    cleanedConnections?: number;
  };
};

export function SettingsClient() {
  const router = useRouter();
  const authRedirectingRef = useRef(false);
  const [message, setMessage] = useState("Manage your account security and personal data.");
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const handleAuthFailure = useCallback(
    (status: number, feedback?: string): boolean => {
      if (status !== 401 && status !== 403) {
        return false;
      }

      if (authRedirectingRef.current) {
        return true;
      }

      authRedirectingRef.current = true;
      setMessage(feedback ?? "Session expired. Redirecting...");

      setTimeout(() => {
        router.push(status === 403 ? "/admin" : "/login");
        router.refresh();
      }, 200);

      return true;
    },
    [router],
  );

  async function changePassword() {
    if (isSaving) {
      return;
    }

    if (nextPassword !== confirmPassword) {
      setMessage("New password and confirmation must match.");
      return;
    }

    if (nextPassword.trim().length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/account", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
        }),
      });
      const data = (await response.json()) as SettingsResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not change password.");
        return;
      }

      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      setMessage(data.message ?? "Password changed.");
    } catch {
      setMessage("Network issue while changing password.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetAccountData() {
    if (isSaving) {
      return;
    }

    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      setMessage("Type RESET to confirm data reset.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/account", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json()) as SettingsResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not reset account data.");
        return;
      }

      setResetConfirm("");
      setMessage(data.message ?? "Account data reset.");
    } catch {
      setMessage("Network issue while resetting account data.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAccount() {
    if (isSaving) {
      return;
    }

    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setMessage("Type DELETE to confirm account deletion.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/account", {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await response.json()) as SettingsResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not delete account.");
        return;
      }

      setMessage(data.message ?? "Account deleted.");
      setTimeout(() => {
        window.location.assign("/");
      }, 300);
    } catch {
      setMessage("Network issue while deleting account.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="shell-card dashboard-card">
      <h1>Settings</h1>
      <p className="lead">Change password, reset your data, or permanently delete your account.</p>

      <div className="task-section">
        <p className="task-section__label">Change Password</p>
        <div className="task-item__controls">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={isSaving}
            onClick={() => setShowPasswordForm((current) => !current)}
          >
            {showPasswordForm ? "Hide Password Fields" : "Update Password"}
          </button>
        </div>
        {showPasswordForm && (
          <>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              disabled={isSaving}
            />
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              placeholder="New password"
              disabled={isSaving}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              disabled={isSaving}
            />
            <div className="task-item__controls">
              <button type="button" className="btn btn--primary" disabled={isSaving} onClick={() => void changePassword()}>
                {isSaving ? "Saving..." : "Save New Password"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="task-section">
        <p className="task-section__label">Reset Account Data (Keep Account)</p>
        <p className="goal-proof">
          Deletes your goals, clears sharing references, and removes network links while keeping your login account.
        </p>
        <input
          type="text"
          value={resetConfirm}
          onChange={(event) => setResetConfirm(event.target.value)}
          placeholder="Type RESET"
          disabled={isSaving}
        />
        <div className="task-item__controls">
          <button type="button" className="btn btn--ghost" disabled={isSaving} onClick={() => void resetAccountData()}>
            {isSaving ? "Saving..." : "Reset Data"}
          </button>
        </div>
      </div>

      <div className="task-section">
        <p className="task-section__label">Delete Account</p>
        <p className="goal-proof">Permanently deletes your account and all associated data.</p>
        <input
          type="text"
          value={deleteConfirm}
          onChange={(event) => setDeleteConfirm(event.target.value)}
          placeholder="Type DELETE"
          disabled={isSaving}
        />
        <div className="task-item__controls">
          <button type="button" className="btn btn--danger" disabled={isSaving} onClick={() => void deleteAccount()}>
            {isSaving ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>

      <p className="dashboard-feedback">{message}</p>
    </section>
  );
}
