import { readdir, stat } from "node:fs/promises"
import path from "node:path"

export type DiscoveredPdf = {
  readonly path: string
  readonly filename: string
  readonly size: number
  readonly mtimeMs: number
}

const datasetNameToVolume = (name: string): string | null => {
  const match = /^DataSet\s+(\d+)$/i.exec(name)
  if (!match) return null
  return `VOL${match[1].padStart(5, "0")}`
}

export const normalizeDiscoveredPdfFilename = (relativePath: string): string => {
  const parts = relativePath.replaceAll("\\", "/").split("/")
  const volumeIndex = parts.findIndex((part) => /^VOL\d+$/i.test(part))
  if (volumeIndex >= 0) return parts.slice(volumeIndex).join("/")

  const datasetIndex = parts.findIndex((part) => datasetNameToVolume(part) !== null)
  if (datasetIndex < 0) return parts.join("/")

  const volumeName = datasetNameToVolume(parts[datasetIndex])
  const rest = parts.slice(datasetIndex + 1).filter((part) => !/^DataSet\s+\d+$/i.test(part))
  return [volumeName, ...rest].join("/")
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
    out.push({
      path: fullPath,
      filename: normalizeDiscoveredPdfFilename(relativePath),
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs
    })
  }
}

export const discoverLocalPdfs = async (dataDir = "data"): Promise<ReadonlyArray<DiscoveredPdf>> => {
  const docs: DiscoveredPdf[] = []
  await walk(dataDir, dataDir, docs)
  return docs.sort((left, right) => left.filename.localeCompare(right.filename))
}
