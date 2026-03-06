# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Rwandan bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Rwandan professional conduct rules (Rwanda Bar Association — RBA) require strict client confidentiality and data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/rwandan-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/rwandan-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://rwandan-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (amategeko), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Rwanda)

### Rwanda Bar Association (RBA)

Advocates in Rwanda are regulated by the **Rwanda Bar Association (RBA)** under the Law Governing the Bar in Rwanda. Key obligations when using AI tools:

#### Duty of Confidentiality (Ibanga ry'akazi)

- All client communications are confidential under RBA professional conduct rules
- Client identity may itself be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of professional confidentiality may result in disciplinary proceedings before the RBA disciplinary committee

### Rwanda Data Protection

Rwanda's **Law No. 058/2021 of 13/10/2021 on the Protection of Personal Data and Privacy** governs the processing of personal data. When using AI tools that process client data:

- You bear responsibility as a data controller for ensuring client personal data is handled lawfully
- AI service providers (Anthropic, Vercel) may be data processors; a data processing agreement may be required
- International data transfers require appropriate safeguards
- The **Rwanda Information Society Authority (RISA)** and the **National Cyber Security Authority (NCSA)** oversee compliance
- Consult the RBA and RISA for current guidance on AI tool use in legal practice

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does Article 258 of Law No. 21/2012 of 14/06/2012 relating to the Civil, Commercial, Labour and Administrative Procedure say?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for corruption under Rwandan criminal law?"
```

- Query pattern may reveal the nature of a matter you are working on
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or consult official sources (Official Gazette, rdb.rw) directly

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Consult official Gazette publications and qualified Rwandan legal counsel

### For Large Firms / Corporate Legal

1. Negotiate Data Processing Agreements with AI service providers before any client data is transmitted
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns
4. Review RISA guidance on AI and data protection

### For Government / Public Sector

1. Use self-hosted deployment, no external APIs
2. Follow Rwanda Government IT security requirements (NCSA guidelines)
3. Air-gapped option available for sensitive matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Rwandan-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **RBA Guidance**: Consult the Rwanda Bar Association for professional conduct guidance
- **RISA / NCSA**: Consult risa.rw and ncsa.rw for data protection and cybersecurity guidance

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0
