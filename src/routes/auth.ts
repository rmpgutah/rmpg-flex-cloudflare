import { Hono } from 'hono';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { compareSync, hashSync } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb, queryFirst, query, execute } from '../utils/db';
import { authMiddleware, type JwtPayload } from '../middleware/auth';

const auth = new Hono<{ Bindings: { DB: D1Database; KV: KVNamespace; JWT_SECRET: string }; Variables: { user: { id: number; username: string; role: string; full_name: string }; userId: number } }>();

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(128),
  totp_code: z.string().optional(),
});

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { username, password } = parsed.data;
    const db = getDb(c.env);

    const user = await queryFirst<{
      id: number; username: string; password_hash: string; role: string;
      full_name: string; status: string; force_password_change: number;
    }>(
      db,
      'SELECT id, username, password_hash, role, full_name, status, force_password_change FROM users WHERE username = ?',
      username
    );

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    if (user.status !== 'active') {
      return c.json({ error: 'Account is inactive' }, 403);
    }

    const valid = compareSync(password, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const jwtSecret = new TextEncoder().encode(c.env.JWT_SECRET as string);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      sub: String(user.id),
      user_id: user.id,
      username: user.username,
      role: user.role,
    } as JwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime('15m')
      .sign(jwtSecret);

    const refreshToken = uuidv4();
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await execute(
      db,
      "INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at) VALUES (?, ?, ?, datetime('now', '+15 minutes'), ?)",
      user.id, accessToken, refreshToken, refreshExpiresAt
    );

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
      },
      force_password_change: user.force_password_change === 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Login failed';
    console.error('Login error:', msg, err);
    return c.json({ error: msg }, 500);
  }
});

auth.post('/refresh', async (c) => {
  try {
    const { refresh_token } = await c.req.json<{ refresh_token: string }>();
    if (!refresh_token) {
      return c.json({ error: 'Refresh token required' }, 400);
    }

    const db = getDb(c.env);
    const session = await queryFirst<{
      id: number; user_id: number; token: string;
    }>(
      db,
      "SELECT id, user_id, token FROM sessions WHERE refresh_token = ? AND refresh_expires_at > datetime('now')",
      refresh_token
    );

    if (!session) {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }

    const user = await queryFirst<{
      id: number; username: string; role: string; full_name: string;
    }>(
      db,
      'SELECT id, username, role, full_name FROM users WHERE id = ? AND status = ?',
      session.user_id, 'active'
    );

    if (!user) {
      return c.json({ error: 'User not found' }, 401);
    }

    const jwtSecret = new TextEncoder().encode(c.env.JWT_SECRET as string);
    const now = Math.floor(Date.now() / 1000);
    const newAccessToken = await new SignJWT({
      sub: String(user.id),
      user_id: user.id,
      username: user.username,
      role: user.role,
    } as JwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime('15m')
      .sign(jwtSecret);

    await execute(
      db,
      "UPDATE sessions SET token = ?, expires_at = datetime('now', '+15 minutes') WHERE id = ?",
      newAccessToken, session.id
    );

    return c.json({
      access_token: newAccessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
      },
    });
  } catch (err) {
    return c.json({ error: 'Refresh failed' }, 500);
  }
});

auth.post('/logout', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  await execute(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
  return c.json({ message: 'Logged out' });
});

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

auth.put('/password', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { current_password, new_password } = await c.req.json<{ current_password: string; new_password: string }>();

    if (!current_password || !new_password) {
      return c.json({ error: 'Current and new password required' }, 400);
    }

    if (new_password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const db = getDb(c.env);
    const user = await queryFirst<{ password_hash: string }>(
      db,
      'SELECT password_hash FROM users WHERE id = ?',
      userId
    );

    if (!user || !compareSync(current_password, user.password_hash)) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const newHash = hashSync(new_password, 12);
    await execute(
      db,
      "UPDATE users SET password_hash = ?, force_password_change = 0, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      newHash, userId
    );

    return c.json({ message: 'Password updated' });
  } catch (err) {
    return c.json({ error: 'Password change failed' }, 500);
  }
});

export default auth;
