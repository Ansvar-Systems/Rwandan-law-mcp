/**
 * Parser for RwandaLII legislation pages.
 *
 * Extracts:
 * - law metadata (title, law number, dates, URL)
 * - provisions (article-level text)
 * - definitions (from definition articles when present)
 */

export interface ActTarget {
  id: string;
  seedFile: string;
  url: string;
  shortName?: string;
  status?: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  description?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

interface TocNode {
  id: string | null;
  num: string | null;
  type: string;
  title: string | null;
  heading: string | null;
  children: TocNode[];
}

interface FlatArticle {
  id: string;
  num: string | null;
  title: string;
  chapter?: string;
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(input: string): string {
  let text = input;

  const replacements: Array<[RegExp, string]> = [
    [/&nbsp;/g, ' '],
    [/&amp;/g, '&'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
    [/&quot;/g, '"'],
    [/&#39;/g, "'"],
    [/&apos;/g, "'"],
    [/&ndash;/g, '-'],
    [/&mdash;/g, '-'],
    [/&hellip;/g, '...'],
  ];

  for (const [pattern, value] of replacements) {
    text = text.replace(pattern, value);
  }

  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
  text = text.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  return text;
}

function normalizeWhitespace(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([’'])\s*/g, '$1')
    .replace(/(\d)\s+°/g, '$1°')
    .trim();
}

function stripHtml(input: string): string {
  return normalizeWhitespace(input.replace(/<[^>]+>/g, ' '));
}

function htmlToPlainText(input: string): string {
  let text = input;
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|ul|ol|h\d)>/gi, '\n');
  text = text.replace(/<span[^>]*class="[^"]*\bakn-num\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1 ');
  text = text.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(text);
}

function extractScriptJson(html: string, scriptId: string): string | null {
  const pattern = new RegExp(
    `<script[^>]*id="${escapeRegExp(scriptId)}"[^>]*>([\\s\\S]*?)<\\/script>`,
    'i',
  );
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function parseWordNumber(token: string): number | null {
  const parts = token
    .toLowerCase()
    .replace(/[^a-z -]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

  if (parts.length === 0) return null;

  let total = 0;
  let current = 0;
  for (const part of parts) {
    if (part === 'hundred') {
      current = current === 0 ? 100 : current * 100;
      continue;
    }
    const value = WORD_NUMBERS[part];
    if (value === undefined) return null;
    current += value;
  }
  total += current;
  return total > 0 ? total : null;
}

function normalizeArticleNumber(raw: string): string {
  const cleaned = normalizeWhitespace(raw).replace(/\.$/, '');
  if (/^\d+[a-zA-Z]*$/.test(cleaned)) {
    return cleaned;
  }
  const parsed = parseWordNumber(cleaned);
  if (parsed !== null) {
    return String(parsed);
  }
  return cleaned;
}

function articleNumberFromId(articleId: string): string {
  const segment = articleId.split('__').find(part => part.startsWith('art_')) ?? articleId;
  const value = segment.replace(/^art_/, '');
  return normalizeArticleNumber(value);
}

function buildProvisionRef(section: string, articleId: string): string {
  const normalized = section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (normalized.length > 0) {
    return `art${normalized}`;
  }
  const fallback = articleId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `art-${fallback}`;
}

function extractSectionBlockById(html: string, articleId: string): string | null {
  const escId = escapeRegExp(articleId);
  const startTagPattern = new RegExp(
    `<section\\b[^>]*(?:class="[^"]*\\bakn-article\\b[^"]*"[^>]*id="${escId}"|id="${escId}"[^>]*class="[^"]*\\bakn-article\\b[^"]*")[^>]*>`,
    'i',
  );
  const startMatch = startTagPattern.exec(html);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const start = startMatch.index;
  const tagPattern = /<\/?section\b[^>]*>/gi;
  tagPattern.lastIndex = start;

  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    if (match[0].startsWith('</section')) {
      depth--;
    } else {
      depth++;
    }

    if (depth === 0) {
      return html.slice(start, tagPattern.lastIndex);
    }
  }
  return null;
}

function parseHumanDate(input: string): string | null {
  const cleaned = normalizeWhitespace(input).replace(/,$/, '');
  const m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const monthName = m[2].toLowerCase();
  const year = Number(m[3]);

  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  const month = months[monthName];
  if (!month || day < 1 || day > 31) return null;

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function extractTimelineDate(html: string, eventPattern: RegExp): string | null {
  const cardPattern = /<div class="vertical-timeline__item">[\s\S]*?<h5 class="mb-0">\s*([^<]+?)\s*(?:<span[\s\S]*?)?<\/h5>[\s\S]*?<div class="card-body">([\s\S]*?)<\/div>/gi;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const rawDate = normalizeWhitespace(cardMatch[1]);
    const bodyText = stripHtml(cardMatch[2]).toLowerCase();
    if (!eventPattern.test(bodyText)) continue;
    const parsed = parseHumanDate(rawDate);
    if (parsed) return parsed;
  }
  return null;
}

function extractDocumentTitle(html: string): string {
  const docTitleMatch = html.match(/<h1 class="doc-title d-flex">[\s\S]*?<span>([\s\S]*?)<\/span>/i);
  if (docTitleMatch) return normalizeWhitespace(stripHtml(docTitleMatch[1]));

  const coverTitleMatch = html.match(/<div class="coverpage">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i);
  if (coverTitleMatch) return normalizeWhitespace(stripHtml(coverTitleMatch[1]));

  const pageTitleMatch = html.match(/<title>\s*([\s\S]*?)\s*(?:–|-)\s*RwandaLII\s*<\/title>/i);
  if (pageTitleMatch) return normalizeWhitespace(stripHtml(pageTitleMatch[1]));

  return '';
}

function extractCitation(html: string): string {
  const citationMatch = html.match(/<h2 class="h5 text-muted">([\s\S]*?)<\/h2>/i);
  if (citationMatch) return normalizeWhitespace(stripHtml(citationMatch[1]));
  return '';
}

function extractDateByLabel(html: string, labelPattern: RegExp): string | null {
  const match = html.match(labelPattern);
  if (!match) return null;
  return parseHumanDate(match[1]);
}

function parseToc(html: string): TocNode[] {
  const raw = extractScriptJson(html, 'akn_toc_json');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TocNode[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function flattenArticleNodes(nodes: TocNode[]): FlatArticle[] {
  const out: FlatArticle[] = [];

  function walk(list: TocNode[], chapter?: string): void {
    for (const node of list) {
      const nodeTitle = node.title ? stripHtml(node.title) : '';
      const nextChapter = node.type === 'chapter' && nodeTitle ? nodeTitle : chapter;

      if (node.type === 'article' && node.id) {
        out.push({
          id: node.id,
          num: node.num,
          title: nodeTitle || `Article ${node.num ?? ''}`.trim(),
          chapter: nextChapter,
        });
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children, nextChapter);
      }
    }
  }

  walk(nodes, undefined);

  const seen = new Set<string>();
  return out.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    if (!/(definition|meaning of)/i.test(provision.title)) continue;
    const text = provision.content;
    if (!text) continue;

    const patterns = [
      /["“]([^"”]{2,80})["”]\s+(?:means|refers to)\s+([^.;]{5,500})/gi,
      /(?:^|;)\s*(?:\d+[°.)]?\s*)?([A-Za-z][A-Za-z\s\-()/]{2,80})\s+means\s+([^.;]{5,500})/gi,
      /(?:^|;)\s*(?:\d+[°.)]?\s*)?([A-Za-z][A-Za-z\s\-()/]{2,80})\s*[:\-]\s*([^.;]{5,500})/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const term = normalizeWhitespace(match[1]).replace(/:$/, '');
        const definition = normalizeWhitespace(match[2]);
        if (term.length < 2 || term.length > 80 || definition.length < 5) continue;
        if (/^article\s+\d+/i.test(term)) continue;

        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        definitions.push({
          term,
          definition,
          source_provision: provision.provision_ref,
        });
      }
    }
  }

  return definitions.slice(0, 80);
}

export function parseRwandanLawHtml(html: string, target: ActTarget): ParsedAct {
  const displayType = html.match(/data-display-type="([^"]+)"/i)?.[1]?.toLowerCase() ?? 'unknown';
  if (displayType !== 'akn') {
    throw new Error(`Document is not machine-readable AKN text (data-display-type=${displayType})`);
  }

