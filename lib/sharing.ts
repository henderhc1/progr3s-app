import type { Model } from "mongoose";
import type { UserDocument } from "@/lib/models/User";
import { normalizeEmailList } from "@/lib/tasks";
import { ensureUserHasUsername, normalizeConnectionEmails } from "@/lib/users";

type ShareRecipientProfile = {
  email: string;
  name: string;
  username: string;
};

type ShareValidationSuccess = {
  ok: true;
  ownerName: string;
  ownerUsername: string;
  sharedWith: string[];
  recipients: ShareRecipientProfile[];
};

type ShareValidationFailure = {
  ok: false;
  status: number;
  message: string;
};

type ShareValidationResult = ShareValidationSuccess | ShareValidationFailure;

type ValidateShareRecipientsInput = {
  userModel: Model<UserDocument>;
  ownerEmail: string;
  requestedSharedWith: unknown;
};

export async function validateShareRecipients({
  userModel,
  ownerEmail,
  requestedSharedWith,
}: ValidateShareRecipientsInput): Promise<ShareValidationResult> {
  const owner = await userModel.findOne(
    { email: ownerEmail, isActive: true },
    { _id: 1, email: 1, name: 1, username: 1, connections: 1 },
  );

  if (!owner) {
    return {
      ok: false,
      status: 404,
      message: "Owner account not found.",
    };
  }

  const ownerUsername = await ensureUserHasUsername(userModel, owner);
  const sharedWith = normalizeEmailList(requestedSharedWith).filter((email) => email !== ownerEmail);

  if (sharedWith.length === 0) {
    return {
      ok: true,
      ownerName: owner.name,
      ownerUsername,
      sharedWith,
      recipients: [],
    };
  }

  const connectionEmails = normalizeConnectionEmails(owner.connections);
  const notInNetwork = sharedWith.filter((email) => !connectionEmails.includes(email));

  if (notInNetwork.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `You can only share with connected users. Connect first: ${notInNetwork.slice(0, 3).join(", ")}`,
    };
  }

  const recipientUsersRaw = await userModel.find(
    { email: { $in: sharedWith }, isActive: true },
    { _id: 1, email: 1, name: 1, username: 1 },
  );
  const byEmail = new Map<string, ShareRecipientProfile>();

  for (const recipientUser of recipientUsersRaw) {
    const username = await ensureUserHasUsername(userModel, recipientUser);

    byEmail.set(recipientUser.email, {
      email: recipientUser.email,
      name: recipientUser.name,
      username,
    });
  }

  if (byEmail.size !== sharedWith.length) {
    const missing = sharedWith.filter((email) => !byEmail.has(email));

    return {
      ok: false,
      status: 400,
      message: `Some recipients are unavailable or inactive: ${missing.slice(0, 3).join(", ")}`,
    };
  }

  return {
    ok: true,
    ownerName: owner.name,
    ownerUsername,
    sharedWith,
    recipients: sharedWith.map((email) => byEmail.get(email)!).filter(Boolean),
  };
}

export type { ShareRecipientProfile };
