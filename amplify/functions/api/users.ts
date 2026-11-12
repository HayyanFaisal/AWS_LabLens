/** /auth routes: register, login. Users live in the DynamoDB Users table. */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, env } from './aws';
import { credentialProblem, hashPassword, signToken, verifyPassword } from './auth';
import { DEMO_PREFIX } from './demo';
import { HttpError, str } from './http';

const INVALID_LOGIN = 'Invalid username or password';

export async function register(body: Record<string, unknown>) {
  const username = str(body, 'username', 30).trim().toLowerCase();
  const password = str(body, 'password', 200);
  const problem = credentialProblem(username, password);
  if (problem) throw new HttpError(400, problem);
  if (username.startsWith(DEMO_PREFIX)) throw new HttpError(400, 'Usernames starting with "demo_" are reserved for the demo profiles');

  const { salt, passwordHash } = await hashPassword(password);
  try {
    await ddb.send(
      new PutCommand({
        TableName: env.usersTable(),
        Item: { username, salt, passwordHash, createdAt: new Date().toISOString() },
        // Fails if the username already exists, so two sign-ups can never overwrite each other
        ConditionExpression: 'attribute_not_exists(username)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new HttpError(409, 'That username is already taken');
    }
    throw err;
  }
  console.log('Registered new user');
  return { username, token: signToken(username, env.tokenSecret()) };
}

// A fixed fake hash, so a login for an unknown user takes as long as a real one
// (otherwise response time would reveal which usernames exist).
let dummy: { salt: string; passwordHash: string } | null = null;

export async function login(body: Record<string, unknown>) {
  const username = str(body, 'username', 30).trim().toLowerCase();
  const password = str(body, 'password', 200);

  const { Item } = await ddb.send(
    new GetCommand({ TableName: env.usersTable(), Key: { username } }),
  );
  if (!Item) {
    dummy ??= await hashPassword('not-a-real-password');
    await verifyPassword(password, dummy.salt, dummy.passwordHash);
    throw new HttpError(401, INVALID_LOGIN);
  }
  const ok = await verifyPassword(password, Item.salt, Item.passwordHash);
  if (!ok) throw new HttpError(401, INVALID_LOGIN);
  return { username, token: signToken(username, env.tokenSecret()) };
}
