#!/usr/bin/env tsx
/**
 * Rwanda Law MCP -- Real ingestion pipeline.
 *
 * Fetches machine-readable law pages from RwandaLII, parses provisions, and
 * writes seed JSON files into data/seed/.
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --limit 3
 *   npm run ingest -- --skip-fetch
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parseRwandanLawHtml, TARGET_RWANDAN_LAWS, type ActTarget } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
}

interface IngestionResult {
  id: string;
  seedFile: string;
  url: string;
  status: 'ok' | 'skipped' | 'failed';
  provisions: number;
  definitions: number;
  reason?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function ensureDirectories(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function cleanSeedDirectory(): void {
  const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

function sourcePathFor(target: ActTarget): string {
  return path.join(SOURCE_DIR, `${target.id}.html`);
}

function seedPathFor(target: ActTarget): string {
  return path.join(SEED_DIR, target.seedFile);
}

async function fetchHtml(target: ActTarget, skipFetch: boolean): Promise<string> {
  const sourcePath = sourcePathFor(target);
  if (skipFetch && fs.existsSync(sourcePath)) {
    return fs.readFileSync(sourcePath, 'utf-8');
  }

  const result = await fetchWithRateLimit(target.url);
  if (result.status !== 200) {
    throw new Error(`HTTP ${result.status}`);
  }

  fs.writeFileSync(sourcePath, result.body);
  return result.body;
}

async function run(): Promise<void> {
  const { limit, skipFetch } = parseArgs();
  const targets = limit ? TARGET_RWANDAN_LAWS.slice(0, limit) : TARGET_RWANDAN_LAWS;

  console.log('Rwandan Law MCP -- Real Data Ingestion');
  console.log('======================================\n');
  console.log('Source: RwandaLII legislation pages (AKN HTML rendering)');
  console.log(`Targets: ${targets.length} laws`);
  if (skipFetch) console.log('Mode: --skip-fetch (use cached source HTML)');
  if (limit) console.log(`Mode: --limit ${limit}`);
  console.log('');

  ensureDirectories();
  cleanSeedDirectory();

  const results: IngestionResult[] = [];
  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (const target of targets) {
    process.stdout.write(`  Fetching ${target.id}...`);
    try {
      const html = await fetchHtml(target, skipFetch);
      const parsed = parseRwandanLawHtml(html, target);
      fs.writeFileSync(seedPathFor(target), `${JSON.stringify(parsed, null, 2)}\n`);

      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;

      results.push({
        id: target.id,
        seedFile: target.seedFile,
        url: target.url,
        status: 'ok',
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
      });
      console.log(` OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({
        id: target.id,
        seedFile: target.seedFile,
        url: target.url,
        status: 'failed',
        provisions: 0,
        definitions: 0,
        reason,
      });
      console.log(` FAILED (${reason})`);
    }
  }

  console.log('\nIngestion report');
  console.log('----------------');
  console.log(`Success: ${results.filter(r => r.status === 'ok').length}`);
  console.log(`Failed:  ${results.filter(r => r.status === 'failed').length}`);
  console.log(`Total provisions:  ${totalProvisions}`);
  console.log(`Total definitions: ${totalDefinitions}\n`);

  for (const row of results) {
    if (row.status === 'ok') {
      console.log(`  [OK] ${row.id} -> ${row.seedFile}`);
    } else {
      console.log(`  [FAILED] ${row.id} -> ${row.reason}`);
    }
  }

  const failures = results.filter(r => r.status === 'failed');
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
