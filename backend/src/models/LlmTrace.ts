import { Schema, model } from 'mongoose';

const llmTraceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, index: true },
  requestId: { type: String, required: true },
  op: { type: String, enum: ['embed', 'chat', 'analyze', 'guard'], required: true },
  model: { type: String, required: true },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  latencyMs: { type: Number, required: true },
  costUsd: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const LlmTrace = model('LlmTrace', llmTraceSchema);
