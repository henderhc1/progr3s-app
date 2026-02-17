"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DashboardSummary = {
  dateLabel: string;
  focusScore: number;
  streakDays: number;
  completedToday: number;
  pendingToday: number;
};

type Task = {
  _id: string;
  title: string;
  done: boolean;
};

type FocusBlock = {
  id: number;
  name: string;
  minutes: number;
};

const starterTasks: Task[] = [
  { _id: "starter-1", title: "Review roadmap for next sprint", done: false },
  { _id: "starter-2", title: "Ship one frontend polish PR", done: true },
  { _id: "starter-3", title: "Write API notes for auth flow", done: false },
];

const focusBlocks: FocusBlock[] = [
  { id: 1, name: "Deep Work", minutes: 95 },
  { id: 2, name: "Meetings", minutes: 40 },
  { id: 3, name: "Planning", minutes: 35 },
];

type DashboardClientProps = {
  userName: string;
  userEmail: string;
};

export function DashboardClient({ userName, userEmail }: DashboardClientProps) {
  // Main interactive state for task board loaded from API.
  const [tasks, setTasks] = useState<Task[]>([]);
  // Controlled input used for creating new tasks.
  const [draftTask, setDraftTask] = useState("");
  // Message line that explains action results to the user.
  const [feedback, setFeedback] = useState("Welcome. Start by finishing one task.");
  // API summary state loaded from backend route.
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/summary");
      const data = (await response.json()) as {
        ok: boolean;
        summary?: DashboardSummary;
        message?: string;
      };

      if (!response.ok || !data.ok || !data.summary) {
        setFeedback(data.message ?? "Could not load dashboard summary.");
        return;
      }

      setSummary(data.summary);
    } catch {
      setFeedback("Network issue while loading dashboard summary.");
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    async function loadTasks() {
      try {
        const response = await fetch("/api/dashboard/tasks");
        const data = (await response.json()) as { ok: boolean; tasks?: Task[]; message?: string };

        if (!response.ok || !data.ok || !data.tasks) {
          setFeedback(data.message ?? "Could not load tasks.");
          setTasks(starterTasks);
          return;
        }

        setTasks(data.tasks);
      } catch {
        setFeedback("Network issue while loading tasks.");
        setTasks(starterTasks);
      } finally {
        setIsLoadingTasks(false);
      }
    }

    void loadTasks();
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const completedCount = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);
  const progressPercent = useMemo(() => {
    if (tasks.length === 0) {
      return 0;
    }

    return Math.round((completedCount / tasks.length) * 100);
  }, [completedCount, tasks.length]);

  async function addTask() {
    const trimmed = draftTask.trim();

    // Prevent empty items from entering the list.
    if (!trimmed) {
      setFeedback("Please type a task before adding.");
      return;
    }

    try {
      const response = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: trimmed }),
      });

      const data = (await response.json()) as { ok: boolean; task?: Task; message?: string };

      if (!response.ok || !data.ok || !data.task) {
        setFeedback(data.message ?? "Could not add task.");
        return;
      }

      setTasks((current) => [data.task!, ...current]);
      setDraftTask("");
      setFeedback("Task added.");
      void loadSummary();
    } catch {
      setFeedback("Network issue while adding task.");
    }
  }

  async function toggleTask(taskId: string) {
    const existingTask = tasks.find((task) => task._id === taskId);

    if (!existingTask) {
      return;
    }

    const nextDoneValue = !existingTask.done;

    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ done: nextDoneValue }),
      });

      const data = (await response.json()) as { ok: boolean; task?: Task; message?: string };

      if (!response.ok || !data.ok || !data.task) {
        setFeedback(data.message ?? "Could not update task.");
        return;
      }

      setTasks((current) => current.map((task) => (task._id === taskId ? data.task! : task)));
      setFeedback("Task status updated.");
      void loadSummary();
    } catch {
      setFeedback("Network issue while updating task.");
    }
  }

  return (
    <section className="dashboard-grid">
      <article className="shell-card dashboard-card dashboard-card--welcome">
        <p className="eyebrow">Workspace</p>
        <h1>{userName}</h1>
        <p className="lead">
          Signed in as <strong>{userEmail}</strong>. Your tasks are loaded from API and can persist in MongoDB when
          configured.
        </p>
        <p className="dashboard-feedback">{feedback}</p>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Daily Task Board</h2>
        <div className="dashboard-task-input">
          <input
            value={draftTask}
            onChange={(event) => setDraftTask(event.target.value)}
            placeholder="Add a concrete task..."
          />
          <button type="button" className="btn btn--primary" onClick={addTask}>
            Add
          </button>
        </div>

        <div className="progress-meter" aria-label="Task completion progress">
          <div className="progress-meter__label">
            <span>Task completion</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="progress-meter__track">
            <div className="progress-meter__bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {isLoadingTasks && <p className="lead">Loading tasks...</p>}

        {!isLoadingTasks && (
          <ul className="task-list">
          {tasks.map((task) => (
            <li key={task._id} className={task.done ? "task-item is-done" : "task-item"}>
              <button type="button" className="task-item__toggle" onClick={() => toggleTask(task._id)}>
                {task.done ? "Undo" : "Done"}
              </button>
              <span>{task.title}</span>
            </li>
          ))}
          </ul>
        )}
      </article>

      <article className="shell-card dashboard-card">
        <h2>Focus Blocks</h2>
        <p className="lead">A simple visual breakdown of where your time went today.</p>
        <ul className="focus-list">
          {focusBlocks.map((block) => (
            <li key={block.id}>
              <div className="focus-list__label">
                <span>{block.name}</span>
                <strong>{block.minutes} min</strong>
              </div>
              <div className="focus-list__track">
                <div className="focus-list__bar" style={{ width: `${Math.min(block.minutes, 120) / 1.2}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Backend Summary</h2>
        {isLoadingSummary && <p className="lead">Loading summary...</p>}

        {!isLoadingSummary && summary && (
          <ul className="summary-list">
            <li>
              <span>Date</span>
              <strong>{summary.dateLabel}</strong>
            </li>
            <li>
              <span>Focus score</span>
              <strong>{summary.focusScore}</strong>
            </li>
            <li>
              <span>Streak days</span>
              <strong>{summary.streakDays}</strong>
            </li>
            <li>
              <span>Completed today</span>
              <strong>{summary.completedToday}</strong>
            </li>
            <li>
              <span>Pending today</span>
              <strong>{summary.pendingToday}</strong>
            </li>
          </ul>
        )}
      </article>
    </section>
  );
}
