import { ok, requestIdFromRequest } from "@/lib/http"
import { hasBypassAccess } from "@/lib/security/bypass"

export const GET = async (request: Request) => ok({ bypass: await hasBypassAccess() }, requestIdFromRequest(request))
