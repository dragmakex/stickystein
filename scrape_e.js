#!/usr/bin/env bun
// Fast DOJ scraper for Data Sets 9 and 10.
// Usage: bun scrape_e.js [output_dir]

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

if (!process.versions || !process.versions.bun) {
  throw new Error('This scraper is Bun-only. Run with: bun scrape_e.js [output_dir]')
}

const BASE_ORIGIN = 'https://www.justice.gov'
const DATASETS = [
  {
    url: 'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files',
    folder: 'DataSet 9',
  },
  {
    url: 'https://www.justice.gov/epstein/doj-disclosures/data-set-10-files',
    folder: 'DataSet 10',
  },
]

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CPU = Math.max(
  1,
  typeof os.availableParallelism === 'function' ? os.availableParallelism() : (os.cpus() || []).length || 1
)

const HEADLESS = process.env.HEADLESS === 'true'
const PAGE_WORKERS = intEnv('PAGE_WORKERS', Math.max(4, Math.min(24, CPU * 2)), 1)
const DOWNLOAD_WORKERS = intEnv('DOWNLOAD_WORKERS', Math.max(12, Math.min(128, CPU * 8)), 1)
const REQUEST_TIMEOUT_MS = intEnv('REQUEST_TIMEOUT_MS', 45000, 1000)
const FETCH_RETRIES = intEnv('FETCH_RETRIES', 3, 1)
const DOWNLOAD_RETRIES = intEnv('DOWNLOAD_RETRIES', 3, 1)
const RETRY_BASE_DELAY_MS = intEnv('RETRY_BASE_DELAY_MS', 400, 50)
const GATE_ATTEMPTS = intEnv('GATE_ATTEMPTS', 6, 1)
const PAGE_FOLDER_PAD = intEnv('PAGE_FOLDER_PAD', 5, 1)
const SKIP_DONE = process.env.SKIP_DONE !== 'false'
const ONLY_FAILED_PAGES = process.env.ONLY_FAILED_PAGES === 'true'
const ONLY_PAGES_SPEC = process.env.ONLY_PAGES || ''
const LOG_DIR_NAME = process.env.LOG_DIR_NAME || '.scrape-logs'
const RUN_LOG_FILE_NAME = process.env.LOG_FILE_NAME || 'scrape.log'
const ERROR_LOG_FILE_NAME = process.env.ERROR_LOG_FILE_NAME || 'errors.log'
const FAILED_PAGES_LOG_FILE_NAME = process.env.FAILED_PAGES_LOG_FILE_NAME || 'failed-pages.jsonl'

const PAGE_DONE_MARKER = '.scrape-complete.json'
const PDF_NAME_RE = /^EFTA\d+\.pdf$/i
const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524])

const AGE_SELECTORS = [
  '#age-button-yes',
  '.age-gate-buttons button#age-button-yes',
  '.age-gate-buttons button:has-text("Yes")',
  '.age-gate-buttons button',
  '.age-gate-buttons input[type="submit"]',
  'button:has-text("I am 18")',
  'button:has-text("I am over 18")',
]

const ROBOT_SELECTORS = [
  'input[type="submit"][value*="robot" i]',
  'input[type="button"][value*="robot" i]',
  'input[type="submit"][value*="human" i]',
  'input[type="button"][value*="human" i]',
  'input[value*="i am not a robot" i]',
  'button[value*="i am not a robot" i]',
  'input.usa-button[value*="robot" i]',
  'button.usa-button:has-text("robot")',
  'button:has-text("I am not a robot")',
  'button:has-text("I am human")',
  'button:has-text("Verify")',
  'button:has-text("Continue")',
  'input[onclick*="reauth" i]',
  'button[onclick*="reauth" i]',
]

const GATE_SELECTORS = Array.from(new Set([...AGE_SELECTORS, ...ROBOT_SELECTORS]))
const BOT_CHALLENGE_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.g-recaptcha',
  '.h-captcha',
]

function intEnv(name, fallback, min = 0) {
  const raw = process.env[name]
  const parsed = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return parsed
}

const logging = {
  initialized: false,
  logDir: null,
  runLogPath: null,
  errorLogPath: null,
  failedPagesPath: null,
}

function appendLogLine(filePath, line) {
  if (!filePath) return
  try {
    fs.appendFileSync(filePath, `${line}\n`, 'utf8')
  } catch {
    // Ignore log write failures to avoid interrupting scrape progress.
  }
}

