"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Connection = {
  email: string;
  name: string;
  username: string;
};

type NetworkResponse = {
  ok: boolean;
  message?: string;
  network?: {
    self?: {
      email?: string;
      name?: string;
      username?: string;
    };
    connections?: Array<{
      email?: string;
      name?: string;
      username?: string;
    }>;
    incomingRequests?: Array<{
      email?: string;
      name?: string;
      username?: string;
    }>;
    outgoingRequests?: Array<{
      email?: string;
      name?: string;
      username?: string;
    }>;
  };
};

function normalizeConnection(
  value: { email?: string; name?: string; username?: string } | null | undefined,
): Connection | null {
  if (!value) {
    return null;
  }

  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const username = typeof value.username === "string" ? value.username.trim().toLowerCase().replace(/^@+/, "") : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";

  if (!email || !email.includes("@") || !/^[a-z0-9_]{3,24}$/.test(username)) {
    return null;
  }

  return {
    email,
    username,
    name: name || email,
  };
}

function normalizeConnectionList(entries: Array<{ email?: string; name?: string; username?: string }> | undefined): Connection[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeConnection(entry))
    .filter((entry): entry is Connection => Boolean(entry))
    .sort((a, b) => a.username.localeCompare(b.username));
}

function normalizeNetworkPayload(payload: NetworkResponse["network"]) {
  const self = normalizeConnection(payload?.self);

  return {
    selfUsername: self?.username ?? "",
    connections: normalizeConnectionList(payload?.connections),
    incomingRequests: normalizeConnectionList(payload?.incomingRequests),
    outgoingRequests: normalizeConnectionList(payload?.outgoingRequests),
  };
}

export function ConnectionsClient() {
  const router = useRouter();
  const [selfUsername, setSelfUsername] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Connection[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Connection[]>([]);
  const [draftUsername, setDraftUsername] = useState("");
  const [message, setMessage] = useState("Manage your connections for goal sharing.");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const authRedirectingRef = useRef(false);

  const applyNetwork = useCallback((payload: NetworkResponse["network"]) => {
    const normalized = normalizeNetworkPayload(payload);
    setConnections(normalized.connections);
    setIncomingRequests(normalized.incomingRequests);
    setOutgoingRequests(normalized.outgoingRequests);
    setSelfUsername(normalized.selfUsername);
  }, []);

  const clearNetwork = useCallback(() => {
    setConnections([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setSelfUsername("");
  }, []);

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

  const loadNetwork = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/network", { credentials: "include" });
      const data = (await response.json()) as NetworkResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.network) {
        setMessage(data.message ?? "Could not load connections.");
        clearNetwork();
        return;
      }

      applyNetwork(data.network);
    } catch {
      setMessage("Network issue while loading connections.");
      clearNetwork();
    } finally {
      setIsLoading(false);
    }
  }, [applyNetwork, clearNetwork, handleAuthFailure]);

  useEffect(() => {
    void loadNetwork();
  }, [loadNetwork]);

  async function addConnection() {
    if (isSaving) {
      return;
    }

    const username = draftUsername.trim().toLowerCase().replace(/^@+/, "");

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setMessage("Enter a valid username: 3-24 chars, letters/numbers/underscore.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/dashboard/network", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as NetworkResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.network) {
        setMessage(data.message ?? "Could not send connection request.");
        return;
      }

      applyNetwork(data.network);
      setDraftUsername("");
      setMessage(data.message ?? `Connection request sent to @${username}.`);
    } catch {
      setMessage("Network issue while sending request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRequest(username: string, action: "accept" | "decline" | "cancel") {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/dashboard/network", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, action }),
      });
      const data = (await response.json()) as NetworkResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.network) {
        setMessage(data.message ?? "Could not update request.");
        return;
      }

      applyNetwork(data.network);
      setMessage(data.message ?? "Request updated.");
    } catch {
      setMessage("Network issue while updating request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeConnection(username: string) {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/dashboard/network", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as NetworkResponse;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.network) {
        setMessage(data.message ?? "Could not remove connection.");
        return;
      }

      applyNetwork(data.network);
      setMessage(data.message ?? `Disconnected from @${username}.`);
    } catch {
      setMessage("Network issue while removing connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="shell-card dashboard-card">
      <h1>Connections</h1>
      <p className="lead">Connect by username. Incoming requests appear here for approval before sharing goals.</p>
      <p className="goal-proof">Your username: {selfUsername ? `@${selfUsername}` : "Not available yet"}</p>

      <div className="task-item__controls">
        <input
          value={draftUsername}
          onChange={(event) => setDraftUsername(event.target.value)}
          placeholder="username"
          disabled={isSaving}
        />
        <button type="button" className="btn btn--primary" disabled={isSaving} onClick={() => void addConnection()}>
          {isSaving ? "Saving..." : "Send Request"}
        </button>
      </div>

      <p className="dashboard-feedback">{message}</p>

      {isLoading && <p className="lead">Loading connections...</p>}

      {!isLoading && incomingRequests.length > 0 && (
        <>
          <h3>Incoming Requests</h3>
          <div className="peer-chip-row">
            {incomingRequests.map((connection) => (
              <span key={`incoming-${connection.email}`} className="peer-chip">
                @{connection.username}
                <button type="button" disabled={isSaving} onClick={() => void updateRequest(connection.username, "accept")}>
                  accept
                </button>
                <button type="button" disabled={isSaving} onClick={() => void updateRequest(connection.username, "decline")}>
                  decline
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      {!isLoading && outgoingRequests.length > 0 && (
        <>
          <h3>Sent Requests</h3>
          <div className="peer-chip-row">
            {outgoingRequests.map((connection) => (
              <span key={`outgoing-${connection.email}`} className="peer-chip">
                @{connection.username}
                <button type="button" disabled={isSaving} onClick={() => void updateRequest(connection.username, "cancel")}>
                  cancel
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      {!isLoading && connections.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0 && (
        <p className="goal-proof">No connections yet.</p>
      )}

      {!isLoading && connections.length > 0 && (
        <>
          <h3>Connected</h3>
          <div className="peer-chip-row">
            {connections.map((connection) => (
              <span key={connection.email} className="peer-chip">
                @{connection.username}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void removeConnection(connection.username)}
                  aria-label={`Remove @${connection.username}`}
                >
                  remove
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
