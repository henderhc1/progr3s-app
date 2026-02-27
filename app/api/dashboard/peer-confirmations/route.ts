import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";
import {
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalTasks,
  normalizePeerConfirmations,
  resolveTaskStatus,
  resolveVerificationModes,
} from "@/lib/tasks";

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ ok: true, requests: [] });
  }

  const requests = await TaskModel.find(
    {
      ownerEmail: { $ne: identity.email },
      sharedWith: identity.email,
    },
    {
      ownerEmail: 1,
      title: 1,
      status: 1,
      done: 1,
      sharedWith: 1,
      goalTasks: 1,
      scheduledDays: 1,
      completionDates: 1,
      verification: 1,
      updatedAt: 1,
    },
  )
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);

  if (!requests) {
    return NextResponse.json({ ok: false, message: "Could not load shared goals right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    requests: requests.map((task) => {
      const maintenance = applyTaskMaintenance({
        status: task.status,
        done: task.done,
        scheduledDays: task.scheduledDays,
        completionDates: task.completionDates,
        goalTasks: task.goalTasks,
        verification: task.verification,
        sharedWith: task.sharedWith,
      });
      const effectiveTask = maintenance.changed
        ? {
            ...task,
            status: maintenance.status,
            done: maintenance.done,
            goalTasks: maintenance.goalTasks,
            completionDates: maintenance.completionDates,
            verification: maintenance.verification,
          }
        : task;
      const peerConfirmers = normalizeEmailList(effectiveTask.sharedWith).filter((email) => email !== effectiveTask.ownerEmail);
      const peerConfirmations = normalizePeerConfirmations(effectiveTask.verification?.peerConfirmations).filter((confirmation) =>
        peerConfirmers.includes(confirmation.email),
      );
      const verificationModes = mergeVerificationModes(
        resolveVerificationModes(effectiveTask.verification?.modes, effectiveTask.verification?.mode),
        ["peer"],
      );
      const rawVerificationProofLabel =
        typeof effectiveTask.verification?.proofLabel === "string" ? effectiveTask.verification.proofLabel.trim() : "";
      const geolocationLabelRaw =
        typeof effectiveTask.verification?.geolocationLabel === "string" ? effectiveTask.verification.geolocationLabel.trim() : "";
      const geolocationLabel = geolocationLabelRaw || (rawVerificationProofLabel.startsWith("geo:") ? rawVerificationProofLabel : "");
      const verificationProofLabel =
        geolocationLabel && rawVerificationProofLabel === geolocationLabel ? "" : rawVerificationProofLabel;
      const proofUploads = normalizeGoalTasks(effectiveTask.goalTasks)
        .filter((goalTask) => !!goalTask.proofImageDataUrl)
        .map((goalTask) => ({
          title: goalTask.title,
          proofLabel: goalTask.proofLabel,
          proofImageDataUrl: goalTask.proofImageDataUrl,
          completedAt: goalTask.completedAt,
        }));
      const verificationProofImageDataUrl =
        typeof effectiveTask.verification?.proofImageDataUrl === "string" &&
        effectiveTask.verification.proofImageDataUrl.startsWith("data:image/")
          ? effectiveTask.verification.proofImageDataUrl
          : "";

      if (verificationProofImageDataUrl) {
        proofUploads.unshift({
          title: "Goal proof upload",
          proofLabel: verificationProofLabel,
          proofImageDataUrl: verificationProofImageDataUrl,
          completedAt: "",
        });
      }

      return {
        _id: task._id.toString(),
        ownerEmail: effectiveTask.ownerEmail,
        title: effectiveTask.title,
        status: resolveTaskStatus(effectiveTask.status, effectiveTask.done),
        verification: {
          mode: verificationModes[0] ?? "none",
          modes: verificationModes,
          state: peerConfirmations.length > 0 ? "verified" : "pending",
          geolocationLabel,
          peerConfirmers,
          peerConfirmations,
        },
        proofUploads,
        confirmedByCurrentUser: peerConfirmations.some((confirmation) => confirmation.email === identity.email),
      };
    }),
  });
}
