# Rwandan Law MCP Server

**The Rwanda Law Reform Commission alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Frwandan-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/rwandan-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Rwandan-law-mcp?style=social)](https://github.com/Ansvar-Systems/Rwandan-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Rwandan-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Rwandan-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Rwandan-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Rwandan-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/INTEGRATION_GUIDE.md)

Query Rwandan legislation -- from the Data Protection Law and Penal Code to the Cybercrime Law, Investment Code, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Rwandan legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Rwandan legal research is scattered across the Rwanda Law Reform Commission portal, the Rwanda Development Board, and Official Gazette publications. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking Rwanda's Data Protection Law requirements
- A **legal tech developer** building tools on Rwandan law
- A **researcher** tracing East African Community harmonization across Rwandan statutes

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Rwandan law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://rwandan-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add rwandan-law --transport http https://rwandan-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rwandan-law": {
      "type": "url",
      "url": "https://rwandan-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "rwandan-law": {
      "type": "http",
      "url": "https://rwandan-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/rwandan-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rwandan-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/rwandan-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "rwandan-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/rwandan-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally (Rwanda uses English, French, and Kinyarwanda):

- *"What does the Data Protection Law say about consent?"*
- *"Find provisions in the Penal Code about fraud"*
- *"Is the Cybercrime Law still in force?"*
- *"What are the investment requirements under the Investment Code?"*
- *"Find provisions about personal data processing in Rwandan law"*
- *"What EAC conventions has Rwanda implemented?"*
- *"Validate the citation 'Law No. 058/2021 of 13/10/2021 on Data Protection and Privacy'"*
- *"Search for provisions on electronic transactions"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | Ingestion in progress | Laws sourced from Rwanda Law Reform Commission and Official Gazette |
| **Provisions** | Ingestion in progress | Full-text searchable with FTS5 |
| **Languages** | English / French / Kinyarwanda | Rwanda's three official languages |
| **Daily Updates** | Automated | Freshness checks against official sources |

> **Coverage note:** The Rwandan law database is actively being built. The MCP server infrastructure is production-ready. Provision counts will be updated as ingestion completes. The remote endpoint is live and returns available data.

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from official Rwandan legal sources (Rwanda Law Reform Commission, Official Gazette)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law number and article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
RLRC / Official Gazette --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                              ^                        ^
                       Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search RLRC portal by law number | Search by plain English: *"data protection consent"* |
| Navigate multi-article laws manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this law still in force?" -- check manually | `check_currency` tool -- answer in seconds |
| Find AU/EAC alignment -- dig through treaty texts | `get_eu_basis` -- linked international instruments |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** Search RLRC --> Download PDF --> Ctrl+F --> Cross-reference with Official Gazette --> Repeat

**This MCP:** *"What does Rwanda's Data Protection Law require for cross-border data transfers?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by law number and article |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes for a legal topic |
| `format_citation` | Format citations per Rwandan conventions (full/short/pinpoint) |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `list_sources` | List all available statutes with metadata and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international instruments that Rwandan laws align with |
| `get_rwandan_implementations` | Find Rwandan laws implementing a specific international instrument |
| `search_eu_implementations` | Search international documents with Rwandan implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific Rwandan provision |
| `validate_eu_compliance` | Check alignment status of Rwandan laws against international standards |

---

## International Law Alignment

Rwanda is a member of the **East African Community (EAC)** and the **African Union (AU)**, implementing regional harmonization frameworks across its national legislation.

| Framework | Relevance |
|-----------|-----------|
| **EAC Harmonization** | Rwanda participates in EAC legal harmonization -- common market rules, customs union, and sector-specific protocols |
| **AU Data Governance** | Rwanda's Data Protection Law aligns with the AU Convention on Cyber Security and Personal Data Protection (Malabo Convention) |
| **COMESA** | Rwanda is a COMESA member -- regional trade and investment frameworks |
| **Commonwealth** | Rwanda joined the Commonwealth in 2009 -- access to Commonwealth legal resources and frameworks |

The international bridge tools let you explore alignment between Rwandan legislation and regional/international frameworks, helping with cross-border compliance research.

> **Note:** International cross-references reflect alignment and implementation relationships. Rwanda's legal system is primarily civil law with common law influence since 2009.

---

## Data Sources & Freshness

All content is sourced from authoritative Rwandan legal databases:

- **[Rwanda Law Reform Commission](https://rlrc.gov.rw/)** -- Official law reform and legal database
- **[Official Gazette of Rwanda](https://www.judiciary.gov.rw/)** -- Primary source of enacted laws
- **[Rwanda Development Board](https://rdb.rw/)** -- Investment and commercial law

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Rwanda Law Reform Commission / Official Gazette |
| **Languages** | English, French, Kinyarwanda |
| **Coverage** | National laws from Official Gazette |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors official Rwandan legal sources:

| Check | Method |
|-------|--------|
| **Law amendments** | Drift detection against known provision anchors |
| **New laws** | Comparison against official source index |
| **Repealed laws** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official Rwandan legal publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources (Official Gazette) for court filings
> - **Multilingual system** -- Laws exist in English, French, and Kinyarwanda; verify the authoritative language version against official sources
> - **International cross-references** reflect alignment relationships, not binding obligations

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

> For guidance from your bar association: **Kigali Bar Association (KBA)** / **Rwanda Bar Association**

---

## Documentation

- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** -- Detailed integration documentation
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Rwandan-law-mcp
cd Rwandan-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Ingest statutes from official sources
npm run build:db                  # Rebuild SQLite database
npm run drift:detect              # Run drift detection against anchors
npm run check-updates             # Check for amendments and new laws
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** Optimized SQLite (efficient, portable)
- **Reliability:** Production-ready ingestion pipeline

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/rwandan-law-mcp (This Project)
**Query Rwandan legislation directly from Claude** -- Data Protection Law, Penal Code, Cybercrime Law, Investment Code, and more. `npx @ansvar/rwandan-law-mcp`

### [@ansvar/kenyan-law-mcp](https://github.com/Ansvar-Systems/Kenyan-law-mcp)
**Query Kenyan legislation** -- Data Protection Act, Penal Code, and more. `npx @ansvar/kenyan-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)
**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

**70+ national law MCPs** covering Africa, the Americas, Europe, Asia, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Kinyarwanda provision text ingestion
- Court decisions from the Supreme Court of Rwanda
- EAC harmonization cross-references
- Historical law amendments tracking

---

## Roadmap

- [x] MCP server infrastructure (production-ready)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Full statute corpus ingestion
- [ ] Kinyarwanda language provisions
- [ ] Court case law (Supreme Court of Rwanda)
- [ ] Historical statute versions (amendment tracking)
- [ ] EAC harmonization cross-references

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{rwandan_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Rwandan Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Rwandan-law-mcp},
  note = {Rwandan legislation sourced from Rwanda Law Reform Commission and Official Gazette}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes:** Republic of Rwanda (Official Gazette -- public domain)
- **International Metadata:** Public domain treaty databases

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server brings Rwanda's official legislation into any AI client -- no browser tabs, no PDFs, no manual cross-referencing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
