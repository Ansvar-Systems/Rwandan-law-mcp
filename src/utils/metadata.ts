/**
 * Response metadata utilities for Rwandan Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'RwandaLII legislation portal (rwandalii.org) with Official Gazette publication links',
    jurisdiction: 'RW',
    disclaimer:
      'This database is built from publicly available RwandaLII law pages and links to Official Gazette publications. ' +
      'For legal certainty, verify against the Official Gazette publication.',
    freshness,
  };
}
