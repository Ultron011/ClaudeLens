// `connect <server> <token> [--session <id>] [--name <name>]`
// The one-time enablement step, invoked by the /claudelens:connect skill. Writes
// the server URL + token to the config so tracking turns on. Because the token
// is typed into Claude Code (and thus lands in the current transcript), connect
// ALSO excludes the connecting session from syncing — so the token itself is
// never uploaded. Non-interactive: prints a short result for the skill to relay.
import { resolve } from 'node:path';
import { updateConfig, resolveName } from './config.js';
import { readAccount } from './account.js';
import { backfillProject, listProjects } from './history.js';

interface Args {
  server?: string;
  token?: string;
  session?: string;
  name?: string;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') out.session = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--token') out.token = argv[++i];
    else if (a === '--server') out.server = argv[++i];
    else if (!a.startsWith('-')) positionals.push(a);
  }
  // Positional order: <server> <token> <display name...>
  // The name is everything after the token, so a multi-word name works unquoted.
  if (!out.server && positionals[0]) out.server = positionals[0];
  if (!out.token && positionals[1]) out.token = positionals[1];
  if (!out.name && positionals.length > 2) out.name = positionals.slice(2).join(' ');
  return out;
}

export async function runConnect(): Promise<void> {
  const args = parse(process.argv.slice(3));
  if (!args.server) {
    console.error('Usage: connect <server-url> <token> <your display name>');
    process.exit(1);
  }

  const server = args.server.replace(/\/+$/, ''); // trim trailing slash
  const cfg = await updateConfig((c) => {
    c.server = server;
    if (args.token) c.token = args.token;
    if (args.name) c.name = args.name;
    // Never upload the session where the token was typed.
    if (args.session && !c.ignoreSessions.includes(args.session)) c.ignoreSessions.push(args.session);
  });

  const account = cfg.shareAccount === false ? undefined : await readAccount();
  console.log(`✔ Connected to ${cfg.server} as "${resolveName(cfg, account)}".`);
  console.log('Tracking is now on for every project. This session is excluded so the token is never uploaded.');
  console.log('Opt out anytime: /claudelens:untrack (this session), /claudelens:untrack-project, or /claudelens:pause.');

  // Only the current project, not the whole machine's history — uploading
  // everything on one command would be a consent surprise and a volume spike.
  const cwd = process.cwd();
  const { synced, upgraded, failed } = await backfillProject(cwd);
  if (synced || failed) {
    console.log(`Backed up ${synced} past session(s) here (${upgraded} upgraded, ${failed} failed).`);
  }

  const others = (await listProjects()).filter((p) => p.cwd && resolve(p.cwd) !== resolve(cwd) && p.sessions > 0);
  if (others.length) {
    console.log(
      `Found ${others.length} other project(s) with history — run /claudelens:sync-history to back those up.`,
    );
  }
}
