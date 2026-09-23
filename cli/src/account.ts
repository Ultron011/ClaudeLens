// Reads the signed-in account from ~/.claude.json → oauthAccount. This file is
// Claude Code's own state and gets rewritten constantly (and its shape isn't
// contractual), so a read here must NEVER throw and NEVER block a session —
// missing / unreadable / truncated / shape-changed all just mean "no identity".
// Honors CLAUDE_CONFIG_DIR, matching Claude Code's own resolution: the file sits INSIDE the config
// dir for a profile ($CLAUDE_CONFIG_DIR/.claude.json) but BESIDE the default one (~/.claude.json).
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AccountIdentity } from '@claudelens/shared';

export function accountPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR?.trim() || homedir(), '.claude.json');
}

// Cache only a successful read — Claude Code rewrites this file constantly,
// so a torn/failed read must not be remembered as "no account" forever.
let cached: AccountIdentity | undefined;
let hasCached = false;

export async function readAccount(): Promise<AccountIdentity | undefined> {
  if (hasCached) return cached;
  try {
    const raw = await readFile(accountPath(), 'utf8');
    const parsed = JSON.parse(raw) as { oauthAccount?: Record<string, unknown> };
    const acc = parsed.oauthAccount;
    if (!acc || typeof acc !== 'object') return undefined;
    const account: AccountIdentity = {
      email: typeof acc.emailAddress === 'string' ? acc.emailAddress : undefined,
      displayName: typeof acc.displayName === 'string' ? acc.displayName : undefined,
      organizationName: typeof acc.organizationName === 'string' ? acc.organizationName : undefined,
    };
    cached = account;
    hasCached = true;
    return account;
  } catch {
    return undefined;
  }
}
