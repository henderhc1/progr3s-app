import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { ACTIVE_VERIFICATION_MODES, GOAL_TYPES, TASK_STATUSES, VERIFICATION_MODES, VERIFICATION_STATES } from "@/lib/tasks";

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
    goalType: {
      type: String,
      enum: GOAL_TYPES,
      default: "general",
      index: true,
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
    goalTasks: {
      type: [
        new Schema(
          {
            id: {
              type: String,
              required: true,
              trim: true,
            },
            title: {
              type: String,
              required: true,
              trim: true,
              minlength: 2,
              maxlength: 120,
            },
            done: {
              type: Boolean,
              default: false,
            },
            requiresProof: {
              type: Boolean,
              default: false,
            },
            proofLabel: {
              type: String,
              default: "",
              trim: true,
              maxlength: 160,
            },
            proofImageDataUrl: {
              type: String,
              default: "",
              maxlength: 2_500_000,
            },
            completedAt: {
              type: String,
              default: "",
              trim: true,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    verification: {
      mode: {
        type: String,
        enum: VERIFICATION_MODES,
        default: "none",
      },
      modes: {
        type: [
          {
            type: String,
            enum: ACTIVE_VERIFICATION_MODES,
          },
        ],
        default: [],
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
      proofImageDataUrl: {
        type: String,
        default: "",
        maxlength: 2_500_000,
      },
      geolocationLabel: {
        type: String,
        default: "",
        trim: true,
        maxlength: 160,
      },
      peerConfirmers: {
        type: [String],
        default: [],
      },
      peerConfirmations: {
        type: [
          {
            email: {
              type: String,
              required: true,
              lowercase: true,
              trim: true,
            },
            confirmedAt: {
              type: Date,
              required: true,
            },
          },
        ],
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