function serializeDetails(details) {
  if (details === null || details === undefined) return ''
  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

function log(message, details = null, level = 'INFO') {
  const time = new Date().toISOString()
  const line = `[${time}] [${level}] ${message}${details ? ` ${serializeDetails(details)}` : ''}`

  if (level === 'ERROR') {
    if (details) {
      console.error(`[${time}] ${message}`, details)
    } else {
      console.error(`[${time}] ${message}`)
    }
  } else if (details) {
    console.log(`[${time}] ${message}`, details)
  } else {
    console.log(`[${time}] ${message}`)
  }

  if (!logging.initialized) return
  appendLogLine(logging.runLogPath, line)
  if (level === 'ERROR') {
    appendLogLine(logging.errorLogPath, line)
  }
}

function logError(message, details = null) {
  log(message, details, 'ERROR')
}

async function initLogging(baseDir) {
  const logDir = path.join(baseDir, LOG_DIR_NAME)
  await fs.promises.mkdir(logDir, { recursive: true })
  logging.logDir = logDir
  logging.runLogPath = path.join(logDir, RUN_LOG_FILE_NAME)
  logging.errorLogPath = path.join(logDir, ERROR_LOG_FILE_NAME)
  logging.failedPagesPath = path.join(logDir, FAILED_PAGES_LOG_FILE_NAME)
  logging.initialized = true
  appendLogLine(logging.runLogPath, '')
  appendLogLine(logging.runLogPath, `========== run started ${new Date().toISOString()} ==========` )
}

function safeFolderLabel(folder) {
  return String(folder || 'dataset')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function failedPagesSnapshotPath(folder) {
  if (!logging.logDir) return null
  const filename = `${safeFolderLabel(folder)}-failed-pages.txt`
  return path.join(logging.logDir, filename)
}

function parsePageSelection(spec, maxPage) {
  if (!spec) return []
  const out = new Set()
  const parts = String(spec)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      let start = Number.parseInt(rangeMatch[1], 10)
      let end = Number.parseInt(rangeMatch[2], 10)
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue
      if (start > end) {
        const temp = start
        start = end
        end = temp
      }
      for (let page = start; page <= end; page += 1) {
        if (page >= 0 && page <= maxPage) out.add(page)
      }
      continue
    }

    const page = Number.parseInt(part, 10)
    if (!Number.isInteger(page)) continue
    if (page < 0 || page > maxPage) continue
    out.add(page)
  }

  return [...out].sort((a, b) => a - b)
}

async function readFailedPagesSnapshot(folder, maxPage) {
  const filePath = failedPagesSnapshotPath(folder)
  if (!filePath) return { filePath: null, pages: [] }

  let raw
  try {
    raw = await fs.promises.readFile(filePath, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { filePath, pages: [] }
    }
    throw err
  }

  const pages = raw
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= maxPage)

  return { filePath, pages: [...new Set(pages)].sort((a, b) => a - b) }
}

async function writeFailedPagesSnapshot(folder, failedPageIndexes) {
  const filePath = failedPagesSnapshotPath(folder)
  if (!filePath) return null
  const sorted = [...failedPageIndexes].sort((a, b) => a - b)
  const body = sorted.length ? `${sorted.join('\n')}\n` : ''
  await fs.promises.writeFile(filePath, body, 'utf8')
  return filePath
}

function recordFailedPage(folder, pageIndex, linkCount, errors) {
  if (!logging.failedPagesPath) return
  const payload = {
    timestamp: new Date().toISOString(),
    folder,
    pageIndex,
    linkCount,
    failed: Array.isArray(errors) ? errors.length : 0,
    errors: Array.isArray(errors) ? errors : [],
  }
  appendLogLine(logging.failedPagesPath, JSON.stringify(payload))
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

function normalizeUrl(href, baseUrl = BASE_ORIGIN) {
  if (!href) return null
  const cleaned = String(href).trim()
  if (!cleaned) return null
  if (cleaned.startsWith('javascript:') || cleaned.startsWith('mailto:')) return null
  try {
    return new URL(cleaned, baseUrl).toString()
  } catch {
    return null
  }
}

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url)
    const base = path.basename(parsed.pathname)
    return decodeURIComponent(base || '')
  } catch {
    return path.basename(String(url || ''))
  }
}

