# Rwandan Law MCP

Rwandan law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add rwandan-law --transport http https://rwandan-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/rwandan-law-mcp
```

## Data Sources

Real legislation ingested from RwandaLII law catalog:
- `data-display-type=akn`: direct article extraction from AKN HTML
- `data-display-type=pdf`: PDF text extraction (including multilingual gazette PDFs) and article parsing

## License

Apache-2.0
