import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, index: { unique: true, sparse: true } },
    avatarUrl: { type: String },
    role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
    /** Bumped whenever credentials change; tokens carrying an older version are rejected. */
    sessionVersion: { type: Number, default: 0, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import('mongoose').Types.ObjectId };
export const User = model('User', userSchema);
