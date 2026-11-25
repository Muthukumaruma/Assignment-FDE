import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';

let mongod: MongoMemoryServer | undefined;

export async function startMemoryDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'career_intelligence_test' });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function clearDb(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export async function stopMemoryDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

/** Registers a user and returns a supertest agent that carries the session cookie. */
export async function registerAndLogin(app: Express, email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password: 'password123', name: email.split('@')[0] });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  return { agent, cookie, user: res.body as { id: string; email: string; role: string } };
}
