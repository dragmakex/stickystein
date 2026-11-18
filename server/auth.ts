import { withDb } from "@/db/client"
import { BYPASS_USER_ID } from "@/lib/security/bypass"

const ensurePublicUser = async () => {
  await withDb(async (sql) => {
    await sql`
      INSERT INTO users (id, name, email, "emailVerified", query_credits)
      VALUES (${BYPASS_USER_ID}, 'Public Access', 'public@stickystein.local', true, 0)
      ON CONFLICT (id) DO NOTHING
    `
  })

  return {
    id: BYPASS_USER_ID,
    name: "Public Access",
    email: "public@stickystein.local",
    emailVerified: true,
    image: null
  }
}

/**
 * The app is intentionally open: every request acts as the public user.
 * There is no sign-in, magic-link, or OAuth flow.
 */
export const requireCurrentUser = async () => ensurePublicUser()
