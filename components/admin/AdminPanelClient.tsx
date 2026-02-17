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

export function AdminPanelClient({ viewerEmail }: AdminPanelClientProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading admin data...");

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

      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Could not save user changes.");
        return;
      }

      setMessage(`Saved changes for ${user.email}.`);
      void loadUsers();
    } catch {
      setMessage("Network issue while saving user.");
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
          Signed in as <strong>{viewerEmail}</strong>. You can review all users and apply admin-level updates.
        </p>
        <p className="dashboard-feedback">{message}</p>
      </div>

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
                onChange={(event) => updateUserLocal(user.id, { role: event.target.value as "user" | "admin" })}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              <label className="admin-status">
                <input
                  type="checkbox"
                  checked={user.isActive}
                  onChange={(event) => updateUserLocal(user.id, { isActive: event.target.checked })}
                />
                <span>{user.isActive ? "Active" : "Disabled"}</span>
              </label>

              <p>
                {user.completedCount}/{user.taskCount}
              </p>

              <button type="button" className="btn btn--primary" onClick={() => saveUser(user)}>
                Save
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
