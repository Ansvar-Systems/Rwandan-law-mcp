/**
 * Golden contract tests for Rwandan Law MCP.
 *
 * These tests require the SQLite database to exist locally.
 * In CI (where *.db is excluded), the describe blocks are
 * automatically skipped via `describe.skipIf(!DB_EXISTS)`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

const DB_EXISTS = fs.existsSync(DB_PATH);

let db: InstanceType<typeof Database>;

describe.skipIf(!DB_EXISTS)('Database integrity', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = DELETE');
  });

  it('has substantial law coverage', () => {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM legal_documents'
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(50);
  });

  it('has substantial provision coverage', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(1000);
  });

  it('has FTS index data', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'data'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!DB_EXISTS)('Provision retrieval', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = DELETE');
  });

  it('retrieves core personal-data law article', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'rw-personal-data-protection-2021' AND section = '1'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content.length).toBeGreaterThan(50);
  });

  it('retrieves a PDF-derived law article', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'rw-law-2018-68' AND section = '1'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content.length).toBeGreaterThan(50);
  });
});

describe.skipIf(!DB_EXISTS)('Negative tests', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = DELETE');
  });

  it('returns no rows for fictional law', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-law-2099'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('returns no rows for invalid section', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'rw-personal-data-protection-2021' AND section = '999ZZZ-INVALID'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe.skipIf(!DB_EXISTS)('Metadata', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = DELETE');
  });

  it('has db_metadata entries', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM db_metadata').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});