  const title = extractDocumentTitle(html);
  if (!title) {
    throw new Error('Could not parse document title');
  }

  const citation = extractCitation(html) || target.shortName || target.id;

  const issuedDate =
    extractDateByLabel(html, /Assented to on\s+([^<]+)</i) ??
    extractTimelineDate(html, /\bassented\b/i) ??
    extractTimelineDate(html, /\bpublished in official gazette\b/i) ??
    '';

  const inForceDate =
    extractDateByLabel(html, /Commenced on\s+([^<]+)</i) ??
    extractTimelineDate(html, /\bcommenced\b/i) ??
    extractTimelineDate(html, /\bpublished in official gazette\b/i) ??
    issuedDate;

  const toc = parseToc(html);
  const articles = flattenArticleNodes(toc);
  if (articles.length === 0) {
    throw new Error('No article entries found in TOC');
  }

  const provisions: ParsedProvision[] = [];
  for (const article of articles) {
    const sectionBlock = extractSectionBlockById(html, article.id);
    if (!sectionBlock) continue;

    const headingHtml = sectionBlock.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '';
    const headingText = htmlToPlainText(headingHtml);
    const headingNumberMatch = headingText.match(/\bArticle\s+([A-Za-z0-9-]+)/i);

    const section = normalizeArticleNumber(
      headingNumberMatch?.[1] ??
      article.num ??
      articleNumberFromId(article.id),
    );

    let contentHtml = sectionBlock
      .replace(/^<section\b[^>]*>/i, '')
      .replace(/<\/section>\s*$/i, '')
      .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '');

