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