function buildPageUrl(datasetUrl, pageIndex) {
  const url = new URL(datasetUrl)
  url.searchParams.set('page', String(pageIndex))
  return url.toString()
}

function looksLikeGateHtml(html) {
  if (!html) return false
  const text = String(html).toLowerCase()
  const hasEftaPdfHref = /href\s*=\s*["'][^"']*efta\d+\.pdf/i.test(text)
  if (hasEftaPdfHref) return false

  return (
    text.includes('i am not a robot') ||
    text.includes('verify you are human') ||
    text.includes('security check') ||
    text.includes('checking your browser') ||
    text.includes('attention required') ||
    text.includes('request blocked') ||
    text.includes('access denied') ||
    text.includes('please complete the security check') ||
    text.includes('g-recaptcha') ||
    text.includes('h-captcha')
  )
}

function extractPdfLinksFromHtml(html, baseUrl) {
  if (!html) return []
  const out = []
  const seen = new Set()
  const hrefRe = /href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi
  let match
  while ((match = hrefRe.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1], baseUrl)
    if (!normalized) continue
    const filename = filenameFromUrl(normalized)
    if (!PDF_NAME_RE.test(filename)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function extractMaxPageFromHtml(html, baseUrl) {
  if (!html) return null
  let basePathname = null
  try {
    basePathname = new URL(baseUrl).pathname
  } catch {
    basePathname = null
  }
  let maxPage = null
  const hrefRe = /href\s*=\s*["']([^"']*[?&]page=\d+[^"']*)["']/gi
  let match
  while ((match = hrefRe.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1], baseUrl)
    if (!normalized) continue
    let parsedUrl = null
    try {
      parsedUrl = new URL(normalized)
    } catch {
      parsedUrl = null
    }
    if (!parsedUrl) continue
    if (basePathname && parsedUrl.pathname !== basePathname) continue

    const pageValue = parsedUrl.searchParams.get('page')
    const parsed = Number.parseInt(pageValue || '', 10)
    if (!Number.isInteger(parsed) || parsed < 0) continue
    if (maxPage === null || parsed > maxPage) {
      maxPage = parsed
    }
  }
  return maxPage
}

function rankCandidateUrls(urls) {
  return [...urls].sort((a, b) => {
    const aHasQuery = a.includes('?')
    const bHasQuery = b.includes('?')
    if (aHasQuery !== bHasQuery) return aHasQuery ? 1 : -1
    return a.localeCompare(b)
  })
}

function buildDownloadEntries(links, pageFolder) {
  const grouped = new Map()
  for (const link of links || []) {
    const normalized = normalizeUrl(link, BASE_ORIGIN)
    if (!normalized) continue
    const filename = filenameFromUrl(normalized)
    if (!PDF_NAME_RE.test(filename)) continue

    let group = grouped.get(filename)
    if (!group) {
      group = { filename, urls: new Set() }
      grouped.set(filename, group)
    }
    group.urls.add(normalized)
  }

  const entries = []
  for (const group of grouped.values()) {
    entries.push({
      filename: group.filename,
      destPath: path.join(pageFolder, group.filename),
      candidates: rankCandidateUrls([...group.urls]),
    })
  }

  entries.sort((a, b) => a.filename.localeCompare(b.filename))
  return entries
}

function createMutex() {
  let queue = Promise.resolve()
  return (task) => {
    const run = queue.then(task, task)
    queue = run.catch(() => {})
    return run
  }
}

function createLimiter(limit) {
  const max = Math.max(1, limit)
  let active = 0
  const waiting = []

  const schedule = () => {
    if (active >= max) return
    const next = waiting.shift()
    if (!next) return
    active += 1
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        active -= 1
        schedule()
      })
  }

  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject })
      schedule()
    })
}

async function runPool(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return
  const workerCount = Math.min(Math.max(1, limit), items.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) return
        await worker(items[index], index)
      }
    })
  )
}

function createTimeoutError(url, timeoutMs) {
  const err = new Error(`Timed out after ${timeoutMs}ms for ${url}`)
  err.code = 'ETIMEDOUT'
  return err
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = fetch) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchImpl(url, options)
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted || (err && err.name === 'AbortError')) {
      throw createTimeoutError(url, timeoutMs)
    }
    throw err
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function isTransientError(err) {
  if (!err) return false
  if (err.code === 'ETIMEDOUT') return true
  if (Number.isInteger(err.httpStatus) && TRANSIENT_HTTP_STATUS.has(err.httpStatus)) return true

  const message = String(err.message || err).toLowerCase()
  return (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('enotfound') ||
    message.includes('eai_again')
  )
}

