export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string;
}

export interface FitAnalysis {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceAlignment: string;
  summary: string;
  interviewTopics: string[];
  analyzedAt?: string;
}

export interface Doc {
  id: string;
  kind: 'resume' | 'job';
  label: string;
  title: string;
  company?: string;
  analysis?: FitAnalysis;
  analysisStale: boolean;
  createdAt: string;
}

export interface Source {
  label: string;
  section: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
  error?: string;
}

export interface Usage {
  totals: { calls: number; promptTokens: number; completionTokens: number; costUsd: number };
  latency: { p50: number; p95: number };
  byOp: Record<string, { calls: number; costUsd: number; avgLatencyMs: number }>;
  byUser?: { userId: string; email: string; calls: number; costUsd: number }[];
}

export interface AdminUser extends User {
  createdAt: string;
  docCount: number;
}
