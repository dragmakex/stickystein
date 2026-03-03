export const sanitizeText = (value: string): string => value.replace(/[<>]/g, "")

export const sanitizeFilename = (value: string): string => sanitizeText(value).replace(/[^a-zA-Z0-9._ -]/g, "")
