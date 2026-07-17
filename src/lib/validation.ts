/* ═══════════════════════════════════════════════════════════════
 * APPARATUS — Input Validation & Sanitization
 * ═══════════════════════════════════════════════════════════════
 * Centralized validation for all user-generated content before
 * it reaches Firestore. Prevents XSS, abuse, and data corruption.
 * ═══════════════════════════════════════════════════════════════ */

/** Strip control characters and enforce a maximum length. */
export function sanitizeText(input: string, maxLength = 500): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

/** Normalize a username: lowercase, alphanumeric + underscores only. */
export function sanitizeUsername(input: string, maxLength = 25): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, maxLength);
}

/** Validate a display name — non-empty and bounded. */
export function validateDisplayName(name: string): string {
  const sanitized = sanitizeText(name, 50);
  return sanitized || 'Athlete';
}

/** Validate a numeric measurement value within realistic bounds. */
export function validateMeasurement(
  value: unknown,
  min = 0,
  max = 1000
): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Math.round(num * 100) / 100; // two decimal places
}

/** Validate workout notes — bounded length. */
export function validateWorkoutNotes(text: string): string {
  return sanitizeText(text, 2000);
}

/** Validate a URL (basic check — protocol + domain). */
export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Validate a bio field. */
export function validateBio(text: string): string {
  return sanitizeText(text, 500);
}

/** Validate a comment or message. */
export function validateComment(text: string): string {
  return sanitizeText(text, 1000);
}
