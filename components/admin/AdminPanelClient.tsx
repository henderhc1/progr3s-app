"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  isActive: boolean;
  taskCount: number;
  completedCount: number;
  createdAt: string;
};

type AdminPanelClientProps = {
  viewerEmail: string;
};

type AdminMutationResponse = {
  ok: boolean;
  message?: string;
  temporaryPassword?: string | null;
};

export function AdminPanelClient({ viewerEmail }: AdminPanelClientProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading admin data...");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"user" | "admin">("user");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingUserIds, setPendingUserIds] = useState<Record<string, boolean>>({});

  function setUserPending(userId: string, isPending: boolean) {
    setPendingUserIds((current) => {
      if (isPending) {
        if (current[userId]) {
          return current;
        }

        return { ...current, [userId]: true };
      }

      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users");
      const data = (await response.json()) as { ok: boolean; users?: AdminUser[]; message?: string };

      if (!response.ok || !data.ok || !data.users) {
        setMessage(data.message ?? "Could not load user list.");
        return;
      }

      setUsers(data.users);
      setMessage("User list loaded.");
    } catch {
      setMessage("Network issue while loading user list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function saveUser(user: AdminUser) {
    if (pendingUserIds[user.id]) {
      return;
    }

    setUserPending(user.id, true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        }),
      });

      const data = (await response.json()) as AdminMutationResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not save user changes.");
        return;
      }

      setMessage(`Saved changes for ${user.email}.`);
      void loadUsers();
    } catch {
      setMessage("Network issue while saving user.");
    } finally {
      setUserPending(user.id, false);
    }
  }

  async function resetPassword(user: AdminUser) {
    if (pendingUserIds[user.id]) {
      return;
    }

    const entered = window.prompt("Set a new password. Leave blank to use defaultpass.", "defaultpass");

    if (entered === null) {
      return;
    }

    setUserPending(user.id, true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resetPassword: true,
          nextPassword: entered.trim(),
        }),
      });

      const data = (await response.json()) as AdminMutationResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not reset password.");
        return;
      }

      setMessage(`Password reset for ${user.email}. New password: ${data.temporaryPassword ?? "defaultpass"}`);
    } catch {
      setMessage("Network issue while resetting password.");
    } finally {
      setUserPending(user.id, false);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (pendingUserIds[user.id]) {
      return;
    }

    if (user.email === viewerEmail) {
      setMessage("You cannot delete your own admin account.");
      return;
    }

    const confirmed = window.confirm(`Delete user ${user.email}? This also deletes all their tasks.`);

    if (!confirmed) {
      return;
    }

    setUserPending(user.id, true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as AdminMutationResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not delete user.");
        return;
      }

      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setMessage(data.message ?? `Deleted ${user.email}.`);
    } catch {
      setMessage("Network issue while deleting user.");
    } finally {
      setUserPending(user.id, false);
    }
  }

  async function createUser() {
    if (isCreating) {
      return;
    }

    const name = createName.trim();
    const email = createEmail.trim().toLowerCase();

    if (name.length < 2) {
      setMessage("Name must be at least 2 characters.");
      return;
    }

    if (!email.includes("@")) {
      setMessage("Enter a valid email.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          role: createRole,
        }),
      });

      const data = (await response.json()) as AdminMutationResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not create user.");
        return;
      }

      setCreateName("");
      setCreateEmail("");
      setCreateRole("user");
      setMessage(`Created ${email}. Default password: ${data.temporaryPassword ?? "defaultpass"}`);
      void loadUsers();
    } catch {
      setMessage("Network issue while creating user.");
    } finally {
      setIsCreating(false);
    }
  }

  function updateUserLocal(userId: string, updates: Partial<AdminUser>) {
    setUsers((current) => current.map((entry) => (entry.id === userId ? { ...entry, ...updates } : entry)));
  }

  return (
    <section className="shell-card admin-panel">
      <div className="admin-panel__header">
        <p className="eyebrow">Admin Console</p>
        <h1>User administration</h1>
        <p className="lead">
          Signed in as <strong>{viewerEmail}</strong>. You can create users, reset passwords, delete users, and update roles.
        </p>
        <p className="dashboard-feedback">{message}</p>
      </div>

      <div className="admin-create">
        <input
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          placeholder="New user name"
          disabled={isCreating}
        />
        <input
          value={createEmail}
          onChange={(event) => setCreateEmail(event.target.value)}
          placeholder="newuser@example.com"
          type="email"
          disabled={isCreating}
        />
        <select value={createRole} onChange={(event) => setCreateRole(event.target.value as "user" | "admin")} disabled={isCreating}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => void createUser()} disabled={isCreating}>
          {isCreating ? "Creating..." : "Create User"}
        </button>
      </div>
      <p className="goal-proof">New accounts and password resets default to password: defaultpass</p>

      {loading && <p className="lead">Loading users...</p>}

      {!loading && (
        <div className="admin-table">
          <div className="admin-table__head">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Tasks</span>
            <span>Actions</span>
          </div>

          {users.map((user) => (
            <article key={user.id} className="admin-table__row">
              <div className="admin-user">
                <input
                  value={user.name}
                  onChange={(event) => updateUserLocal(user.id, { name: event.target.value })}
                  className="admin-user__name"
                />
                <p>{user.email}</p>
              </div>

              <select
                value={user.role}
                disabled={pendingUserIds[user.id]}
                onChange={(event) => updateUserLocal(user.id, { role: event.target.value as "user" | "admin" })}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              <label className="admin-status">
                <input
                  type="checkbox"
                  checked={user.isActive}
                  disabled={pendingUserIds[user.id]}
                  onChange={(event) => updateUserLocal(user.id, { isActive: event.target.checked })}
                />
                <span>{user.isActive ? "Active" : "Disabled"}</span>
              </label>

              <p>
                {user.completedCount}/{user.taskCount}
              </p>

              <div className="admin-actions">
                <button type="button" className="btn btn--primary" disabled={pendingUserIds[user.id]} onClick={() => void saveUser(user)}>
                  Save
                </button>
                <button type="button" className="btn btn--ghost" disabled={pendingUserIds[user.id]} onClick={() => void resetPassword(user)}>
                  Reset Pass
                </button>
                <button type="button" className="btn btn--danger" disabled={pendingUserIds[user.id]} onClick={() => void deleteUser(user)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
