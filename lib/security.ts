import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const PASSWORD_HASH_ALGORITHM = 'scrypt';
const PASSWORD_SCRYPT_N = 16_384;
const PASSWORD_SCRYPT_R = 8;
const PASSWORD_SCRYPT_P = 1;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const PASSWORD_MAX_MEMORY = 32 * 1024 * 1024;

export const WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60;

const replayCache = new Map<string, number>();

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  options: { n: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      {
        N: options.n,
        r: options.r,
        p: options.p,
        maxmem: PASSWORD_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function constantTimeBufferEqual(left: Uint8Array, right: Uint8Array): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_LENGTH);
  const derivedKey = await derivePasswordKey(password, salt, {
    n: PASSWORD_SCRYPT_N,
    r: PASSWORD_SCRYPT_R,
    p: PASSWORD_SCRYPT_P,
  });

  return [
    PASSWORD_HASH_ALGORITHM,
    PASSWORD_SCRYPT_N,
    PASSWORD_SCRYPT_R,
    PASSWORD_SCRYPT_P,
    toBase64Url(salt),
    toBase64Url(derivedKey),
  ].join('$');
}

function parsePasswordHash(storedHash: string): {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  digest: Buffer;
} | null {
  const [algorithm, nValue, rValue, pValue, saltValue, digestValue] = storedHash.split('$');
  const n = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);
  const salt = saltValue ? fromBase64Url(saltValue) : null;
  const digest = digestValue ? fromBase64Url(digestValue) : null;

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    n < 1_024 ||
    n > 32_768 ||
    r < 1 ||
    r > 16 ||
    p < 1 ||
    p > 4 ||
    !salt ||
    salt.length < 16 ||
    salt.length > 64 ||
    !digest ||
    digest.length !== PASSWORD_KEY_LENGTH
  ) {
    return null;
  }

  return { n, r, p, salt, digest };
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (!storedHash) {
    return { valid: false, needsMigration: false };
  }

  const parsed = parsePasswordHash(storedHash);
  if (!parsed) {
    if (storedHash.startsWith(`${PASSWORD_HASH_ALGORITHM}$`)) {
      return { valid: false, needsMigration: false };
    }
    return {
      valid: constantTimeStringEqual(password, storedHash),
      needsMigration: true,
    };
  }

  try {
    const derivedKey = await derivePasswordKey(password, parsed.salt, parsed);
    return {
      valid: constantTimeBufferEqual(derivedKey, parsed.digest),
      needsMigration:
        parsed.n !== PASSWORD_SCRYPT_N ||
        parsed.r !== PASSWORD_SCRYPT_R ||
        parsed.p !== PASSWORD_SCRYPT_P,
    };
  } catch {
    return { valid: false, needsMigration: false };
  }
}

export function getConfiguredSecret(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeSignature(signature: string): Buffer | null {
  const normalized = signature.trim().replace(/^(?:sha256|v1)=/i, '');
  if (/^[0-9a-f]{64}$/i.test(normalized)) {
    return Buffer.from(normalized, 'hex');
  }

  try {
    const decoded = Buffer.from(normalized, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function cleanReplayCache(now: number): void {
  for (const [key, expiresAt] of replayCache) {
    if (expiresAt <= now) {
      replayCache.delete(key);
    }
  }

  if (replayCache.size <= 10_000) {
    return;
  }

  const oldest = [...replayCache.entries()]
    .sort(([, left], [, right]) => left - right)
    .slice(0, replayCache.size - 10_000);
  for (const [key] of oldest) {
    replayCache.delete(key);
  }
}

export function createWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp?: number,
): string {
  const message = timestamp === undefined ? rawBody : `${timestamp}.${rawBody}`;
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

export function verifyWebhookSignature({
  rawBody,
  signature,
  secret,
  timestamp,
  now = Date.now(),
}: {
  rawBody: string;
  signature: string | null;
  secret: string;
  timestamp: string | null;
  now?: number;
}): boolean {
  if (!signature || !secret) {
    return false;
  }

  const parsedSignature = normalizeSignature(signature);
  if (!parsedSignature) {
    return false;
  }

  const timestampSeconds = timestamp === null ? undefined : Number(timestamp);
  if (timestampSeconds !== undefined) {
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(now / 1000) - timestampSeconds) > WEBHOOK_REPLAY_WINDOW_SECONDS
    ) {
      return false;
    }
  }

  const expectedMessages = timestampSeconds === undefined
    ? [rawBody]
    : [`${timestampSeconds}.${rawBody}`, rawBody];
  const valid = expectedMessages.some((message) =>
    constantTimeBufferEqual(
      parsedSignature,
      createHmac('sha256', secret).update(message, 'utf8').digest(),
    ),
  );
  if (!valid) {
    return false;
  }

  cleanReplayCache(now);
  const replayKey = `${timestampSeconds ?? 'none'}:${parsedSignature.toString('hex')}`;
  if (replayCache.has(replayKey)) {
    return false;
  }
  replayCache.set(replayKey, now + WEBHOOK_REPLAY_WINDOW_SECONDS * 1000);
  return true;
}
