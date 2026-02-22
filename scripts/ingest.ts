#!/usr/bin/env tsx
/**
 * Rwanda Law MCP -- full-catalog ingestion.
 *
 * Sources:
 * - RwandaLII law catalog API (`/search/api/documents/`)
 * - RwandaLII law detail pages (AKN HTML or PDF-backed)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchBinaryWithRateLimit, fetchWithRateLimit } from './lib/fetcher.js';
import {
  buildDocumentIdFromHref,
  extractLawPageMetadata,
  parseAknLawHtml,
  parseCatalogResultsHtml,
  parsePdfExtractedText,
  type CatalogLaw,
  type LawPageMetadata,
  type ParsedAct,
} from './lib/parser.js';
import { extractTextFromPdf } from './lib/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_URL = 'https://rwandalii.org';
const SEARCH_API = 'https://rwandalii.org/search/api/documents/';
const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CATALOG_CACHE_PATH = path.resolve(SOURCE_DIR, '_catalog-laws.json');

interface CliArgs {
  limit: number | null;
  offset: number;
  append: boolean;
  refreshCatalog: boolean;
  skipFetch: boolean;
}

interface IngestionResult {
  id: string;
  url: string;
  source_type: 'akn' | 'pdf';
  status: 'ok' | 'failed' | 'skipped';
  provisions: number;
  definitions: number;
  seed_file?: string;
  reason?: string;
  warnings?: string[];
}

interface SearchApiResponse {
  count: number;
  results_html?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let offset = 0;
  let append = false;
  let refreshCatalog = false;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    if (args[i] === '--offset' && args[i + 1]) {
      offset = Number.parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    if (args[i] === '--append') {
      append = true;
      continue;
    }
    if (args[i] === '--refresh-catalog') {
      refreshCatalog = true;
      continue;
    }
    if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, offset: Math.max(0, offset), append, refreshCatalog, skipFetch };
}

function ensureDirectories(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function resetSeedDirectory(): void {
  const files = fs.readdirSync(SEED_DIR).filter(file => file.endsWith('.json'));
  for (const file of files) {
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

function readJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

function absoluteUrl(href: string): string {
  return new URL(href, ROOT_URL).toString();
}

function sourceHtmlPath(id: string): string {
  return path.join(SOURCE_DIR, `${id}.html`);
}

function sourcePdfPath(id: string): string {
  return path.join(SOURCE_DIR, `${id}.pdf`);
}

function sourceTextPath(id: string): string {
  return path.join(SOURCE_DIR, `${id}.txt`);
}

function seedPath(index: number, actId: string): string {
  const seq = String(index).padStart(3, '0');
  return path.join(SEED_DIR, `${seq}-${actId}.json`);
}

function currentSeedIndex(): number {
  const existing = fs.readdirSync(SEED_DIR)
    .filter(file => /^\d{3}-.*\.json$/.test(file))
    .map(file => Number.parseInt(file.slice(0, 3), 10))
    .filter(n => Number.isFinite(n));
  if (existing.length === 0) return 1;
  return Math.max(...existing) + 1;
}

async function fetchCatalogLaws(): Promise<CatalogLaw[]> {
  const collected = new Map<string, CatalogLaw>();
  const currentYear = new Date().getUTCFullYear();
  const firstYear = 2000;
  const yearQueries = Array.from(
    { length: Math.max(0, currentYear - firstYear + 1) },
    (_, index) => String(firstYear + index),
  );
  const queries = ['law', ...yearQueries];

  for (const query of queries) {
    let page = 1;
    let count = 0;
    let pageSize = 10;

    while (true) {
      const url =
        `${SEARCH_API}?search=${encodeURIComponent(query)}` +
        `&page=${page}&ordering=-date&mode=text&doc_type=legislation&nature=Law`;
      const response = await fetchWithRateLimit(url);
      const responseStatus = response.status;
      const responseBody = response.body;

      if (responseStatus === 400 && page > 1) {
        // RwandaLII search API currently returns HTTP 400 for pages beyond the valid range.
        break;
      }
      if (responseStatus !== 200) {
        throw new Error(`Catalog fetch failed for query "${query}" page ${page}: HTTP ${responseStatus}`);
      }

      const body = readJson<SearchApiResponse>(responseBody);
      count = body.count;
      const rows = parseCatalogResultsHtml(body.results_html ?? '');
      if (rows.length === 0) break;

      pageSize = rows.length;
      for (const row of rows) {
        if (!collected.has(row.href)) {
          collected.set(row.href, row);
        }
      }

      const reachedEnd = page * pageSize >= count;
      if (reachedEnd) break;
      page++;
    }
  }

  return Array.from(collected.values());
}

function loadCachedCatalog(): CatalogLaw[] | null {
  if (!fs.existsSync(CATALOG_CACHE_PATH)) return null;
  try {
    const raw = fs.readFileSync(CATALOG_CACHE_PATH, 'utf-8');
    const data = JSON.parse(raw) as CatalogLaw[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCatalogCache(catalog: CatalogLaw[]): void {
  fs.writeFileSync(CATALOG_CACHE_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

async function fetchLawHtml(
  lawUrl: string,
  provisionalId: string,
  skipFetch: boolean,
): Promise<string> {
  const htmlPath = sourceHtmlPath(provisionalId);
  if (skipFetch && fs.existsSync(htmlPath)) {
    return fs.readFileSync(htmlPath, 'utf-8');
  }

  const response = await fetchWithRateLimit(lawUrl);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}`);
  }
  fs.writeFileSync(htmlPath, response.body);
  return response.body;
}

async function fetchLawPdf(
  pdfUrl: string,
  id: string,
  skipFetch: boolean,
): Promise<string> {
  const pdfPath = sourcePdfPath(id);
  if (skipFetch && fs.existsSync(pdfPath)) {
    return pdfPath;
  }

  const response = await fetchBinaryWithRateLimit(pdfUrl);
  if (response.status !== 200) {
    throw new Error(`PDF HTTP ${response.status}`);
  }
  fs.writeFileSync(pdfPath, response.body);
  return pdfPath;
}

function parseAct(
  metadata: LawPageMetadata,
  html: string,
  skipFetch: boolean,
): { act: ParsedAct; warnings: string[] } {
  if (metadata.source_type === 'akn') {
    return { act: parseAknLawHtml(html, metadata), warnings: [] };
  }

  if (!metadata.pdf_url) {
    throw new Error('PDF source URL missing for PDF-backed law page');
  }

  const pdfPath = sourcePdfPath(metadata.id);
  if (!skipFetch && !fs.existsSync(pdfPath)) {
    throw new Error(`PDF file missing at ${pdfPath}`);
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF cache not found at ${pdfPath}`);
  }

  const extraction = extractTextFromPdf(pdfPath);
  fs.writeFileSync(sourceTextPath(metadata.id), extraction.text);

  const act = parsePdfExtractedText(extraction.text, metadata);
  const warnings = [...extraction.warnings, `pdf_text_method=${extraction.method}`];
  return { act, warnings };
}

async function run(): Promise<void> {
  const { limit, offset, append, refreshCatalog, skipFetch } = parseArgs();

  console.log('Rwandan Law MCP -- Full Law Ingestion');
  console.log('=====================================\n');
  console.log(`Catalog source: ${SEARCH_API}`);
  if (limit) console.log(`Mode: --limit ${limit}`);
  if (offset) console.log(`Mode: --offset ${offset}`);
  if (append) console.log('Mode: --append');
  if (refreshCatalog) console.log('Mode: --refresh-catalog');
  if (skipFetch) console.log('Mode: --skip-fetch');
  console.log('');

  ensureDirectories();
  if (!append) {
    resetSeedDirectory();
  }

  let catalog: CatalogLaw[] | null = null;
  if (!refreshCatalog) {
    catalog = loadCachedCatalog();
  }

  if (catalog) {
    console.log(`Using cached catalog: ${CATALOG_CACHE_PATH}`);
  } else {
    console.log('Fetching law catalog...');
    catalog = await fetchCatalogLaws();
    writeCatalogCache(catalog);
  }
  const sliced = offset > 0 ? catalog.slice(offset) : catalog;
  const targetRows = limit ? sliced.slice(0, limit) : sliced;
  console.log(`Catalog size: ${catalog.length} | Processing: ${targetRows.length}\n`);

  let seedIndex = append ? currentSeedIndex() : 1;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  let aknCount = 0;
  let pdfCount = 0;

  const results: IngestionResult[] = [];

  for (const row of targetRows) {
    const lawUrl = absoluteUrl(row.href);
    const provisionalId = buildDocumentIdFromHref(row.href);
    process.stdout.write(`  ${provisionalId} ...`);

    try {
      const html = await fetchLawHtml(lawUrl, provisionalId, skipFetch);
      const metadata = extractLawPageMetadata(html, lawUrl);

      if (metadata.id !== provisionalId) {
        const oldPath = sourceHtmlPath(provisionalId);
        const newPath = sourceHtmlPath(metadata.id);
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }

      if (metadata.source_type === 'pdf') {
        if (!metadata.pdf_url) {
          throw new Error('Missing pdf_url in metadata');
        }
        await fetchLawPdf(metadata.pdf_url, metadata.id, skipFetch);
        pdfCount++;
      } else {
        aknCount++;
      }

      const { act, warnings } = parseAct(metadata, html, skipFetch);
      const seedFile = path.basename(seedPath(seedIndex, metadata.id));
      fs.writeFileSync(seedPath(seedIndex, metadata.id), `${JSON.stringify(act, null, 2)}\n`);
      seedIndex++;

      totalProvisions += act.provisions.length;
      totalDefinitions += act.definitions.length;

      results.push({
        id: metadata.id,
        url: metadata.url,
        source_type: metadata.source_type,
        status: 'ok',
        provisions: act.provisions.length,
        definitions: act.definitions.length,
        seed_file: seedFile,
        warnings: warnings.length > 0 ? warnings : undefined,
      });

      console.log(
        ` OK (${metadata.source_type}, ${act.provisions.length} provisions, ${act.definitions.length} definitions)`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const isImageOnlyPdf = reason.toLowerCase().includes('no text extracted from pdf');
      const status: IngestionResult['status'] = isImageOnlyPdf ? 'skipped' : 'failed';

      results.push({
        id: provisionalId,
        url: lawUrl,
        source_type: 'pdf',
        status,
        provisions: 0,
        definitions: 0,
        reason: isImageOnlyPdf
          ? `${reason}; source appears image-only (no text layer available for parsing)`
          : reason,
      });
      console.log(` ${status.toUpperCase()} (${reason})`);
    }
  }

  const success = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  const report = {
    generated_at: new Date().toISOString(),
    catalog_total: catalog.length,
    processed_total: targetRows.length,
    success,
    skipped,
    failed,
    akn_success: results.filter(r => r.status === 'ok' && r.source_type === 'akn').length,
    pdf_success: results.filter(r => r.status === 'ok' && r.source_type === 'pdf').length,
    total_provisions: totalProvisions,
    total_definitions: totalDefinitions,
    results,
  };
  fs.writeFileSync(path.join(SEED_DIR, '_ingestion-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log('\nIngestion report');
  console.log('----------------');
  console.log(`Catalog entries: ${catalog.length}`);
  console.log(`Processed:       ${targetRows.length}`);
  console.log(`Success:         ${success}`);
  console.log(`Skipped:         ${skipped}`);
  console.log(`Failed:          ${failed}`);
  console.log(`AKN parsed:      ${aknCount}`);
  console.log(`PDF parsed:      ${pdfCount}`);
  console.log(`Provisions:      ${totalProvisions}`);
  console.log(`Definitions:     ${totalDefinitions}`);
  console.log(`Report file:     ${path.join(SEED_DIR, '_ingestion-report.json')}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
