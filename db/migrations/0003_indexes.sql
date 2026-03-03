CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc_page ON document_pages(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_page ON document_chunks(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_index_jobs_status_scheduled ON index_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_document_chunks_text_fts ON document_chunks USING GIN (to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
