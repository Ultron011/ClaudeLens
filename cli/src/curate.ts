// Curation from inside Claude Code — the /claudelens:note, :feature, :tag and :link skills.
// Each op is one `POST /api/sessions/curate` for the CURRENT session (same bearer token as ingest;
// the server resolves author aliases). A body with no change fields is a lookup, which is all
// `link` sends. If the server doesn't have the session yet (404 — e.g. curating before Claude's
// first reply has synced), sync it now through the normal upload path and retry once.
//
// Opt-outs are honored first: an untracked session/project (or a DO_NOT_TRACK env) sends nothing
// at all. A PAUSED machine still curates a session already on the dashboard (it's metadata the user
// is typing on purpose) but never uploads a transcript to satisfy a 404.
//
// Ops:  note --session <id> (<text...> | --stdin | --clear)
//       feature --session <id> [--off]
//       tag --session <id> (<tag...> | --clear)      no tags = show the current ones
//       link --session <id>
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { redactText } from '@claudelens/shared';
import {
  type ClaudeLensConfig,
  loadConfig,
  isConnected,
  isExcludedLocally,
  isRepoExcluded,
  envOptedOut,
  shouldSync,
  resolveName,
  describeError,
  projectsDir,
} from './config.js';
import { readAccount } from './account.js';
import { resolveSessionId } from './optout.js';
import { parseSessionFile } from './upload.js';
import { uploadAndRecord } from './sync.js';

export type CurateOp = 'note' | 'feature' | 'tag' | 'link';

const TIMEOUT_MS = 15_000;
const FLAGS = new Set(['--stdin', '--clear', '--off']);

