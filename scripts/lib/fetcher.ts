/**
 * Rate-limited HTTP client for Rwanda legislation pages hosted on RwandaLII.
 *
 * Source:
 *   https://rwandalii.org/akn/rw/act/law/{year}/{number}/eng@{date}
 *
 * Notes:
 * - Uses a 1.2s minimum delay between requests to respect remote servers.
 * - Retries transient failures (429/5xx/network) with exponential backoff.
 * - Uses an explicit User-Agent for ingestion transparency.
 */

const USER_AGENT = 'Rwandan-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Rwandan-law-mcp)';
const MIN_DELAY_MS = 1200;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await enforceRateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,*/*',
        },
        redirect: 'follow',
      });

      const body = await response.text();
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} from ${url}; retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }

      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        url: response.url,
      };
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      const backoffMs = Math.pow(2, attempt + 1) * 1000;
      console.log(`  Network error for ${url}; retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}
