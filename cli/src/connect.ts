// `connect <server> <token> [--session <id>] [--name <name>]`
// The one-time enablement step, invoked by the /claudelens:connect skill. Writes
// the server URL + token to the config so tracking turns on. Because the token
// is typed into Claude Code (and thus lands in the current transcript), connect
// ALSO excludes the connecting session from syncing — so the token itself is
// never uploaded. Non-interactive: prints a short result for the skill to relay.
import { loadConfig, saveConfig, resolveName } from './config.js';

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
  // Positional order: <server> <token>
  if (!out.server && positionals[0]) out.server = positionals[0];
  if (!out.token && positionals[1]) out.token = positionals[1];
  return out;
}

export async function runConnect(): Promise<void> {
  const args = parse(process.argv.slice(3));
  if (!args.server) {
    console.error('Usage: connect <server-url> <token>');
    process.exit(1);
  }

  const cfg = await loadConfig();
  cfg.server = args.server.replace(/\/+$/, ''); // trim trailing slash
  if (args.token) cfg.token = args.token;
  if (args.name) cfg.name = args.name;

  // Never upload the session where the token was typed.
  if (args.session && !cfg.ignoreSessions.includes(args.session)) {
    cfg.ignoreSessions.push(args.session);
  }

  await saveConfig(cfg);

  console.log(`✔ Connected to ${cfg.server} as "${resolveName(cfg)}".`);
  console.log('Tracking is now on for every project. This session is excluded so the token is never uploaded.');
  console.log('Opt out anytime: /claudelens:untrack (this session), /claudelens:untrack-project, or /claudelens:pause.');
}