interface Args {
  session?: string;
  flags: Set<string>;
  rest: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { flags: new Set(), rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') out.session = argv[++i];
    else if (FLAGS.has(a)) out.flags.add(a);
    else out.rest.push(a);
  }
  return out;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

interface CurateBody {
  sessionId: string;
  author: string;
  note?: string | null;
  tags?: string[];
  featured?: boolean;
}

interface CurateReply {
  id?: string;
  url?: string;
  note?: string | null;
  tags?: string[];
  featured?: boolean;
  error?: string;
}

async function postCurate(cfg: ClaudeLensConfig, body: CurateBody): Promise<{ status: number; reply?: CurateReply }> {
  const res = await fetch(`${cfg.server}/api/sessions/curate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, reply: (await res.json().catch(() => undefined)) as CurateReply | undefined };
}

/** Why this session must not be sent anywhere, or undefined if it's tracked. Mirrors shouldSync's
 *  switches minus `paused` (see header) so the message can say which one. */
async function exclusionReason(cwd: string, id: string, cfg: ClaudeLensConfig): Promise<string | undefined> {
  if (cfg.ignoreSessions.includes(id)) return 'you ran /claudelens:untrack — /claudelens:track includes it again';
  if (isExcludedLocally(cwd, cfg)) return 'this project is excluded — /claudelens:track-project includes it again';
  if (await isRepoExcluded(cwd)) return 'this repo is excluded team-wide by a committed .claudelens file';
  if (envOptedOut()) return 'DO_NOT_TRACK / CLAUDELENS_DISABLE is set';
  return undefined;
}

/** Claude Code names each transcript after its session: `<projects dir>/<encoded cwd>/<id>.jsonl`. */
async function findTranscript(id: string): Promise<string | undefined> {
  const root = projectsDir();
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    const path = join(root, d, `${id}.jsonl`);
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {
      /* not in this project */
    }
  }
  return undefined;
}

/** Sync the current session now (the Stop hook may not have run yet). Returns a user-facing reason
 *  when it couldn't, undefined on success. */
async function syncCurrent(id: string, cwd: string, cfg: ClaudeLensConfig): Promise<string | undefined> {
  const path = await findTranscript(id);
  if (!path) return `couldn't find this session's transcript under ${projectsDir()}`;
  const { mtimeMs } = await stat(path);
  const session = await parseSessionFile(path);
  if (!session.sessionId || session.stats.turns < 1) return 'the transcript has nothing to sync yet';
  if (!(await shouldSync(session.cwd ?? cwd, session.sessionId, cfg))) return 'this session is excluded from syncing';
  try {
    if (!(await uploadAndRecord(session, cfg, mtimeMs))) return 'it was deleted on the dashboard, so it is untracked now';
  } catch (err) {
    return `upload failed (${describeError(err)})`;
  }
  return undefined;
}

/** Split tag args on spaces/commas, drop a leading '#', dedupe (order kept). */
function parseTags(rest: string[]): string[] {
  const tags = rest
    .flatMap((a) => a.split(/[\s,]+/))
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
  return [...new Set(tags)];
}

export async function runCurate(op: CurateOp): Promise<void> {
  const cfg = await loadConfig();
  if (!isConnected(cfg)) {
    console.log('ClaudeLens is not connected. Run /claudelens:connect <server-url> <token> <your name> first.');
    return;
  }
  const args = parseArgs(process.argv.slice(3));
  const cwd = process.cwd();
  const id = await resolveSessionId(args.session, cwd);
  if (!id) {
    console.log('Could not identify this session yet (no transcript). Try again after your first message.');
    return;
  }
  const excluded = await exclusionReason(cwd, id, cfg);
  if (excluded) {
    console.log(`This session isn't tracked by ClaudeLens (${excluded}). Nothing was sent.`);
    return;
  }

  const account = cfg.shareAccount === false ? undefined : await readAccount();
  const body: CurateBody = { sessionId: id, author: resolveName(cfg, account) };
  if (op === 'note') {
    const text = (args.flags.has('--stdin') ? await readStdin() : args.rest.join(' ')).trim();
    if (args.flags.has('--clear') || text === '--clear') body.note = null;
    else if (!text) {
      console.log('Usage: /claudelens:note <why this session is worth reading>   (or --clear to remove it)');
      return;
    } else body.note = cfg.redact ? redactText(text).text : text;
  } else if (op === 'feature') {
    body.featured = !args.flags.has('--off');
  } else if (op === 'tag') {
    if (args.flags.has('--clear')) body.tags = [];
    else {
      const tags = parseTags(args.rest);
      if (tags.length) body.tags = tags; // none given → lookup, prints the current tags
    }
  }

  let res: Awaited<ReturnType<typeof postCurate>>;
  try {
    res = await postCurate(cfg, body);
    if (res.status === 404) {
      if (cfg.paused) {
        console.log("This session isn't on the dashboard yet, and syncing is paused (/claudelens:resume). Nothing was sent.");
        return;
      }
      const why = await syncCurrent(id, cwd, cfg);
      if (why) {
        console.log(`This session isn't on the dashboard yet, and syncing it failed: ${why}.`);
        return;
      }
      res = await postCurate(cfg, body);
    }
  } catch (err) {
    console.log(`✖ Couldn't reach ${cfg.server}: ${describeError(err)}`);
    return;
  }

  const { status, reply } = res;
  if (status === 404) {
    console.log("This session still isn't on the dashboard — try again after Claude's next reply.");
    return;
  }
  if (status === 401 || status === 403) {
    console.log(`✖ The server rejected the token (HTTP ${status}). Re-run /claudelens:connect with the current token.`);
    return;
  }
  if (status < 200 || status >= 300 || !reply) {
    console.log(`✖ Server error (HTTP ${status})${reply?.error ? `: ${reply.error}` : ''}`);
    return;
  }

  const url = `${cfg.server}${reply.url ?? `/session/${reply.id}`}`;
  const tags = reply.tags ?? [];
  switch (op) {
    case 'note':
      console.log(body.note === null ? `✔ Note cleared — ${url}` : `✔ Note saved — ${url}`);
      break;
    case 'feature':
      console.log(reply.featured ? `★ Featured on the dashboard — ${url}` : `✔ No longer featured — ${url}`);
      break;
    case 'tag':
      if (body.tags) console.log(tags.length ? `✔ Tags: ${tags.join(', ')} — ${url}` : `✔ Tags cleared — ${url}`);
      else console.log(`${tags.length ? `Tags: ${tags.join(', ')}` : 'No tags yet'} — ${url}  (set with /claudelens:tag <tag> …)`);
      break;
    case 'link':
      console.log(url);
      break;
  }
}
