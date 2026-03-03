import { withDb } from "@/db/client"

await withDb(async (sql) => {
  await sql`select 1`
})

console.log("Seed complete")
