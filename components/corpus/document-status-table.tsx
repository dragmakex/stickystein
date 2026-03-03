"use client"

type Row = {
  documentId: string
  filename: string
  status: string
  pageCount: number | null
  lastIndexedAt: string | null
  latestJob: {
    jobId: string
    status: string
    progress: number
  } | null
}

export function DocumentStatusTable({ documents }: { documents: ReadonlyArray<Row> }) {
  return (
    <div className="table-scroll">
      <table className="status-table" aria-label="Corpus document indexing status">
        <thead>
          <tr>
            <th align="left" style={{ padding: "6px 8px" }} scope="col">File</th>
            <th align="left" style={{ padding: "6px 8px" }} scope="col">Status</th>
            <th align="left" style={{ padding: "6px 8px" }} scope="col">Pages</th>
            <th align="left" style={{ padding: "6px 8px" }} scope="col">Job</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.documentId}>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #9ca3af" }}>{doc.filename}</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #9ca3af" }}>{doc.status}</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #9ca3af" }}>{doc.pageCount ?? "-"}</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #9ca3af" }}>
                {doc.latestJob ? `${doc.latestJob.status} (${doc.latestJob.progress}%)` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
