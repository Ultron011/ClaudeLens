// Best-effort secret redaction applied before a session leaves a developer's
// machine. This is a safety net, not a guarantee — the CLI always shows a
// preview and requires explicit confirmation before upload.

interface Rule {
  name: string;
  re: RegExp;
}

const RULES: Rule[] = [
  { name: 'anthropic-key', re: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: 'openai-key', re: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'github-token', re: /gh[pousr]_[a-zA-Z0-9]{20,}/g },
  { name: 'slack-token', re: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
  { name: 'google-key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { name: 'jwt', re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
  { name: 'bearer', re: /[Bb]earer\s+[a-zA-Z0-9._-]{20,}/g },
  // key=value / key: value style assignments to sensitive names
  { name: 'assignment', re: /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Z0-9_]*)\b(\s*[:=]\s*)(["']?)([^\s"']{6,})\3/gi },
  // connection strings with inline credentials
  { name: 'conn-uri', re: /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi },
];

export interface RedactionResult {
  text: string;
  hits: Record<string, number>;
}

/** Redact a single string, returning the cleaned text and per-rule hit counts. */
export function redactText(input: string): RedactionResult {
  let text = input;
  const hits: Record<string, number> = {};
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args: unknown[]) => {
      hits[rule.name] = (hits[rule.name] ?? 0) + 1;
      if (rule.name === 'assignment') {
        const [, key, sep] = args as [string, string, string];
        return `${key}${sep}«REDACTED»`;
      }
      if (rule.name === 'conn-uri') {
        const [, scheme, user] = args as [string, string, string];
        return `${scheme}${user}:«REDACTED»@`;
      }
      return '«REDACTED»';
    });
  }
  return { text, hits };
}

function mergeHits(into: Record<string, number>, from: Record<string, number>) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

/** Deep-redact any JSON-serializable value in place-ish (returns a new copy). */
export function redactDeep<T>(value: T): { value: T; hits: Record<string, number> } {
  const hits: Record<string, number> = {};
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = redactText(v);
      mergeHits(hits, r.hits);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, hits };
}
