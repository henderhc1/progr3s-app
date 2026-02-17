"use client";

import { useMemo, useState } from "react";

type Task = {
  id: number;
  text: string;
  done: boolean;
};

const starterTasks: Task[] = [
  { id: 1, text: "Define today's top priority", done: true },
  { id: 2, text: "Ship one small frontend improvement", done: false },
  { id: 3, text: "Review API response handling", done: false },
];

export function ProgressPlayground() {
  // The list that powers our interactive checklist.
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  // Controlled input for adding a new task.
  const [draft, setDraft] = useState("");
  // Human-friendly feedback shown after actions.
  const [message, setMessage] = useState("Tip: complete a task to increase progress.");

  // This computed value updates automatically when tasks change.
  const completionPercent = useMemo(() => {
    if (tasks.length === 0) {
      return 0;
    }

    const doneCount = tasks.filter((task) => task.done).length;
    return Math.round((doneCount / tasks.length) * 100);
  }, [tasks]);

  function toggleTask(taskId: number) {
    // Flip the "done" state of just one task.
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              done: !task.done,
            }
          : task,
      ),
    );

    setMessage("Nice. Progress updated.");
  }

  function addTask() {
    const trimmedDraft = draft.trim();

    // Basic guard so empty tasks are not added to state.
    if (!trimmedDraft) {
      setMessage("Please type a task before adding.");
      return;
    }

    // Use Date.now for a simple unique id in this starter app.
    const newTask: Task = {
      id: Date.now(),
      text: trimmedDraft,
      done: false,
    };

    setTasks((currentTasks) => [newTask, ...currentTasks]);
    setDraft("");
    setMessage("Task added. Keep the momentum going.");
  }

  function clearCompleted() {
    // Remove tasks that are already done.
    setTasks((currentTasks) => currentTasks.filter((task) => !task.done));
    setMessage("Completed tasks cleared.");
  }

  return (
    <section className="shell-card playground">
      <div className="playground__header">
        <p className="eyebrow">Live Progress Demo</p>
        <h2>Interactive focus board</h2>
        <p className="lead">
          This is a simple state-driven widget. Add tasks, mark them complete, and watch progress update instantly.
        </p>
      </div>

      <div className="progress-meter" aria-label="Task completion progress">
        <div className="progress-meter__label">
          <span>Completion</span>
          <strong>{completionPercent}%</strong>
        </div>
        <div className="progress-meter__track">
          <div
            className="progress-meter__bar"
            style={{ width: `${completionPercent}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercent}
          />
        </div>
      </div>

      <div className="playground__controls">
        <label htmlFor="task-input">Add next task</label>
        <div className="playground__row">
          <input
            id="task-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write one concrete action..."
          />
          <button type="button" className="btn btn--primary" onClick={addTask}>
            Add
          </button>
          <button type="button" className="btn btn--ghost" onClick={clearCompleted}>
            Clear done
          </button>
        </div>
        <p className="playground__message">{message}</p>
      </div>

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className={task.done ? "task-item is-done" : "task-item"}>
            <button type="button" className="task-item__toggle" onClick={() => toggleTask(task.id)}>
              {task.done ? "Undo" : "Done"}
            </button>
            <span>{task.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
