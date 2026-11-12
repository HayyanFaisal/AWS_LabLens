/**
 * Our own minimal authentication (no Cognito), using only Node's built-in crypto.
 *
 * Passwords: scrypt (a slow, memory-hard hash) with a random 16-byte salt per user.
 *            We store only the salt and the hash, never the password.
 * Tokens:    JWT-style "header.payload.signature", signed with HMAC-SHA256 and
 *            the server-only TOKEN_SECRET. Valid for 12 hours.
 */
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 8;

function scrypt(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, keyLength, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Returns a problem description, or null if the credentials are acceptable. */
export function credentialProblem(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username))
    return 'Username must be 3-30 characters: lowercase letters, numbers or _';
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 200) return 'Password is too long';
  return null;
}

export async function hashPassword(password: string, salt: Buffer = randomBytes(16)) {
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return { salt: salt.toString('base64'), passwordHash: hash.toString('base64') };
}

/** Re-hashes the attempt with the stored salt and compares in constant time. */
export async function verifyPassword(password: string, salt: string, passwordHash: string) {
  const expected = Buffer.from(passwordHash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

export function signToken(username: string, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: username, iat, exp: iat + TOKEN_TTL_SECONDS });
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

/** Returns the username inside a valid, unexpired token, otherwise null. */
export function verifyToken(token: string, secret: string, now = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now) return null; // expired
    return claims.sub;
  } catch {
    return null;
  }
}