function isNoSpaceError(err) {
  return Boolean(err && err.code === 'ENOSPC')
}

async function fetchTextWithRetry(url, headers, label) {
  let lastError = null

  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          redirect: 'follow',
          headers,
        },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        const err = new Error(`HTTP ${response.status} while fetching ${url}`)
        err.httpStatus = response.status
        throw err
      }

      return await response.text()
    } catch (err) {
      lastError = err
      const isLastAttempt = attempt >= FETCH_RETRIES
      if (!isTransientError(err) || isLastAttempt) break

      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 120)
      log('Retrying page fetch', { label, attempt, delayMs, error: String(err.message || err) })
      await sleep(delayMs)
    }
  }

  throw lastError || new Error(`Failed to fetch ${label}`)
}

async function getCookieHeader(context, url) {
  const cookies = await context.cookies(url)
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

function buildHtmlHeaders(cookieHeader) {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: `${BASE_ORIGIN}/epstein`,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  }
}

function buildPdfHeaders(cookieHeader) {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
    Referer: `${BASE_ORIGIN}/epstein`,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  }
}

async function clickFirstVisible(page, selectors, timeoutMs = 300) {
  const frames = page.frames()
  for (const frame of frames) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first()
      const visible = await locator.isVisible({ timeout: timeoutMs }).catch(() => false)
      if (!visible) continue
      const clicked = await locator.click({ timeout: 4000, force: true }).then(() => true).catch(() => false)
      if (clicked) return true

      // Fallback for elements that are visible but do not accept the regular Playwright click path.
      if (!selector.includes(':has-text(')) {
        const clickedByJs = await frame
          .evaluate((sel) => {
            const node = document.querySelector(sel)
            if (!node) return false
            const style = window.getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
              return false
            }
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
            return true
          }, selector)
          .catch(() => false)
        if (clickedByJs) return true
      }
    }
  }
  return false
}

async function hasVisibleSelector(page, selectors, timeoutMs = 200) {
  const frames = page.frames()
  for (const frame of frames) {
    for (const selector of selectors) {
      const visible = await frame
        .locator(selector)
        .first()
        .isVisible({ timeout: timeoutMs })
        .catch(() => false)
      if (visible) return true
    }
  }
  return false
}

async function pageHasEftaPdfAnchor(page) {
  const frames = page.frames()
  for (const frame of frames) {
    const count = await frame
      .$$eval('a[href]', (anchors) =>
        anchors.filter((a) => {
          const href = String(a.getAttribute('href') || '')
          return /EFTA\d+\.pdf/i.test(href)
        }).length
      )
      .catch(() => 0)
    if (count > 0) return true
  }
  return false
}

async function autoGateClickSweep(page) {
  const frames = page.frames()
  const clickedAny = await Promise.all(
    frames.map((frame) =>
      frame
        .evaluate(() => {
          let clicked = false
          const nodes = Array.from(
            document.querySelectorAll(
              '#age-button-yes, .age-gate-buttons button, .age-gate-buttons input[type=\"submit\"], input[value*=\"robot\" i], input[value*=\"human\" i], button'
            )
          )
          for (const node of nodes) {
            const text = String(node.textContent || '')
            const value = String(node.getAttribute('value') || '')
            const hay = `${text} ${value}`.toLowerCase()
            if (
              hay.includes('yes') ||
              hay.includes('i am not a robot') ||
              hay.includes('i am human') ||
              hay.includes('verify') ||
              hay.includes('continue')
            ) {
              node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
              clicked = true
            }
          }
          return clicked
        })
        .catch(() => false)
    )
  )
  return clickedAny.some(Boolean)
}

