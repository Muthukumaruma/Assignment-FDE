import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

/** Connects to ONE database (dbName) on the cluster; other databases are never touched. */
export async function connectDb(uri: string, dbName: string): Promise<void> {
  await mongoose.connect(uri, { dbName });
  logger.info({ dbName }, 'connected to MongoDB');
}
