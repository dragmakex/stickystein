import { ok, requestIdFromRequest } from "@/lib/http"

export async function GET(request: Request) {
  return ok({ ok: true, service: "e-files-rag" }, requestIdFromRequest(request))
}
