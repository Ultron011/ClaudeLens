#!/usr/bin/env -S npx tsx
// ClaudeLens publisher — opt-in sharing of a local Claude Code session.
// Nothing is uploaded until the developer picks a session, reviews the
// redaction report, and confirms.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { IngestPayload, ParsedSession } from '@claudelens/shared';
import { loadConfig } from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const SERVER = process.env.CLAUDELENS_SERVER ?? 'http://localhost:4000';
const TOKEN = process.env.CLAUDELENS_TOKEN ?? '';

interface Candidate {
  file: string;
  mtime: number;
  session: ParsedSession;
}

async function collectSessions(): Promise<Candidate[]> {
  let projectDirs: string[];
  try {
    projectDirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: Candidate[] = [];
  for (const dir of projectDirs) {
    const full = join(PROJECTS_DIR, dir);
    let files: string[];
    try {
      files = await readdir(full);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(full, f);
      try {
        const st = await stat(path);
        const raw = await readFile(path, 'utf8');
        const session = parseTranscript(raw);
        // skip trivial/empty sessions
        if (session.stats.turns < 2) continue;
        out.push({ file: path, mtime: st.mtimeMs, session });
      } catch {
        // ignore unreadable files
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function fmtCost(n: number) {
  return n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

async function main() {
  console.clear();
  p.intro(pc.bgCyan(pc.black(' ClaudeLens ')) + pc.dim(' share a session so your team can learn'));

  const candidates = await collectSessions();
  if (!candidates.length) {
    p.cancel(`No Claude Code sessions found in ${PROJECTS_DIR}`);
    process.exit(1);
  }

  const picked = await p.select({
    message: `Pick a session to share  ${pc.dim('(server: ' + SERVER + ')')}`,
    options: candidates.slice(0, 40).map((c, i) => {
      const s = c.session;
      const when = new Date(c.mtime).toLocaleString();
      return {
        value: i,
        label: `${s.title}`,
        hint: `${s.project ?? '—'} · ${s.stats.turns} turns · ${fmtCost(
          s.stats.estimatedCostUsd,
        )} · ${when}`,
      };
    }),
  });
  if (p.isCancel(picked)) return p.cancel('Cancelled.');

  const chosen = candidates[picked as number];
  const s = chosen.session;

  // Redact before anything leaves the machine.
  const { value: redactedTurns, hits } = redactDeep(s.turns);
  s.turns = redactedTurns;
  const redactedFirst = redactDeep(s.stats.firstUserPrompt ?? '');
  s.stats.firstUserPrompt = redactedFirst.value;
  for (const [k, v] of Object.entries(redactedFirst.hits)) hits[k] = (hits[k] ?? 0) + v;

  const hitEntries = Object.entries(hits);
  p.note(
    [
      `${pc.bold('Title')}    ${s.title}`,
      `${pc.bold('Project')}  ${s.project ?? '—'}  (branch: ${s.gitBranch ?? '—'})`,
      `${pc.bold('Turns')}    ${s.stats.turns}  ·  models: ${s.stats.models.join(', ') || '—'}`,
      `${pc.bold('Tokens')}   ${s.stats.totalTokens.toLocaleString()}  (~${fmtCost(
        s.stats.estimatedCostUsd,
      )})`,
      `${pc.bold('Skills')}   ${s.stats.skills.join(', ') || '—'}`,
      `${pc.bold('Agents')}   ${s.stats.subagents.join(', ') || '—'}`,
      hitEntries.length
        ? pc.yellow(
            `Redacted secrets: ${hitEntries.map(([k, v]) => `${k}×${v}`).join(', ')}`,
          )
        : pc.green('No secrets detected by the redactor.'),
    ].join('\n'),
    'Preview',
  );

  const cfg = await loadConfig();
  const author = await p.text({
    message: 'Your name (shown as the author)',
    initialValue: cfg?.name ?? userInfo().username,
    validate: (v) => (v.trim() ? undefined : 'required'),
  });
  if (p.isCancel(author)) return p.cancel('Cancelled.');

  const note = await p.text({
    message: 'Why is this worth sharing? (one line — helps others learn)',
    placeholder: 'e.g. clean use of the Explore agent to map an unfamiliar codebase',
  });
  if (p.isCancel(note)) return p.cancel('Cancelled.');

  const tagsRaw = await p.text({
    message: 'Tags (comma-separated, optional)',
    placeholder: 'refactor, debugging, rag',
  });
  if (p.isCancel(tagsRaw)) return p.cancel('Cancelled.');

  const confirm = await p.confirm({
    message: `Upload this session to ${SERVER}?`,
  });
  if (p.isCancel(confirm) || !confirm) return p.cancel('Not uploaded.');

  const payload: IngestPayload = {
    session: s,
    author: (author as string).trim(),
    note: (note as string)?.trim() || undefined,
    tags: (tagsRaw as string)
      ? (tagsRaw as string)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };

  const spin = p.spinner();
  spin.start('Uploading…');
  try {
    const resp = await fetch(`${SERVER}/api/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`server responded ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { id: string };
    spin.stop('Uploaded.');
    p.outro(pc.green(`✔ Shared! ${SERVER.replace(/:\d+$/, ':5173')}/session/${data.id}`));
  } catch (err) {
    spin.stop('Upload failed.');
    p.cancel(String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
