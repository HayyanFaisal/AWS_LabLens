/**
 * LabLens API: one Lambda behind a Function URL.
 * Each request is matched against the route table below. Routes marked
 * `auth: true` need "Authorization: Bearer <token>"; the username inside the
 * verified token is the ONLY identity we trust (never one sent in the body).
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { verifyToken } from './auth';
import { env } from './aws';
import { HttpError, json, parseBody } from './http';
import { login, register } from './users';
import { demoLogin } from './demo';
import { createIdUploadUrl, getProfile, saveProfile, scanIdCard } from './profile';
import {
  analyzeReport,
  createUploadUrl,
  deleteReport,
  getFileUrl,
  getReport,
  listReports,
} from './reports';

interface Ctx {
  username: string; // '' for public routes
  params: string[]; // regex capture groups, e.g. the report id
  body: Record<string, unknown>;
}

interface Route {
  method: string;
  path: RegExp;
  auth: boolean;
  run: (ctx: Ctx) => Promise<unknown>;
  status?: number;
}

const routes: Route[] = [
  { method: 'POST', path: /^\/auth\/register$/, auth: false, status: 201, run: (c) => register(c.body) },
  { method: 'POST', path: /^\/auth\/login$/, auth: false, run: (c) => login(c.body) },
  { method: 'POST', path: /^\/auth\/demo$/, auth: false, run: (c) => demoLogin(c.body) },
  { method: 'GET', path: /^\/auth\/me$/, auth: true, run: async (c) => ({ username: c.username }) },
  { method: 'GET', path: /^\/profile$/, auth: true, run: (c) => getProfile(c.username) },
  { method: 'PUT', path: /^\/profile$/, auth: true, run: (c) => saveProfile(c.username, c.body) },
  { method: 'POST', path: /^\/profile\/id-upload-url$/, auth: true, run: (c) => createIdUploadUrl(c.username, c.body) },
  { method: 'POST', path: /^\/profile\/scan-id$/, auth: true, run: (c) => scanIdCard(c.username, c.body) },
  { method: 'POST', path: /^\/reports\/upload-url$/, auth: true, run: (c) => createUploadUrl(c.username, c.body) },
  { method: 'POST', path: /^\/reports\/analyze$/, auth: true, run: (c) => analyzeReport(c.username, c.body) },
  { method: 'GET', path: /^\/reports$/, auth: true, run: (c) => listReports(c.username) },
  { method: 'GET', path: /^\/reports\/([^/]+)$/, auth: true, run: (c) => getReport(c.username, c.params[0]) },
  { method: 'GET', path: /^\/reports\/([^/]+)\/file-url$/, auth: true, run: (c) => getFileUrl(c.username, c.params[0]) },
  { method: 'DELETE', path: /^\/reports\/([^/]+)$/, auth: true, run: (c) => deleteReport(c.username, c.params[0]) },
];

/** Reads and verifies the Bearer token. Throws 401 if missing, invalid or expired. */
function authenticate(event: APIGatewayProxyEventV2): string {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const username = token ? verifyToken(token, env.tokenSecret()) : null;
  if (!username) throw new HttpError(401, 'Please sign in again');
  return username;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const started = Date.now();
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  let status = 500;
  try {
    const sameMethod = routes.filter((r) => r.method === method);
    const match = sameMethod
      .map((r) => ({ route: r, m: r.path.exec(path) }))
      .find((x) => x.m);
    if (!match) throw new HttpError(404, `No route for ${method} ${path}`);

    const { route, m } = match;
    const username = route.auth ? authenticate(event) : '';
    const result = await route.run({ username, params: m!.slice(1), body: parseBody(event) });
    status = route.status ?? 200;
    return json(status, result);
  } catch (err) {
    if (err instanceof HttpError) {
      status = err.status;
      return json(status, { error: err.message });
    }
    console.error('Unhandled error:', err);
    return json(500, { error: 'Something went wrong on the server' });
  } finally {
    // Only method, path, status and time: never tokens, passwords or bodies
    console.log(`${method} ${path} -> ${status} in ${Date.now() - started} ms`);
  }
};
