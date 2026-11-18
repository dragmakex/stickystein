import { withDb } from "@/db/client"

type VolumeStatus = {
  volume: string
  ready: number
  indexing: number
  errors: number
  lastIndexedAt: Date | null
}

const rows = await withDb((sql) => sql<VolumeStatus[]>`
  SELECT
    split_part(source_path, '/', 1) AS volume,
    count(DISTINCT source_path) FILTER (WHERE status = 'ready')::integer AS ready,
    count(*) FILTER (WHERE status = 'indexing')::integer AS indexing,
    count(*) FILTER (WHERE status = 'error')::integer AS errors,
    max(last_indexed_at) AS "lastIndexedAt"
  FROM documents
  WHERE source_path LIKE 'VOL00009/%' OR source_path LIKE 'VOL00010/%'
  GROUP BY 1
  ORDER BY 1
`)

const byVolume = new Map(rows.map((row) => [row.volume, row]))
for (const volume of ["VOL00009", "VOL00010"]) {
  const row = byVolume.get(volume)
  const lastIndexed = row?.lastIndexedAt ? new Date(row.lastIndexedAt).toISOString() : "never"
  console.log(
    `${volume}: ${row?.ready ?? 0} ready, ${row?.indexing ?? 0} indexing, ${row?.errors ?? 0} errors; last indexed: ${lastIndexed}`
  )
}
