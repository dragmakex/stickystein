import { headers } from "next/headers"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { magicLink } from "better-auth/plugins"
import { Pool } from "pg"
import { Resend } from "resend"

import { withDb } from "@/db/client"
import { env } from "@/lib/env"
import { UnauthorizedError, ValidationError } from "@/lib/errors"
import { BYPASS_USER_ID, hasBypassAccess } from "@/lib/security/bypass"

let authPool: Pool | null = null
let resendClient: Resend | null = null

const databasePool = () => {
  if (!authPool) {
    authPool = new Pool({ connectionString: env.databaseUrl })
  }
  return authPool
}

const resend = () => {
  if (!env.auth.resendApiKey) {
    throw new ValidationError("Resend is not configured")
  }
  if (!resendClient) {
    resendClient = new Resend(env.auth.resendApiKey)
  }
  return resendClient
}

const socialProviders =
  env.auth.twitterClientId && env.auth.twitterClientSecret
    ? {
        twitter: {
          clientId: env.auth.twitterClientId,
          clientSecret: env.auth.twitterClientSecret
        }
      }
    : {}

export const auth = betterAuth({
  secret: env.auth.secret,
  baseURL: env.appBaseUrl,
  database: databasePool(),
  emailAndPassword: {
    enabled: false
  },
  socialProviders,
  user: {
    modelName: "users",
    additionalFields: {
      queryCredits: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
        fieldName: "query_credits"
      },
      stripeCustomerId: {
        type: "string",
        required: false,
        input: false,
        fieldName: "stripe_customer_id"
      }
    }
  },
  session: {
    modelName: "user_sessions"
  },
  account: {
    modelName: "accounts"
  },
  verification: {
    modelName: "verifications"
  },
  plugins: [
    nextCookies(),
    magicLink({
      async sendMagicLink({ email, url }) {
        if (!env.auth.emailFrom) {
          throw new ValidationError("AUTH_EMAIL_FROM is not configured")
        }

        await resend().emails.send({
          from: env.auth.emailFrom,
          to: email,
          subject: "Your Stickystein sign-in link",
          html: `<p>Use this link to sign in to Stickystein:</p><p><a href="${url}">${url}</a></p>`
        })
      }
    })
  ]
})

export const getAuthSession = async () => auth.api.getSession({ headers: await headers() })

const ensureBypassUser = async () => {
  await withDb(async (sql) => {
    await sql`
      INSERT INTO users (id, name, email, "emailVerified", query_credits)
      VALUES (${BYPASS_USER_ID}, 'Secret Access', 'bypass@stickystein.local', true, 0)
      ON CONFLICT (id) DO NOTHING
    `
  })

  return {
    id: BYPASS_USER_ID,
    name: "Secret Access",
    email: "bypass@stickystein.local",
    emailVerified: true,
    image: null
  }
}

export const requireCurrentUser = async () => {
  const session = await getAuthSession()
  if (session?.user) return session.user
  if (await hasBypassAccess()) return ensureBypassUser()
  throw new UnauthorizedError("Sign in required")
}
