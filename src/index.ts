import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import auth from './routes/auth';
import health from './routes/health';

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  JWT_SECRET: string;
  CORS_ORIGINS?: string;
  PRIMARY_DOMAIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin: string, c: any) => {
    const allowedOrigins = (c.env.CORS_ORIGINS || 'https://rmpgutah.us').split(',').map((s: string) => s.trim());
    if (allowedOrigins.includes('*')) return origin;
    if (!origin || allowedOrigins.includes(origin)) return origin;
    return allowedOrigins[0];
  },
  credentials: true,
}));

// CSRF protection handled by JWT auth middleware + CORS

app.get('/', (c) => c.json({ name: 'RMPG Flex API', version: '1.0.0', status: 'running' }));

app.route('/api/health', health);
app.route('/api/auth', auth);

export default app;