    contentHtml = contentHtml.trim();
    const content = htmlToPlainText(contentHtml);
    if (content.length < 3) continue;

    const titleText = normalizeWhitespace(article.title || headingText || `Article ${section}`);
    const provisionRef = buildProvisionRef(section, article.id);

    provisions.push({
      provision_ref: provisionRef,
      chapter: article.chapter ? normalizeWhitespace(article.chapter) : undefined,
      section,
      title: titleText,
      content,
    });
  }

  if (provisions.length === 0) {
    throw new Error('No provisions extracted from machine-readable document');
  }

  const byRef = new Map<string, ParsedProvision>();
  for (const provision of provisions) {
    const existing = byRef.get(provision.provision_ref);
    if (!existing || provision.content.length > existing.content.length) {
      byRef.set(provision.provision_ref, provision);
    }
  }
  const dedupedProvisions = Array.from(byRef.values());
  const definitions = extractDefinitions(dedupedProvisions);

  return {
    id: target.id,
    type: 'statute',
    title,
    title_en: title,
    short_name: citation,
    status: target.status ?? 'in_force',
    issued_date: issuedDate || inForceDate || '1900-01-01',
    in_force_date: inForceDate || issuedDate || '1900-01-01',
    url: target.url,
    description: target.description,
    provisions: dedupedProvisions,
    definitions,
  };
}

/**
 * 10 machine-readable Rwanda laws with article-level text on RwandaLII.
 *
 * NOTE:
 * Many high-priority legacy ICT/cyber laws on the same portal are PDF-only
 * (`data-display-type="pdf"`), so they are excluded from automated extraction.
 */
export const TARGET_RWANDAN_LAWS: ActTarget[] = [
  {
    id: 'rw-personal-data-protection-2021',
    seedFile: '01-personal-data-protection-2021.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2021/58/eng@2021-10-15',
    shortName: 'Law 58 of 2021',
    description: 'Provides Rwanda’s legal framework for protection of personal data and privacy, including data subject rights and supervisory authority powers.',
  },
  {
    id: 'rw-cybercrimes-2018',
    seedFile: '02-cybercrimes-2018.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2018/60/eng@2018-09-25',
    shortName: 'Law 60 of 2018',
    description: 'Defines cybercrime offences and penalties, including unlawful access, interference, cyber fraud, and related digital offences.',
  },
  {
    id: 'rw-national-cyber-security-authority-2017',
    seedFile: '03-national-cyber-security-authority-2017.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2017/26/eng@2017-07-03',
    shortName: 'Law 26 of 2017',
    description: 'Establishes the National Cyber Security Authority and sets its mission, organisational structure, and functions.',
  },
  {
    id: 'rw-risa-establishment-2017',
    seedFile: '04-risa-establishment-2017.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2017/2/eng@2017-03-06',
    shortName: 'Law 2 of 2017',
    description: 'Establishes Rwanda Information Society Authority (RISA) and defines national ICT implementation and governance responsibilities.',
  },
  {
    id: 'rw-rura-establishment-2013',
    seedFile: '05-rura-establishment-2013.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2013/9/eng@2013-04-08',
    shortName: 'Law 9 of 2013',
    description: 'Establishes Rwanda Utilities Regulatory Authority (RURA), including mandates relevant to communications and regulated network sectors.',
  },
  {
    id: 'rw-payment-system-2021',
    seedFile: '06-payment-system-2021.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2021/61/eng@2021-11-01',
    shortName: 'Law 61 of 2021',
    description: 'Regulates Rwanda’s payment systems, payment service providers, and associated operational and governance requirements.',
  },
  {
    id: 'rw-credit-reporting-system-2018',
    seedFile: '07-credit-reporting-system-2018.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2018/73/eng@2018-09-10',
    shortName: 'Law 73 of 2018',
    description: 'Governs credit reporting activities, data handling in credit information systems, and supervision of credit reporting service providers.',
  },
  {
    id: 'rw-financial-intelligence-centre-2019',
    seedFile: '08-financial-intelligence-centre-2019.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2019/74/eng@2020-02-17',
    shortName: 'Law 74 of 2019',
    description: 'Establishes the Financial Intelligence Centre, including powers and duties for collection and analysis of financial intelligence information.',
  },
  {
    id: 'rw-space-agency-2021',
    seedFile: '09-space-agency-2021.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2021/22/eng@2021-04-30',
    shortName: 'Law 22 of 2021',
    description: 'Establishes Rwanda Space Agency and its governance framework for space-related national programs and services.',
  },
  {
    id: 'rw-rica-authority-2017',
    seedFile: '10-rica-authority-2017.json',
    url: 'https://rwandalii.org/akn/rw/act/law/2017/31/eng@2017-08-18',
    shortName: 'Law 31 of 2017',
    description: 'Establishes Rwanda Inspectorate, Competition and Consumer Protection Authority (RICA) with enforcement and market oversight functions.',
  },
];
