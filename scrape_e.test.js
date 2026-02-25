const { expect, test } = require('bun:test')
const fs = require('fs')
const path = require('path')

const {
  buildDownloadEntries,
  buildPageUrl,
  extractMaxPageFromHtml,
  extractPdfLinksFromHtml,
  fetchWithTimeout,
  filenameFromUrl,
  looksLikeGateHtml,
  normalizeUrl,
} = require('./scrape_e.js')

function createAbortableFetch(delayMs, responseFactory) {
  return (_url, options = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          resolve(responseFactory())
        } catch (err) {
          reject(err)
        }
      }, delayMs)

      const onAbort = () => {
        clearTimeout(timer)
        const abortError = new Error('Aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      }

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort()
          return
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
    })
}

test('normalizeUrl resolves relative links and rejects javascript links', () => {
  expect(normalizeUrl('/epstein/files/DataSet%209/EFTA00000001.pdf', 'https://www.justice.gov/abc')).toBe(
    'https://www.justice.gov/epstein/files/DataSet%209/EFTA00000001.pdf'
  )
  expect(normalizeUrl('javascript:void(0)', 'https://www.justice.gov')).toBeNull()
})

test('filenameFromUrl decodes URL-encoded names', () => {
  expect(filenameFromUrl('https://www.justice.gov/epstein/files/DataSet%209/EFTA00012345.pdf')).toBe(
    'EFTA00012345.pdf'
  )
})

test('buildPageUrl appends page query param', () => {
  expect(buildPageUrl('https://www.justice.gov/epstein/doj-disclosures/data-set-9-files', 12)).toBe(
    'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files?page=12'
  )
})

test('extractPdfLinksFromHtml parses DOJ-style anchor hrefs', () => {
  const html = `
    <li><a href="https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf">EFTA00039025.pdf</a></li>
    <li><a href="/epstein/files/DataSet%209/EFTA00039153.pdf?download=1">EFTA00039153.pdf</a></li>
    <li><a href="/epstein/files/DataSet%209/not-a-match.pdf">not-a-match.pdf</a></li>
  `

  const links = extractPdfLinksFromHtml(html, 'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files?page=0')
  expect(links).toEqual([
    'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf',
    'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039153.pdf?download=1',
  ])
})

test('buildDownloadEntries groups duplicate filename candidates', () => {
  const pageFolder = path.join('/tmp', 'DataSet 9', 'page-00000')
  const entries = buildDownloadEntries(
    [
      'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf?download=1',
      'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf',
      'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039153.pdf',
    ],
    pageFolder
  )

  expect(entries.length).toBe(2)
  expect(entries[0].filename).toBe('EFTA00039025.pdf')
  expect(entries[0].candidates).toEqual([
    'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf',
    'https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf?download=1',
  ])
})

test('extractMaxPageFromHtml finds the highest page index from pager hrefs', () => {
  const html = `
    <a href="/epstein/doj-disclosures/data-set-9-files?page=1" aria-label="Next page">Next</a>
    <a href="/epstein/doj-disclosures/data-set-9-files?page=9423" aria-label="Last page">Last</a>
  `

  const max = extractMaxPageFromHtml(html, 'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files?page=0')
  expect(max).toBe(9423)
})

test('attached dataset 9 page 0 snapshot contains links and a discoverable max page', async () => {
  const htmlPath = path.join(
    process.cwd(),
    'Department of Justice _ Data Set 9 Files _ United States Department of Justice.html'
  )
  const html = await fs.promises.readFile(htmlPath, 'utf8')

  const links = extractPdfLinksFromHtml(
    html,
    'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files?page=0'
  )
  const maxPage = extractMaxPageFromHtml(
    html,
    'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files?page=0'
  )

  expect(links.length).toBeGreaterThan(0)
  expect(links).toContain('https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf')
  expect(maxPage).toBe(9423)
})

test('looksLikeGateHtml detects robot/security gate signatures', () => {
  expect(looksLikeGateHtml('<div id="age-verify-block">Are you 18 years of age or older?</div>')).toBe(false)
  expect(looksLikeGateHtml('<button>I am not a robot</button>')).toBe(true)
  expect(looksLikeGateHtml('<html><body><p>normal page</p></body></html>')).toBe(false)
})

test('looksLikeGateHtml ignores pages that already contain EFTA PDF hrefs', () => {
  const html = `
    <div id="age-verify-block">Are you 18 years of age or older?</div>
    <a href="https://www.justice.gov/epstein/files/DataSet%209/EFTA00039025.pdf">EFTA00039025.pdf</a>
  `
  expect(looksLikeGateHtml(html)).toBe(false)
})

test('fetchWithTimeout returns response when fetch resolves within timeout', async () => {
  const fetchImpl = createAbortableFetch(
    5,
    () =>
      new Response('%PDF-1.7\nok', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
  )

  const response = await fetchWithTimeout('https://example.test/ok', {}, 1000, fetchImpl)
  expect(response.status).toBe(200)
  expect((await response.text()).startsWith('%PDF')).toBe(true)
})

test('fetchWithTimeout throws ETIMEDOUT when fetch exceeds timeout', async () => {
  const fetchImpl = createAbortableFetch(100, () => new Response('slow'))
  await expect(fetchWithTimeout('https://example.test/slow', {}, 20, fetchImpl)).rejects.toMatchObject({
    code: 'ETIMEDOUT',
  })
})
