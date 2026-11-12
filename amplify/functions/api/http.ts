import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** An error with an HTTP status code. Its message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON response. CORS headers are added by the Function URL itself, not here. */
export function json(status: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Parses the JSON request body (Function URLs may base64-encode it). */
export function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/** Reads a string field from the body, or fails with 400. */
export function str(body: Record<string, unknown>, field: string, maxLength = 300): string {
  const v = body[field];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `"${field}" is required`);
  if (v.length > maxLength) throw new HttpError(400, `"${field}" is too long`);
  return v;
}
