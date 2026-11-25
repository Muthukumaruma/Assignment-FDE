// Deterministic env for tests: no real secrets, no real services.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/unused';
process.env.MONGODB_DB = 'career_intelligence_test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.LOG_LEVEL = 'silent';