async function clearAgeAndRobotGates(page) {
  for (let attempt = 1; attempt <= GATE_ATTEMPTS; attempt += 1) {
    const clickedAge = await clickFirstVisible(page, AGE_SELECTORS)
    const clickedRobot = await clickFirstVisible(page, ROBOT_SELECTORS)
    const clickedSweep = await autoGateClickSweep(page)

    if (await pageHasEftaPdfAnchor(page)) return

    if (clickedAge || clickedRobot || clickedSweep) {
      await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {})
      await page.waitForTimeout(250)
      continue
    }

    if (await hasVisibleSelector(page, BOT_CHALLENGE_SELECTORS, 350)) {
      throw new Error('Automatic gate clear failed: CAPTCHA challenge detected')
    }

    const stillVisible = await hasVisibleSelector(page, GATE_SELECTORS)
    if (!stillVisible) return

    await page.waitForTimeout(200)
  }

  if (await pageHasEftaPdfAnchor(page)) return

  const gateVisible = await hasVisibleSelector(page, GATE_SELECTORS, 500)
  const botVisible = await hasVisibleSelector(page, BOT_CHALLENGE_SELECTORS, 500)

  if (botVisible) {
    throw new Error('Automatic gate clear failed: CAPTCHA challenge detected')
  }
  if (gateVisible) {
    throw new Error('Automatic gate clear failed: age/robot gate still visible')
  }
}

async function refreshGateAccess(gatePage, context, datasetUrl, reason) {
  const firstPageUrl = buildPageUrl(datasetUrl, 0)
  log('Refreshing gate access', { datasetUrl, reason })

  await context
    .addCookies([
      {
        name: 'age-verified',
        value: 'yes',
        domain: 'www.justice.gov',
        path: '/',
      },
    ])
    .catch(() => {})

  await gatePage.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await clearAgeAndRobotGates(gatePage)
  return getCookieHeader(context, firstPageUrl)
}

async function isLikelyExistingPdf(filePath) {
  const handle = await fs.promises.open(filePath, 'r').catch(() => null)
  if (!handle) return false
  try {
    const stats = await handle.stat().catch(() => null)
    if (!stats || stats.size < 4) return false

    const header = Buffer.alloc(4)
    const result = await handle.read(header, 0, 4, 0)
    return result.bytesRead === 4 && header.equals(Buffer.from('%PDF'))
  } finally {
    await handle.close().catch(() => {})
  }
}

function createGateResponseError(url) {
  const err = new Error(`Gate page received instead of PDF for ${url}`)
  err.code = 'GATE_RESPONSE'
  return err
}

async function downloadPdfOnce(url, destPath, context) {
  const cookieHeader = await getCookieHeader(context, url)
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      redirect: 'follow',
      headers: buildPdfHeaders(cookieHeader),
    },
    REQUEST_TIMEOUT_MS
  )

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} for ${url}`)
    err.httpStatus = response.status
    throw err
  }

  const body = Buffer.from(await response.arrayBuffer())
  if (!body.length) {
    throw new Error(`Empty response body for ${url}`)
  }

  if (!(body.length >= 4 && body.subarray(0, 4).equals(Buffer.from('%PDF')))) {
    const sample = body.subarray(0, 2048).toString('utf8')
    if (looksLikeGateHtml(sample)) {
      throw createGateResponseError(url)
    }
    const contentType = response.headers.get('content-type') || 'unknown'
    throw new Error(`Non-PDF response (${contentType}) for ${url}`)
  }

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  const tempPath = `${destPath}.part-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await fs.promises.writeFile(tempPath, body)
    await fs.promises.rename(tempPath, destPath)
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw err
  }
}

async function downloadPdfFromCandidates(candidates, destPath, context, refreshAccess, label) {
  let lastError = null

  for (const url of candidates) {
    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
      try {
        await downloadPdfOnce(url, destPath, context)
        return
      } catch (err) {
        lastError = err

        if (err.code === 'GATE_RESPONSE' || err.httpStatus === 403 || err.httpStatus === 429) {
          await refreshAccess(`${label} gate refresh`)
          continue
        }

        const isLastAttempt = attempt >= DOWNLOAD_RETRIES
        if (!isTransientError(err) || isLastAttempt) break

        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 120)
        await sleep(delayMs)
      }
    }
  }

  throw lastError || new Error(`Failed to download ${destPath}`)
}

