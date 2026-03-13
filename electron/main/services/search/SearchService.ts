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
}
