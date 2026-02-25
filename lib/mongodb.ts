import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // Keep startup explicit so missing env is easy to diagnose.
  console.warn("MONGODB_URI is not set. API routes will use demo fallback mode.");
}

type CachedConnection = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Fail fast when a query is attempted without an active connection.
mongoose.set("bufferCommands", false);

const globalWithMongoose = global as typeof globalThis & {
  mongoose?: CachedConnection;
};

const cached: CachedConnection = globalWithMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

globalWithMongoose.mongoose = cached;

function isConnected(connection: typeof mongoose | null): boolean {
  return !!connection && connection.connection.readyState === 1;
}

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI) {
    return null;
  }

  if (isConnected(cached.conn)) {
    return cached.conn;
  }

  // If we kept a stale/disconnected connection object, force a clean retry.
  if (cached.conn && cached.conn.connection.readyState !== 1) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    // Reuse a single promise to avoid duplicate connection attempts.
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "progr3s",
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      })
      .catch((error) => {
        cached.promise = null;
        cached.conn = null;
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