async function extractPdfLinksFromPage(page, pageUrl) {
  const frames = page.frames()
  const hrefArrays = await Promise.all(
    frames.map((frame) =>
      frame.$$eval('a[href]', (anchors) => anchors.map((a) => a.getAttribute('href') || a.href || '')).catch(() => [])
    )
  )

  const links = []
  const seen = new Set()
  for (const href of hrefArrays.flat()) {
    const normalized = normalizeUrl(href, pageUrl)
    if (!normalized) continue
    const filename = filenameFromUrl(normalized)
    if (!PDF_NAME_RE.test(filename)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    links.push(normalized)
  }
  return links
}

async function extractMaxPageFromPage(page, pageUrl) {
  const html = await page.content().catch(() => '')
  const byHtml = extractMaxPageFromHtml(html, pageUrl)
  if (Number.isInteger(byHtml) && byHtml >= 0) return byHtml

  const frameValues = await Promise.all(
    page.frames().map((frame) =>
      frame
        .$$eval('a[href*="page="]', (anchors) =>
          anchors
            .map((a) => {
              const rawHref = a.getAttribute('href') || a.href || ''
              try {
                const parsed = new URL(rawHref, window.location.href)
                return Number.parseInt(parsed.searchParams.get('page') || '', 10)
              } catch {
                return Number.NaN
              }
            })
            .filter((value) => Number.isInteger(value) && value >= 0)
        )
        .catch(() => [])
    )
  )
  const allValues = frameValues.flat()
  if (allValues.length === 0) return null
  return Math.max(...allValues)
}

async function collectPageFromBrowser(page, datasetUrl, pageIndex) {
  const pageUrl = buildPageUrl(datasetUrl, pageIndex)
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(500)
  await clearAgeAndRobotGates(page)
  await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(250)
  await page.waitForSelector('a[href*="EFTA"]', { timeout: 8000 }).catch(() => {})

  const links = await extractPdfLinksFromPage(page, pageUrl)
  const maxPage = await extractMaxPageFromPage(page, pageUrl)
  return { pageUrl, links, maxPage }
}

async function collectPageFromBrowserWithRetry(page, datasetUrl, pageIndex, folderLabel) {
  let lastError = null
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const result = await collectPageFromBrowser(page, datasetUrl, pageIndex)
      if (result.links.length === 0) {
        throw new Error(`No PDF links found on page ${pageIndex}`)
      }
      return result
    } catch (err) {
      lastError = err
      const message = String(err && err.message ? err.message : err).toLowerCase()
      const hardStop =
        message.includes('captcha challenge') ||
        message.includes('manual gate') ||
        message.includes('headless mode')
      if (hardStop || attempt >= FETCH_RETRIES) break

      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 120)
      log('Retrying page open', {
        folder: folderLabel,
        pageIndex,
        attempt,
        delayMs,
        error: String(err && err.message ? err.message : err),
      })
      await sleep(delayMs)
    }
  }

  throw lastError || new Error(`Failed to open page ${pageIndex}`)
}

function doneMarkerPath(pageFolder) {
  return path.join(pageFolder, PAGE_DONE_MARKER)
}

async function isPageDone(pageFolder, pageIndex) {
  if (!SKIP_DONE) return false

  const markerPath = doneMarkerPath(pageFolder)
  let raw
  try {
    raw = await fs.promises.readFile(markerPath, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return false
    return false
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Number.isInteger(parsed.pageIndex) || parsed.pageIndex !== pageIndex) return false
    if (!Number.isInteger(parsed.linkCount) || parsed.linkCount < 0) return false

    if (parsed.linkCount === 0) return true

    const entries = await fs.promises.readdir(pageFolder, { withFileTypes: true }).catch(() => [])
    const pdfFiles = entries
      .filter((entry) => entry.isFile() && PDF_NAME_RE.test(entry.name))
      .map((entry) => path.join(pageFolder, entry.name))

    if (pdfFiles.length < parsed.linkCount) return false

    let validCount = 0
    for (const filePath of pdfFiles) {
      if (await isLikelyExistingPdf(filePath)) {
        validCount += 1
        if (validCount >= parsed.linkCount) return true
      }
    }

    return false
  } catch {
    return false
  }
}

async function markPageDone(pageFolder, pageIndex, linkCount) {
  const payload = {
    pageIndex,
    linkCount,
    completedAt: new Date().toISOString(),
  }
  await fs.promises.writeFile(doneMarkerPath(pageFolder), `${JSON.stringify(payload)}\n`, 'utf8')
}

