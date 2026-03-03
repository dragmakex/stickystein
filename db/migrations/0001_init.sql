CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  source_path text NOT NULL,
  filename text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'indexing', 'ready', 'error')),
  page_count integer,
  last_indexed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_path, content_hash)
);

CREATE TABLE IF NOT EXISTS document_pages (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text text NOT NULL,
  char_count integer NOT NULL,
  parse_warnings jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, page_number)
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer,
  chunk_index integer NOT NULL,
  text text NOT NULL,
  snippet text NOT NULL,
  token_estimate integer NOT NULL,
  embedding double precision[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS index_jobs (
  id text PRIMARY KEY,
  job_type text NOT NULL CHECK (job_type IN ('index_document', 'index_corpus')),
  document_id text REFERENCES documents(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'succeeded', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  heartbeat_at timestamptz,
  error_code text,
  error_message text,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id text PRIMARY KEY,
  session_key text NOT NULL UNIQUE,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  citations jsonb,
  retrieval_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  subject_key text NOT NULL,
  route_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(subject_key, route_key, window_start)
);
