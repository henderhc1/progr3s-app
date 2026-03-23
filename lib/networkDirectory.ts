import type { Model } from "mongoose";
import type { UserDocument } from "@/lib/models/User";
import { ensureUserHasUsername, isValidUsername, normalizeConnectionEmails, normalizeUsername } from "@/lib/users";

export type NetworkAction = "accept" | "decline" | "cancel";

export type PublicUser = {
  email: string;
  name: string;
  username: string;
};

export type NetworkSnapshot = {
  self: PublicUser;
  connections: PublicUser[];
  incomingRequests: PublicUser[];
  outgoingRequests: PublicUser[];
};

type NetworkResult =
  | {
      ok: true;
      message: string;
      network: NetworkSnapshot;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type UserSnapshot = {
  _id: string | { toString(): string };
  email: string;
  name: string;
  username?: string;
  connections?: unknown;
  connectionRequestsIncoming?: unknown;
  connectionRequestsOutgoing?: unknown;
};

const NETWORK_FIELDS = {
  email: 1,
  name: 1,
  username: 1,
  connections: 1,
  connectionRequestsIncoming: 1,
  connectionRequestsOutgoing: 1,
} as const;

const PUBLIC_FIELDS = {
  email: 1,
  name: 1,
  username: 1,
} as const;

type RelationshipState = {
  connections: string[];
  incoming: string[];
  outgoing: string[];
  connectionSet: Set<string>;
  incomingSet: Set<string>;
  outgoingSet: Set<string>;
};

class UserDirectory {
  constructor(protected readonly userModel: Model<UserDocument>) {}

  protected async findByEmail(email: string): Promise<UserSnapshot | null> {
    return (await this.userModel.findOne({ email, isActive: true }, NETWORK_FIELDS)) as UserSnapshot | null;
  }

  protected async findByUsername(username: string): Promise<UserSnapshot | null> {
    return (await this.userModel.findOne({ username, isActive: true }, NETWORK_FIELDS)) as UserSnapshot | null;
  }

  protected async toPublicUser(user: Pick<UserSnapshot, "_id" | "email" | "name" | "username">): Promise<PublicUser> {
    const username = normalizeUsername(user.username);

    if (isValidUsername(username)) {
      return {
        email: user.email,
        name: user.name,
        username,
      };
    }

    return {
      email: user.email,
      name: user.name,
      username: await ensureUserHasUsername(this.userModel, user),
    };
  }

  protected async resolvePublicUsers(emails: string[]): Promise<Map<string, PublicUser>> {
    if (emails.length === 0) {
      return new Map();
    }

    const users = (await this.userModel.find(
      { email: { $in: emails }, isActive: true },
      PUBLIC_FIELDS,
    )) as UserSnapshot[];

    return new Map(await Promise.all(users.map(async (user) => [user.email, await this.toPublicUser(user)] as const)));
  }
}

export class NetworkDirectory extends UserDirectory {
  constructor(
    userModel: Model<UserDocument>,
    private readonly identityEmail: string,
  ) {
    super(userModel);
  }

  async snapshot(): Promise<NetworkSnapshot | null> {
    const me = await this.findByEmail(this.identityEmail);

    if (!me) {
      return null;
    }

    const state = this.collectState(me);
    const relatedUsers = await this.resolvePublicUsers([...new Set([...state.connections, ...state.incoming, ...state.outgoing])]);
    const pickUsers = (emails: string[]) =>
      emails
        .map((email) => relatedUsers.get(email))
        .filter((user): user is PublicUser => Boolean(user))
        .sort((a, b) => a.username.localeCompare(b.username));

    return {
      self: await this.toPublicUser(me),
      connections: pickUsers(state.connections),
      incomingRequests: pickUsers(state.incoming),
      outgoingRequests: pickUsers(state.outgoing),
    };
  }

  async sendRequest(targetUsername: string): Promise<NetworkResult> {
    const me = await this.findByEmail(this.identityEmail);

    if (!me) {
      return this.fail(404, "Account not found.");
    }

    const selfUsername = await ensureUserHasUsername(this.userModel, me);

    if (targetUsername === selfUsername) {
      return this.fail(400, "You cannot connect with yourself.");
    }

    const target = await this.findByUsername(targetUsername);

    if (!target) {
      return this.fail(404, "User not found for that username.");
    }

    if (target.email === me.email) {
      return this.fail(400, "You cannot connect with yourself.");
    }

    const state = this.collectState(me);

    if (state.connectionSet.has(target.email)) {
      return this.refresh(`You are already connected with @${targetUsername}.`);
    }

    if (state.incomingSet.has(target.email)) {
      await this.connectPair(me, target);
      return this.refresh(`Connected with @${targetUsername}.`);
    }

    if (state.outgoingSet.has(target.email)) {
      return this.refresh(`Connection request already sent to @${targetUsername}.`);
    }

    await this.requestPair(me, target);
    return this.refresh(`Connection request sent to @${targetUsername}.`);
  }

  async updateRequest(targetUsername: string, action: NetworkAction): Promise<NetworkResult> {
    const me = await this.findByEmail(this.identityEmail);

    if (!me) {
      return this.fail(404, "Account not found.");
    }

    const target = await this.findByUsername(targetUsername);

    if (!target) {
      return this.fail(404, "User not found for that username.");
    }

    const state = this.collectState(me);
    const actionConfig = {
      accept: {
        allowed: state.incomingSet.has(target.email),
        deniedMessage: "No incoming request from that user.",
        message: `Accepted @${targetUsername}.`,
        run: () => this.connectPair(me, target),
      },
      decline: {
        allowed: state.incomingSet.has(target.email),
        deniedMessage: "No incoming request from that user.",
        message: `Declined @${targetUsername}.`,
        run: () => this.clearPairRequests(me, target),
      },
      cancel: {
        allowed: state.outgoingSet.has(target.email),
        deniedMessage: "No outgoing request to that user.",
        message: `Canceled request to @${targetUsername}.`,
        run: () => this.cancelPairRequest(me, target),
      },
    } satisfies Record<
      NetworkAction,
      {
        allowed: boolean;
        deniedMessage: string;
        message: string;
        run: () => Promise<unknown>;
      }
    >;

    const selectedAction = actionConfig[action];

    if (!selectedAction.allowed) {
      return this.fail(400, selectedAction.deniedMessage);
    }

    await selectedAction.run();
    return this.refresh(selectedAction.message);
  }

  async disconnect(targetUsername: string): Promise<NetworkResult> {
    const me = await this.findByEmail(this.identityEmail);

    if (!me) {
      return this.fail(404, "Account not found.");
    }

    const target = await this.findByUsername(targetUsername);

    if (!target) {
      return this.fail(404, "User not found for that username.");
    }

    await Promise.all([
      this.userModel.updateOne(
        { _id: me._id },
        {
          $pull: {
            connections: target.email,
            connectionRequestsIncoming: target.email,
            connectionRequestsOutgoing: target.email,
          },
        },
      ),
      this.userModel.updateOne(
        { _id: target._id },
        {
          $pull: {
            connections: me.email,
            connectionRequestsIncoming: me.email,
            connectionRequestsOutgoing: me.email,
          },
        },
      ),
    ]);

    return this.refresh(`Disconnected from @${targetUsername}.`, "Could not load network after disconnecting.");
  }

  private collectState(user: UserSnapshot): RelationshipState {
    const connections = this.uniqueEmails(user.connections, user.email);
    const incoming = this.uniqueEmails(user.connectionRequestsIncoming, user.email);
    const outgoing = this.uniqueEmails(user.connectionRequestsOutgoing, user.email);

    return {
      connections,
      incoming,
      outgoing,
      connectionSet: new Set(connections),
      incomingSet: new Set(incoming),
      outgoingSet: new Set(outgoing),
    };
  }

  private uniqueEmails(value: unknown, selfEmail: string): string[] {
    return normalizeConnectionEmails(value).filter((email) => email !== selfEmail);
  }

  private async connectPair(me: UserSnapshot, target: UserSnapshot): Promise<void> {
    await Promise.all([
      this.userModel.updateOne(
        { _id: me._id },
        {
          $addToSet: { connections: target.email },
          $pull: { connectionRequestsIncoming: target.email, connectionRequestsOutgoing: target.email },
        },
      ),
      this.userModel.updateOne(
        { _id: target._id },
        {
          $addToSet: { connections: me.email },
          $pull: { connectionRequestsIncoming: me.email, connectionRequestsOutgoing: me.email },
        },
      ),
    ]);
  }

  private async requestPair(me: UserSnapshot, target: UserSnapshot): Promise<void> {
    await Promise.all([
      this.userModel.updateOne({ _id: me._id }, { $addToSet: { connectionRequestsOutgoing: target.email } }),
      this.userModel.updateOne({ _id: target._id }, { $addToSet: { connectionRequestsIncoming: me.email } }),
    ]);
  }

  private async clearPairRequests(me: UserSnapshot, target: UserSnapshot): Promise<void> {
    await Promise.all([
      this.userModel.updateOne(
        { _id: me._id },
        { $pull: { connectionRequestsIncoming: target.email, connectionRequestsOutgoing: target.email } },
      ),
      this.userModel.updateOne(
        { _id: target._id },
        { $pull: { connectionRequestsIncoming: me.email, connectionRequestsOutgoing: me.email } },
      ),
    ]);
  }

  private async cancelPairRequest(me: UserSnapshot, target: UserSnapshot): Promise<void> {
    await Promise.all([
      this.userModel.updateOne({ _id: me._id }, { $pull: { connectionRequestsOutgoing: target.email } }),
      this.userModel.updateOne({ _id: target._id }, { $pull: { connectionRequestsIncoming: me.email } }),
    ]);
  }

  private async refresh(message: string, failureMessage = "Could not load network after update."): Promise<NetworkResult> {
    const network = await this.snapshot();
    return network ? { ok: true, message, network } : this.fail(503, failureMessage);
  }

  private fail(status: number, message: string): NetworkResult {
    return {
      ok: false,
      status,
      message,
    };
  }
}
