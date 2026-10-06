const SINGULAR_EXCEPTIONS: Record<string, string> = { calves: 'calf', ups: 'up', abs: 'abs', press: 'press', plus: 'plus' };

function singular(word: string): string {
  if (SINGULAR_EXCEPTIONS[word]) return SINGULAR_EXCEPTIONS[word];
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Lower case, singular, compound words joined ("Push-Ups" → "pushup", "Dumbbell" → "db"). */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_/+&()[\]{}.,:;!?]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .replace(/\bdumbbell\b/g, 'db')
    .replace(/\bbarbell\b/g, 'bb')
    .replace(/\bresistance band\b/g, 'band')
    .replace(/\b(push|pull|chin|sit|step|muscle|press) up\b/g, '$1up')
    .replace(/\b(pull|push) down\b/g, '$1down')
    .trim();
}

/** Same exercise despite spelling ("Push-ups" = "push up" = "Pushups"). */
export function sameExercise(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = normalizeExerciseName(a);
  return !!x && x === normalizeExerciseName(b);
}
