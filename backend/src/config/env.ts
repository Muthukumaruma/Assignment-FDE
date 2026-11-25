import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default('career_intelligence'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBED_MODEL: z.string().default('text-embedding-3-small'),
  JWT_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().default(''),
  ADMIN_EMAIL: z.string().default(''),
  CORS_ORIGIN: z.string().default('http://localhost:5190'),
  LOG_LEVEL: z.string().default('info'),
  /** Reverse proxies in front of the API (nginx = 1; Cloudflare Pages Function + Render = 2). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // Cloudflare R2 (optional). When unset, original files are not kept.
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

// Fail fast at startup with a readable message instead of a crash deep in a request.
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${issues}`);
}

export const env: Env = parsed.data;
