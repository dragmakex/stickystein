import { compactWhitespace } from "@/lib/utils/text"

export const normalizePageText = (value: string): string => compactWhitespace(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
