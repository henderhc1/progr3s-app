import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import {
  normalizeEmailList,
  normalizePeerConfirmations,
  resolveTaskStatus,
} from "@/lib/tasks";

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  const db = await connectToDatabase();

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
      verification: 1,
      updatedAt: 1,
    },
  )
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json({
    ok: true,
    requests: requests.map((task) => {
      const peerConfirmers = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
      const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
        peerConfirmers.includes(confirmation.email),
      );

      return {
        _id: task._id.toString(),
        ownerEmail: task.ownerEmail,
        title: task.title,
        status: resolveTaskStatus(task.status, task.done),
        verification: {
          mode: "peer",
          state: peerConfirmations.length > 0 ? "verified" : "pending",
          peerConfirmers,
          peerConfirmations,
        },
        confirmedByCurrentUser: peerConfirmations.some((confirmation) => confirmation.email === identity.email),
      };
    }),
  });
}
