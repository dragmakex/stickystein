# AGENTS.md

## Runtime Requirement
- Always use **Bun** for this repository.
- Do not use `node`, `npm`, or `npx` commands here.

## Commands
- Run scraper: `bun scrape_e.js [output_dir]`
- Install dependencies: `bun install`
- Run one-off scripts: `bun <script>`

## Notes
- `scrape_e.js` is Bun-only and will throw if run outside Bun.
- Headless mode is enabled by default in the scraper.
