import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const analysisSchema = new Schema(
  {
    score: Number,
    matchedSkills: [String],
    missingSkills: [String],
    experienceAlignment: String,
    summary: String,
    interviewTopics: [String],
    scorecard: {
      type: new Schema(
        Object.fromEntries(
          ['atsCompatibility', 'keywordMatch', 'technicalSkills', 'experienceRelevance', 'leadershipArchitecture'].map((k) => [
            k,
            { type: new Schema({ score: Number, note: String }, { _id: false }) },
          ]),
        ),
        { _id: false },
      ),
      default: undefined,
    },
    analyzedAt: Date,
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['resume', 'job'], required: true },
    /** Human-facing label used in prompts and citations: "Resume" or "Job #N". */
    label: { type: String, required: true },
    jobNumber: { type: Number },
    title: { type: String, required: true },
    company: { type: String },
    rawText: { type: String, required: true },
    analysis: { type: analysisSchema, default: undefined },
    /** Original upload in object storage (R2). Absent for pasted text or when storage is off. */
    file: {
      type: new Schema({ key: String, name: String, mimeType: String, size: Number }, { _id: false }),
      default: undefined,
    },
    analysisStale: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type DocumentDoc = InferSchemaType<typeof documentSchema> & { _id: Types.ObjectId };
// "Document" collides with the DOM global name in some tooling, hence DocumentModel.
export const DocumentModel = model('Document', documentSchema);
