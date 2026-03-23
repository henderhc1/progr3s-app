import { NextResponse } from "next/server";
import { NetworkDirectory, type NetworkAction } from "@/lib/networkDirectory";
import { UserRouteAccess } from "@/lib/session";
import { isValidUsername, normalizeUsername } from "@/lib/users";

type NetworkBody = {
  username?: string;
  action?: NetworkAction;
};

async function requireNetworkAccess() {
  return UserRouteAccess.create({
    forbiddenMessage: "Dashboard network is user-only.",
    databaseRequiredMessage: "Network connections require MongoDB mode.",
  });
}

async function readBody(request: Request): Promise<NetworkBody | null> {
  return (await request.json().catch(() => null)) as NetworkBody | null;
}

function readTargetUsername(value: unknown): string {
  return normalizeUsername(value);
}

function isNetworkAction(value: unknown): value is NetworkAction {
  return value === "accept" || value === "decline" || value === "cancel";
}

function toNetworkResponse(result: Awaited<ReturnType<NetworkDirectory["sendRequest"]>>) {
  return result.ok
    ? NextResponse.json({ ok: true, message: result.message, network: result.network })
    : NextResponse.json({ ok: false, message: result.message }, { status: result.status });
}

export async function GET() {
  const auth = await requireNetworkAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const network = await new NetworkDirectory(auth.access.userModel, auth.access.identity.email).snapshot();

  return network
    ? NextResponse.json({ ok: true, network })
    : NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
}

export async function POST(request: Request) {
  const auth = await requireNetworkAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = readTargetUsername(body.username);

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json(
      { ok: false, message: "Username must be 3-24 characters and use only letters, numbers, or underscores." },
      { status: 400 },
    );
  }

  return toNetworkResponse(await new NetworkDirectory(auth.access.userModel, auth.access.identity.email).sendRequest(targetUsername));
}

export async function PATCH(request: Request) {
  const auth = await requireNetworkAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = readTargetUsername(body.username);

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json({ ok: false, message: "Provide a valid username." }, { status: 400 });
  }

  if (!isNetworkAction(body.action)) {
    return NextResponse.json({ ok: false, message: "Provide a valid network action." }, { status: 400 });
  }

  return toNetworkResponse(
    await new NetworkDirectory(auth.access.userModel, auth.access.identity.email).updateRequest(targetUsername, body.action),
  );
}

export async function DELETE(request: Request) {
  const auth = await requireNetworkAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = readTargetUsername(body.username);

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json({ ok: false, message: "Provide a valid username." }, { status: 400 });
  }

  return toNetworkResponse(await new NetworkDirectory(auth.access.userModel, auth.access.identity.email).disconnect(targetUsername));
}