async function processDataset(dataset, baseDir, context, gatePage, downloadLimiter) {
  const datasetDir = path.join(baseDir, dataset.folder)
  await fs.promises.mkdir(datasetDir, { recursive: true })

  const withGateLock = createMutex()

  const refreshAccess = (reason) => withGateLock(() => refreshGateAccess(gatePage, context, dataset.url, reason))

  await refreshAccess('initial access')

  const page0Result = await withGateLock(() => collectPageFromBrowserWithRetry(gatePage, dataset.url, 0, dataset.folder))
  const maxPage = page0Result.maxPage
  if (!Number.isInteger(maxPage) || maxPage < 0) {
    throw new Error(`Could not discover max page for ${dataset.folder}`)
  }
  const page0Links = page0Result.links

  const pagePad = Math.max(PAGE_FOLDER_PAD, String(maxPage).length)
  let pageIndexes = Array.from({ length: maxPage + 1 }, (_unused, index) => index)
  if (ONLY_PAGES_SPEC.trim()) {
    const selected = parsePageSelection(ONLY_PAGES_SPEC, maxPage)
    if (selected.length === 0) {
      throw new Error(`ONLY_PAGES selection produced no valid pages for ${dataset.folder}`)
    }
    pageIndexes = selected
    log('Using explicit page selection', {
      folder: dataset.folder,
      onlyPages: ONLY_PAGES_SPEC,
      selectedCount: pageIndexes.length,
      firstPage: pageIndexes[0],
      lastPage: pageIndexes[pageIndexes.length - 1],
    })
  } else if (ONLY_FAILED_PAGES) {
    const { filePath, pages } = await readFailedPagesSnapshot(dataset.folder, maxPage)
    if (pages.length === 0) {
      log('No failed pages to retry; skipping dataset', {
        folder: dataset.folder,
        failedPagesFile: filePath,
      })
      return
    }
    pageIndexes = pages
    log('Retrying failed pages only', {
      folder: dataset.folder,
      failedPagesFile: filePath,
      selectedCount: pageIndexes.length,
      firstPage: pageIndexes[0],
      lastPage: pageIndexes[pageIndexes.length - 1],
    })
  }

  const stats = {
    pagesTotal: pageIndexes.length,
    pagesCompleted: 0,
    pagesSkipped: 0,
    pageErrors: 0,
    filesDownloaded: 0,
    filesFailed: 0,
  }
  const failedPageIndexes = new Set()
  const datasetState = {
    stop: false,
    stopReason: null,
    stopError: null,
  }

  log('Dataset start', {
    folder: dataset.folder,
    maxPage,
    pageWorkers: PAGE_WORKERS,
    downloadWorkers: DOWNLOAD_WORKERS,
  })

  let nextOffset = 0
  const pageWorkerCount = Math.min(PAGE_WORKERS, pageIndexes.length)

  await Promise.all(
    Array.from({ length: pageWorkerCount }, async () => {
      const workerPage = await context.newPage()
      try {
        while (true) {
          if (datasetState.stop) break

          const offset = nextOffset
          nextOffset += 1
          if (offset >= pageIndexes.length) break

          const pageIndex = pageIndexes[offset]
          const pageFolder = path.join(datasetDir, `page-${String(pageIndex).padStart(pagePad, '0')}`)

          if (await isPageDone(pageFolder, pageIndex)) {
            stats.pagesSkipped += 1
            continue
          }

          try {
            await fs.promises.mkdir(pageFolder, { recursive: true })
          } catch (err) {
            if (isNoSpaceError(err)) {
              datasetState.stop = true
              datasetState.stopReason = `No space left on device while creating ${pageFolder}`
              datasetState.stopError = err
              logError('Stopping dataset due to disk full', {
                folder: dataset.folder,
                pageIndex,
                path: pageFolder,
                error: String(err && err.message ? err.message : err),
              })
              break
            }
            throw err
          }

          try {
            let links
            if (pageIndex === 0) {
              links = page0Links
            } else {
              const pageResult = await collectPageFromBrowserWithRetry(workerPage, dataset.url, pageIndex, dataset.folder)
              links = pageResult.links
            }

            const entries = buildDownloadEntries(links, pageFolder)
            if (entries.length === 0) {
              throw new Error(`No PDF links found on page ${pageIndex}`)
            }

            const errors = []
            let downloadedCount = 0

            await Promise.all(
              entries.map((entry) =>
                downloadLimiter(async () => {
                  if (datasetState.stop) return
                  try {
                    if (await isLikelyExistingPdf(entry.destPath)) {
                      return
                    }

                    await downloadPdfFromCandidates(
                      entry.candidates,
                      entry.destPath,
                      context,
                      refreshAccess,
                      `${dataset.folder} page ${pageIndex}`
                    )
                    downloadedCount += 1
                  } catch (err) {
                    errors.push({
                      file: entry.filename,
                      pageIndex,
                      message: String(err && err.message ? err.message : err),
                    })
                    if (isNoSpaceError(err)) {
                      datasetState.stop = true
                      datasetState.stopReason = `No space left on device while downloading ${entry.filename}`
                      datasetState.stopError = err
                    }
                  }
                })
              )
            )

            stats.filesDownloaded += downloadedCount
            if (errors.length > 0) {
              stats.filesFailed += errors.length
              stats.pageErrors += 1
              failedPageIndexes.add(pageIndex)
              recordFailedPage(dataset.folder, pageIndex, entries.length, errors)
              log('Page completed with download errors', {
                folder: dataset.folder,
                pageIndex,
                linkCount: entries.length,
                failed: errors.length,
                sample: errors.slice(0, 3),
              })
              if (datasetState.stop) {
                logError('Stopping dataset after disk full during downloads', {
                  folder: dataset.folder,
                  pageIndex,
                  reason: datasetState.stopReason,
                })
                break
              }
              continue
            }

            await markPageDone(pageFolder, pageIndex, entries.length)
            stats.pagesCompleted += 1

            log('Page complete', {
              folder: dataset.folder,
              pageIndex,
              linkCount: entries.length,
              downloaded: downloadedCount,
            })
          } catch (err) {
            stats.pageErrors += 1
            failedPageIndexes.add(pageIndex)
            recordFailedPage(dataset.folder, pageIndex, 0, [
              {
                file: null,
                pageIndex,
                message: String(err && err.message ? err.message : err),
              },
            ])

            if (isNoSpaceError(err)) {
              datasetState.stop = true
              datasetState.stopReason = `No space left on device while processing page ${pageIndex}`
              datasetState.stopError = err
              logError('Stopping dataset due to disk full', {
                folder: dataset.folder,
                pageIndex,
                reason: datasetState.stopReason,
              })
              break
            }

            logError('Page failed', {
              folder: dataset.folder,
              pageIndex,
              error: String(err && err.message ? err.message : err),
            })
          }
        }
      } finally {
        await workerPage.close().catch(() => {})
      }
    })
  )

  const failedPagesSnapshotPath = await writeFailedPagesSnapshot(dataset.folder, failedPageIndexes)

  log('Dataset summary', {
    folder: dataset.folder,
    ...stats,
    failedPages: failedPageIndexes.size,
    failedPagesFile: failedPagesSnapshotPath,
  })

  if (datasetState.stop) {
    const stopError = datasetState.stopError || new Error(datasetState.stopReason || 'Dataset stopped')
    if (!stopError.code && /no space/i.test(String(stopError.message || ''))) {
      stopError.code = 'ENOSPC'
    }
    throw stopError
  }
}

