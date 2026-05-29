// JWT verification middleware + ownership helpers for mutation endpoints.
//
// Every protected route requires:
//   Authorization: Bearer <supabase-session-jwt>
//
// The middleware:
//   1. Validates the JWT via supabase.auth.getUser(token) — Supabase does the
//      signature check against its own keys; we don't need SUPABASE_JWT_SECRET.
//   2. Looks up the caller's _recruiters row by email (case-insensitive).
//      Caller must exist in _recruiters; Google users who aren't registered
//      get a 403 here even if they have a valid Supabase session.
//   3. Stashes { recruiterId, isAdmin, email, userId } on req.auth for the
//      route handler.
//
// Ownership: non-admins can only mutate rows where _role.created_by matches
// their recruiterId. Admins skip the check.

import type { NextFunction, Request, Response } from 'express';
import { supabase } from './db.js';

export interface AuthContext {
  userId: string;
  email: string;
  recruiterId: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'empty bearer token' });
    return;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user || !userData.user.email) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  const { data: recruiter, error: recErr } = await supabase
    .from('_recruiters')
    .select('id, is_admin')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (recErr) {
    console.error('[auth] _recruiters lookup failed:', recErr.message);
    res.status(500).json({ error: 'auth lookup failed' });
    return;
  }
  if (!recruiter) {
    res.status(403).json({ error: 'not registered as a recruiter' });
    return;
  }

  req.auth = {
    userId: userData.user.id,
    email: userData.user.email,
    recruiterId: recruiter.id as string,
    isAdmin: Boolean(recruiter.is_admin),
  };
  next();
}

/**
 * Confirms the caller owns the role (or is admin). Sends 403/404 on failure
 * and returns false; the caller should `return` immediately on false.
 */
export async function checkRoleOwnership(
  req: Request,
  res: Response,
  roleId: string,
): Promise<boolean> {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'not authenticated' });
    return false;
  }
  if (auth.isAdmin) return true;
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return false;
  }

  const { data: role, error } = await supabase
    .from('_role')
    .select('created_by')
    .eq('id', roleId)
    .maybeSingle();
  if (error) {
    console.error('[auth] role ownership lookup failed:', error.message);
    res.status(500).json({ error: 'ownership check failed' });
    return false;
  }
  if (!role) {
    res.status(404).json({ error: 'role not found' });
    return false;
  }
  if (role.created_by !== auth.recruiterId) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}
