export const makeId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`
