import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { TASK_STATUSES, VERIFICATION_MODES, VERIFICATION_STATES } from "@/lib/tasks";

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
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "not_started",
      index: true,
    },
    // Legacy flag kept for compatibility with existing records and summary route.
    done: {
      type: Boolean,
      default: false,
    },
    scheduledDays: {
      type: [Number],
      default: [],
    },
    completionDates: {
      type: [String],
      default: [],
    },
    verification: {
      mode: {
        type: String,
        enum: VERIFICATION_MODES,
        default: "none",
      },
      state: {
        type: String,
        enum: VERIFICATION_STATES,
        default: "not_required",
      },
      proofLabel: {
        type: String,
        default: "",
        trim: true,
        maxlength: 160,
      },
      peerConfirmers: {
        type: [String],
        default: [],
      },
    },
    sharedWith: {
      type: [String],
      default: [],
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
