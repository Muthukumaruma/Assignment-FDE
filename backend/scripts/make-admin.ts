/**
 * Promotes an existing account to admin. Run on the server (needs DB credentials):
 *   npm run make-admin -- someone@example.com
 * This is the bootstrap path when Google sign-in is not configured.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDb } from '../src/db/connect.js';
import { User } from '../src/models/User.js';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}
await connectDb(env.MONGODB_URI, env.MONGODB_DB);
const res = await User.updateOne({ email }, { role: 'admin' });
console.log(res.matchedCount ? `${email} is now an admin` : `No user with email ${email}`);
await mongoose.disconnect();
