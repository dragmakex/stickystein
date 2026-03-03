import { readdir, stat } from "node:fs/promises"
import path from "node:path"

export type DiscoveredPdf = {
  readonly path: string
  readonly filename: string
  readonly size: number
  readonly mtimeMs: number
}

const walk = async (rootDir: string, currentDir: string, out: DiscoveredPdf[]): Promise<void> => {
  const names = await readdir(currentDir)

  for (const name of names) {
    const fullPath = path.join(currentDir, name)
    const fileStat = await stat(fullPath)

    if (fileStat.isDirectory()) {
      await walk(rootDir, fullPath, out)
      continue
    }

    if (!name.toLowerCase().endsWith(".pdf")) continue

    const relativePath = path.relative(rootDir, fullPath)
    out.push({ path: fullPath, filename: relativePath, size: fileStat.size, mtimeMs: fileStat.mtimeMs })
  }
}

export const discoverLocalPdfs = async (dataDir = "data"): Promise<ReadonlyArray<DiscoveredPdf>> => {
  const docs: DiscoveredPdf[] = []
  await walk(dataDir, dataDir, docs)
  return docs.sort((left, right) => left.filename.localeCompare(right.filename))
}
