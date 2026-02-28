"use client";

import { useMemo, useState } from "react";

type Task = {
  id: number;
  text: string;
  done: boolean;
};

const starterTasks: Task[] = [
  { id: 1, text: "Go to the gym", done: true },
  { id: 2, text: "Finish coding practice", done: false },
  { id: 3, text: "Plan tomorrow's top task", done: false },
];

export function ProgressPlayground() {
  // The list that powers our interactive checklist.
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  // Controlled input for adding a new task.
  const [draft, setDraft] = useState("");
  // Human-friendly feedback shown after actions.
  const [message, setMessage] = useState("Tip: add one small task and check it off.");

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

    setMessage("Progress updated.");
  }

  function addTask() {
    const trimmedDraft = draft.trim();

    // Basic guard so empty tasks are not added to state.
    if (!trimmedDraft) {
      setMessage("Type a task first.");
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
    setMessage("Task added.");
  }

  function deleteTask(taskId: number) {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    setMessage("Task deleted.");
  }

  function clearCompleted() {
    // Remove tasks that are already done.
    setTasks((currentTasks) => currentTasks.filter((task) => !task.done));
    setMessage("Completed tasks deleted.");
  }

  return (
    <section className="shell-card playground">
      <div className="playground__header">
        <p className="eyebrow">Quick Task Board</p>
        <h2>Add tasks and clear them fast</h2>
        <p className="lead">Use this mini board to add, complete, and delete tasks in seconds.</p>
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
            Delete done
          </button>
        </div>
        <p className="playground__message">{message}</p>
      </div>

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className={task.done ? "task-item task-item--completed" : "task-item"}>
            <div className="task-item__controls">
              <button type="button" className="btn btn--ghost btn--soft" onClick={() => toggleTask(task.id)}>
                {task.done ? "Undo" : "Done"}
              </button>
              <button type="button" className="btn btn--danger-soft btn--soft" onClick={() => deleteTask(task.id)}>
                Delete
              </button>
            </div>
            <span className={task.done ? "subtask-title is-done" : "subtask-title"}>{task.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
