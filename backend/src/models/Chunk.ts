import { Schema, model } from 'mongoose';

const chunkSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  docId: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['resume', 'job'], required: true },
  label: { type: String, required: true },
  section: { type: String, required: true },
  text: { type: String, required: true },
  order: { type: Number, required: true },
  embedding: { type: [Number], required: true },
});
chunkSchema.index({ userId: 1, docId: 1, order: 1 });

export const Chunk = model('Chunk', chunkSchema);
