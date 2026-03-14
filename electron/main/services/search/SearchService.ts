import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BaseService } from '@electron/services/base/BaseService'
import * as cheerio from 'cheerio'

/**
 * SearchResult — a single web search result.
 */
export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * FileSearchResult — a single file/folder found on the system.
 */
export interface FileSearchResult {
  name: string
  path: string
  isDirectory: boolean
  size?: number       // bytes (files only)
  modified?: string   // ISO date string
}

/**
 * SearchService — web search via DuckDuckGo HTML endpoint + cheerio.
 *
 * Uses `https://html.duckduckgo.com/html/` which is designed for
 * non-JS clients and doesn't trigger anti-bot detection.
 * Parses results with cheerio.
 */
export class SearchService extends BaseService {
  async init(): Promise<void> {
    this.log.info('SearchService initialized')
  }

  async dispose(): Promise<void> {
    this.log.info('SearchService disposed')
  }

  async searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
    try {
      this.log.info(`Searching: "${query}"`)

      const response = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ q: query }),
      })

      if (!response.ok) {
        this.log.warn(`DDG HTTP error: ${response.status}`)
        return []
      }

      const html = await response.text()
      const $ = cheerio.load(html)
      const results: SearchResult[] = []

      $('.result__body').each((_i, el) => {
        if (results.length >= maxResults) return false

        const $el = $(el)
        const $link = $el.find('.result__a')
        const $snippet = $el.find('.result__snippet')

        const title = $link.text().trim()
        let url = $link.attr('href') || ''
        const snippet = $snippet.text().trim()

        // DDG wraps URLs in redirect — extract actual URL
        if (url.includes('uddg=')) {
          const decoded = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '')
          if (decoded) url = decoded
        }

        if (title && url) {
          results.push({ title, url, snippet })
        }
      })

      this.log.info(`Found ${results.length} results for: "${query}"`)
      return results
    } catch (err) {
      this.log.error('Search failed:', err)
      return []
    }
  }

  formatForLLM(results: SearchResult[]): string {
    if (results.length === 0) return 'No search results found.'
    return results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n')
  }

  /**
   * Search for files/folders on the local system using PowerShell.
   *
   * Streams results in real-time via the `onResult` callback so the
   * SearchIsland can show files as they're discovered.
   *
   * @param query — search term (filename or part of it)
   * @param onResult — called each time a batch of results is found
   * @param maxResults — max total results to return
   * @returns All found results
   */
  async searchFiles(
    query: string,
    maxResults = 10,
    onResult?: (results: FileSearchResult[]) => void,
  ): Promise<FileSearchResult[]> {
    try {
      this.log.info(`File search: "${query}"`)

      // Normalize query: strip paths, wildcards, special chars
      const keywords = this.normalizeQuery(query)
      if (!keywords.length) {
        this.log.warn('File search: empty query after normalization')
        return []
      }

      // Build search variants: original keywords + transliterated
      const searchVariants = this.buildSearchVariants(keywords)
      this.log.info(`Search variants: ${JSON.stringify(searchVariants)}`)

      const homeDir = os.homedir()
      const allResults: FileSearchResult[] = []
      const seenPaths = new Set<string>()

      // Discover existing user directories dynamically
      const knownFolders = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive']
      const searchPaths = knownFolders
        .map(f => path.join(homeDir, f))
        .filter(p => { try { return fs.existsSync(p) } catch { return false } })

      for (const searchPath of searchPaths) {
        if (allResults.length >= maxResults) break

        // Try each search variant
        for (const variant of searchVariants) {
          if (allResults.length >= maxResults) break

          const remaining = maxResults - allResults.length
          const safeVariant = variant
            .replace(/"/g, '`"')
            .replace(/'/g, "''")
            .replace(/[;&|`$]/g, '')

          const psCmd = `Get-ChildItem -Path "${searchPath}" -Recurse -Depth 5 -Filter "*${safeVariant}*" -ErrorAction SilentlyContinue | Select-Object -First ${remaining} Name, FullName, PSIsContainer, Length, LastWriteTime | ConvertTo-Json -Compress`

          try {
            const output = await this.execPowerShell(psCmd)
            if (!output.trim()) continue

            let parsed = JSON.parse(output)
            if (!Array.isArray(parsed)) parsed = [parsed]

            const batch: FileSearchResult[] = []
            for (const item of parsed as Array<{
              Name: string
              FullName: string
              PSIsContainer: boolean
              Length?: number
              LastWriteTime?: string
            }>) {
              // Deduplicate across variants
              if (seenPaths.has(item.FullName)) continue
              seenPaths.add(item.FullName)

              batch.push({
                name: item.Name,
                path: item.FullName,
                isDirectory: item.PSIsContainer,
                size: item.PSIsContainer ? undefined : (item.Length ?? undefined),
                modified: item.LastWriteTime ?? undefined,
              })
            }

            allResults.push(...batch)

            // Emit progressive results — UI updates in real-time
            if (onResult && batch.length > 0) {
              onResult([...allResults])
            }
          } catch {
            continue
          }
        }
      }

      this.log.info(`Found ${allResults.length} files for: "${query}"`)
      return allResults
    } catch (err) {
      this.log.error('File search failed:', err)
      return []
    }
  }

  /**
   * Format file search results as text for LLM context.
   */
  formatFilesForLLM(results: FileSearchResult[]): string {
    if (results.length === 0) return 'No files found.'
    return results
      .map((r, i) => {
        const type = r.isDirectory ? '📁 Folder' : '📄 File'
        const size = r.size != null ? ` (${this.formatSize(r.size)})` : ''
        return `${i + 1}. ${type}: **${r.name}**${size}\n   ${r.path}`
      })
      .join('\n')
  }

  // ── Private Helpers ──

  /**
   * Normalize a query string: strip path components, drive letters, wildcards.
   * Returns an array of clean keywords.
   */
  private normalizeQuery(raw: string): string[] {
    let cleaned = raw
      // Remove drive letters and path prefixes
      .replace(/^[A-Za-z]:\\[^\s]*/g, (match) => {
        // Extract the last meaningful segment from a path
        const parts = match.split(/[/\\]/).filter(Boolean)
        const last = parts[parts.length - 1] || ''
        return last.replace(/^\*+|\*+$/g, '')
      })
      // Remove wildcards
      .replace(/\*/g, ' ')
      // Remove path separators
      .replace(/[/\\]/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()

    // Split into keywords and filter empty
    return cleaned.split(' ').filter(k => k.length > 0)
  }

  /**
   * Build search variants from keywords.
   * Generates joined, hyphenated and underscored combinations
   * plus individual keywords for broader matching.
   */
  private buildSearchVariants(keywords: string[]): string[] {
    const variants = new Set<string>()

    if (keywords.length > 0) {
      variants.add(keywords.join(''))    // joined
      variants.add(keywords.join('-'))   // hyphenated
      variants.add(keywords.join('_'))   // underscored
      for (const kw of keywords) {
        variants.add(kw)
      }
    }

    return [...variants].filter(v => v.length > 0)
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  private execPowerShell(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          shell: 'powershell.exe',
          timeout: 15_000,
          encoding: 'utf-8',
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error && !stdout?.trim()) {
            reject(error)
          } else {
            resolve((stdout ?? '').trim())
          }
        },
      )
    })
  }
}
