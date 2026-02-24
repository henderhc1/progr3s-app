import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await connectToDatabase();

    if (!db) {
      return NextResponse.json(
        {
          ok: false,
          connected: false,
          message: "MONGODB_URI is not configured.",
        },
        { status: 503 },
      );
    }

    const admin = db.connection.db?.admin();

    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          connected: false,
          message: "MongoDB connection exists but admin interface is unavailable.",
        },
        { status: 500 },
      );
    }

    await admin.ping();

    return NextResponse.json({
      ok: true,
      connected: true,
      database: db.connection.name,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        message: "Could not connect to MongoDB cluster.",
      },
      { status: 500 },
    );
  }
}
