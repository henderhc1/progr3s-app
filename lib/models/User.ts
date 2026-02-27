import mongoose, { InferSchemaType, Model, Schema, model, models } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]{3,24}$/,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    connections: {
      type: [String],
      default: [],
    },
    connectionRequestsIncoming: {
      type: [String],
      default: [],
    },
    connectionRequestsOutgoing: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: string;
};

export function getUserModel(connection: typeof mongoose = mongoose): Model<UserDocument> {
  const existingModel = connection.models.User as Model<UserDocument> | undefined;

  if (existingModel) {
    return existingModel;
  }

  return connection.model<UserDocument>("User", userSchema);
}

export const UserModel: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>("User", userSchema);
