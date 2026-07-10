#!/usr/bin/env -S npx tsx
// ClaudeLens Stop-hook sync. Invoked by Claude Code after each assistant turn.
// Reads the hook payload from stdin, and if the session's project is opted in,
// pushes the current transcript to the server. The server upserts on
// (session_id, contributor_id), so re-running every turn (and across resumes)
// just refreshes one row. Best-effort: this NEVER blocks or fails the session.
import { readFile } from 'node:fs/promises';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { IngestPayload } from '@claudelens/shared';
import { loadConfig, shouldTrack } from './config.js';

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function run() {
  const cfg = await loadConfig();
  if (!cfg) return; // not set up — run /claudelens:setup first

  const raw = await readStdin();
  let hook: HookInput = {};
  try {
    hook = JSON.parse(raw) as HookInput;
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;

  if (!(await shouldTrack(cwd, session_id ?? '', cfg))) return; // explicitly opted out

  const jsonl = await readFile(transcript_path, 'utf8');
  const session = parseTranscript(jsonl);
  if (!session.sessionId || session.stats.turns < 1) return;

  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }

  const payload: IngestPayload = {
    session,
    author: cfg.name,
  };

  await fetch(`${cfg.server}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

// Swallow everything: a hook must not disrupt the session.
run().catch((err) => {
  if (process.env.CLAUDELENS_DEBUG) console.error('[claudelens sync]', err);
});
