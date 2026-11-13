import { randomBytes } from 'node:crypto';

// base62 alphabet, digits first
const ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateSlug(length = 8) {
  const bytes = randomBytes(length);
  let slug = '';
  for (let i = 0; i < length; i += 1) {
    slug += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return slug;
}
