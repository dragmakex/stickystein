CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE vector(128)
  USING embedding::vector;
