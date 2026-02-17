import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const taskSchema = new Schema(
  {
    ownerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 140,
    },
    done: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export type TaskDocument = InferSchemaType<typeof taskSchema> & {
  _id: string;
};

export const TaskModel: Model<TaskDocument> =
  (models.Task as Model<TaskDocument>) ?? model<TaskDocument>("Task", taskSchema);
