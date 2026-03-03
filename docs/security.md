# Security

- Effect Schema validation for request boundaries
- Strict startup env/config validation (enum checks, numeric bounds, and relational constraints)
- Signed session cookies (`httpOnly`, `sameSite=lax`, `secure` in production)
- Session ownership checks for thread/message APIs
- DB-backed rate limiting
- Prompt injection defense in fixed system prompt
- Snippet/filename sanitization for UI rendering