async function main() {
  const baseDir = path.resolve(process.argv[2] || '.')
  await fs.promises.mkdir(baseDir, { recursive: true })
  await initLogging(baseDir)

  log('Scraper start', {
    baseDir,
    logDir: logging.logDir,
    runtime: process.versions.bun,
    headless: HEADLESS,
    pageWorkers: PAGE_WORKERS,
    downloadWorkers: DOWNLOAD_WORKERS,
    onlyFailedPages: ONLY_FAILED_PAGES,
    onlyPages: ONLY_PAGES_SPEC || null,
  })

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    acceptDownloads: true,
    extraHTTPHeaders: {
      Referer: `${BASE_ORIGIN}/epstein`,
    },
  })

  const gatePage = await context.newPage()
  const downloadLimiter = createLimiter(DOWNLOAD_WORKERS)

  try {
    for (const dataset of DATASETS) {
      await processDataset(dataset, baseDir, context, gatePage, downloadLimiter)
    }
  } finally {
    await gatePage.close().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  log('Done')
}

if (require.main === module) {
  main().catch((err) => {
    logError('Fatal scraper error', {
      error: String(err && err.message ? err.message : err),
      code: err && err.code ? err.code : null,
      stack: err && err.stack ? err.stack : null,
    })
    console.error(err)
    process.exit(1)
  })
}

module.exports = {
  buildDownloadEntries,
  buildPageUrl,
  extractMaxPageFromHtml,
  extractPdfLinksFromHtml,
  fetchWithTimeout,
  filenameFromUrl,
  looksLikeGateHtml,
  normalizeUrl,
}
