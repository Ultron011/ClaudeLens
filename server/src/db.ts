import pg from 'pg';
import 'dotenv/config';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://claudelens:claudelens@localhost:5544/claudelens';

export const pool = new pg.Pool({ connectionString });

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     text NOT NULL,
  title          text NOT NULL,
  author         text NOT NULL,
  author_email   text,
  project        text,
  git_branch     text,
  note           text,
  tags           text[] NOT NULL DEFAULT '{}',
  featured       boolean NOT NULL DEFAULT false,
  hidden         boolean NOT NULL DEFAULT false,
  stats          jsonb NOT NULL,
  transcript     jsonb NOT NULL,
  started_at     timestamptz,
  ended_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author)
);

CREATE INDEX IF NOT EXISTS sessions_created_idx  ON sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_featured_idx ON sessions (featured);
CREATE INDEX IF NOT EXISTS sessions_author_idx   ON sessions (author);
CREATE INDEX IF NOT EXISTS sessions_project_idx  ON sessions (author, project);
CREATE INDEX IF NOT EXISTS sessions_tags_idx     ON sessions USING gin (tags);
`;

// v2: identity, auto-mode, parser version, and delete stickiness. SCHEMA above is frozen —
// every new column lives here, added with ADD COLUMN IF NOT EXISTS so this is safe to re-run.
export const MIGRATIONS = `
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cwd                  text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_email        text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_display_name text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_name             text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS used_auto_mode   boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS permission_modes text[]  NOT NULL DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS parser_version   int     NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sessions_account_email_idx  ON sessions (account_email);
CREATE INDEX IF NOT EXISTS sessions_started_idx        ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_author_started_idx ON sessions (author, started_at DESC);

-- A delete must STICK: without this the next Stop hook re-uploads what was just deleted.
CREATE TABLE IF NOT EXISTS deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('session','project')),
  author text NOT NULL,
  session_id text,
  project text,
  no_project boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (scope, author, session_id, project, no_project)
);
`;
