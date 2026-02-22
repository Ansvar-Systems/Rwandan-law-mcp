/**
 * Rwanda legislation parser utilities.
 *
 * Supports:
 * - law catalog extraction from RwandaLII search HTML snippets
 * - metadata extraction from law detail pages
 * - provision parsing from AKN HTML pages
 * - provision parsing from PDF-extracted text
 */

export type LawSourceType = 'akn' | 'pdf';

export interface CatalogLaw {
  href: string;
  title: string;
  citation: string;
}

export interface LawPageMetadata {
  id: string;
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  source_type: LawSourceType;
  work_frbr_uri?: string;
  pdf_url?: string;
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

const CORE_WORK_ID_MAP = new Map<string, string>([
  ['/akn/rw/act/law/2021/58', 'rw-personal-data-protection-2021'],
  ['/akn/rw/act/law/2018/60', 'rw-cybercrimes-2018'],
  ['/akn/rw/act/law/2017/26', 'rw-national-cyber-security-authority-2017'],
  ['/akn/rw/act/law/2017/2', 'rw-risa-establishment-2017'],
  ['/akn/rw/act/law/2013/9', 'rw-rura-establishment-2013'],
  ['/akn/rw/act/law/2021/61', 'rw-payment-system-2021'],
  ['/akn/rw/act/law/2018/73', 'rw-credit-reporting-system-2018'],
  ['/akn/rw/act/law/2019/74', 'rw-financial-intelligence-centre-2019'],
  ['/akn/rw/act/law/2021/22', 'rw-space-agency-2021'],
  ['/akn/rw/act/law/2017/31', 'rw-rica-authority-2017'],
  ['/akn/rw/act/law/2016/24', 'rw-ict-law-2016'],
  ['/akn/rw/act/law/2013/4', 'rw-access-to-information-2013'],
  ['/akn/rw/act/law/2009/31', 'rw-intellectual-property-2009'],
]);

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
  if (parsed !== null) return String(parsed);
  return cleaned;
}

function slugify(input: string): string {
  return normalizeWhitespace(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseHumanDate(input: string): string | null {
  const cleaned = normalizeWhitespace(input).replace(/,$/, '');
  const match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);

  const monthMap: Record<string, number> = {
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
  const month = monthMap[monthName];
  if (!month || day < 1 || day > 31) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractTimelineDate(html: string, eventPattern: RegExp): string | null {
  const cardPattern = /<div class="vertical-timeline__item">[\s\S]*?<h5 class="mb-0">\s*([^<]+?)\s*(?:<span[\s\S]*?)?<\/h5>[\s\S]*?<div class="card-body">([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = cardPattern.exec(html)) !== null) {
    const rawDate = normalizeWhitespace(match[1]);
    const bodyText = stripHtml(match[2]).toLowerCase();
    if (!eventPattern.test(bodyText)) continue;
    const parsed = parseHumanDate(rawDate);
    if (parsed) return parsed;
  }
  return null;
}

function extractDocumentTitle(html: string): string {
  const docTitle = html.match(/<h1 class="doc-title d-flex">[\s\S]*?<span>([\s\S]*?)<\/span>/i);
  if (docTitle) return normalizeWhitespace(stripHtml(docTitle[1]));

  const coverTitle = html.match(/<div class="coverpage">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i);
  if (coverTitle) return normalizeWhitespace(stripHtml(coverTitle[1]));

  const pageTitle = html.match(/<title>\s*([\s\S]*?)\s*(?:–|-)\s*RwandaLII\s*<\/title>/i);
  if (pageTitle) return normalizeWhitespace(stripHtml(pageTitle[1]));

  return '';
}

function extractCitation(html: string): string {
  const citation = html.match(/<h2 class="h5 text-muted">([\s\S]*?)<\/h2>/i);
  return citation ? normalizeWhitespace(stripHtml(citation[1])) : '';
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
  return out.filter(article => {
    if (seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
}

function extractSectionBlockById(html: string, articleId: string): string | null {
  const escId = escapeRegExp(articleId);
  const startTagPattern = new RegExp(
    `<section\\b[^>]*(?:class="[^"]*\\bakn-article\\b[^"]*"[^>]*id="${escId}"|id="${escId}"[^>]*class="[^"]*\\bakn-article\\b[^"]*")[^>]*>`,
    'i',
  );
  const startMatch = startTagPattern.exec(html);
  if (!startMatch || startMatch.index === undefined) return null;

  const start = startMatch.index;
  const tagPattern = /<\/?section\b[^>]*>/gi;
  tagPattern.lastIndex = start;

  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    depth += match[0].startsWith('</section') ? -1 : 1;
    if (depth === 0) return html.slice(start, tagPattern.lastIndex);
  }
  return null;
}

function buildProvisionRef(section: string, fallback: string): string {
  const normalized = section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (normalized.length > 0) return `art${normalized}`;
  return `art-${slugify(fallback)}`;
}

function dedupeProvisions(provisions: ParsedProvision[]): ParsedProvision[] {
  const byRef = new Map<string, ParsedProvision>();
  for (const provision of provisions) {
    const existing = byRef.get(provision.provision_ref);
    if (!existing || provision.content.length > existing.content.length) {
      byRef.set(provision.provision_ref, provision);
    }
  }
  return Array.from(byRef.values());
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

  return definitions.slice(0, 120);
}

function buildParsedAct(
  metadata: LawPageMetadata,
  provisions: ParsedProvision[],
): ParsedAct {
  const deduped = dedupeProvisions(provisions);
  const definitions = extractDefinitions(deduped);

  return {
    id: metadata.id,
    type: 'statute',
    title: metadata.title,
    title_en: metadata.title_en,
    short_name: metadata.short_name,
    status: metadata.status,
    issued_date: metadata.issued_date,
    in_force_date: metadata.in_force_date,
    url: metadata.url,
    provisions: deduped,
    definitions,
  };
}

function extractTrackProperties(html: string): { work_frbr_uri?: string } {
  const raw = extractScriptJson(html, 'track-page-properties');
  if (!raw) return {};
  try {
    const json = JSON.parse(raw) as { work_frbr_uri?: string };
    return json;
  } catch {
    return {};
  }
}

export function parseCatalogResultsHtml(resultsHtml: string): CatalogLaw[] {
  const laws: CatalogLaw[] = [];
  const regex = /<a class="h5 text-primary"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div>\s*<i>\s*([\s\S]*?)\s*<\/i>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(resultsHtml)) !== null) {
    const href = match[1].trim();
    if (!href.startsWith('/akn/rw/act/law/')) continue;
    const title = stripHtml(match[2]);
    const citation = stripHtml(match[3]);
    laws.push({ href, title, citation });
  }

  return laws;
}

export function buildDocumentIdFromHref(hrefOrWorkUri: string): string {
  const source = hrefOrWorkUri.split('/eng@')[0].replace(/\/+$/, '');
  const known = CORE_WORK_ID_MAP.get(source);
  if (known) return known;

  const trimmed = source.replace(/^https?:\/\/[^/]+/, '');
  const work = trimmed.replace(/^\/akn\/rw\/act\/law\//, '');
  const fallback = slugify(work);
  return `rw-law-${fallback}`;
}

export function extractLawPageMetadata(html: string, pageUrl: string): LawPageMetadata {
  const title = extractDocumentTitle(html);
  if (!title) {
    throw new Error('Could not extract law title from page');
  }

  const citation = extractCitation(html) || title;
  const track = extractTrackProperties(html);
  const workUri = track.work_frbr_uri;
  const baseId = buildDocumentIdFromHref(workUri ?? pageUrl);

  const sourceType = (html.match(/data-display-type="([^"]+)"/i)?.[1]?.toLowerCase() === 'pdf')
    ? 'pdf'
    : 'akn';

  const issuedDate =
    extractDateByLabel(html, /Assented to on\s+([^<]+)</i) ??
    extractTimelineDate(html, /\bassented\b/i) ??
    extractTimelineDate(html, /\bpublished in official gazette\b/i) ??
    '1900-01-01';

  const inForceDate =
    extractDateByLabel(html, /Commenced on\s+([^<]+)</i) ??
    extractTimelineDate(html, /\bcommenced\b/i) ??
    extractTimelineDate(html, /\bpublished in official gazette\b/i) ??
    issuedDate;

  const repealed = /\brepealed\b/i.test(html);
  let pdfUrl: string | undefined;
  if (sourceType === 'pdf') {
    const sourceMatch =
      html.match(/href="([^"]+\/source\.pdf)"/i) ??
      html.match(/href="([^"]+\/source)"/i);
    if (sourceMatch) {
      pdfUrl = new URL(sourceMatch[1], pageUrl).toString();
    } else {
      pdfUrl = new URL(`${pageUrl.replace(/\/$/, '')}/source.pdf`, pageUrl).toString();
    }
  }

  return {
    id: baseId,
    title,
    title_en: title,
    short_name: citation,
    status: repealed ? 'repealed' : 'in_force',
    issued_date: issuedDate,
    in_force_date: inForceDate,
    url: pageUrl,
    source_type: sourceType,
    work_frbr_uri: workUri,
    pdf_url: pdfUrl,
  };
}

export function parseAknLawHtml(html: string, metadata: LawPageMetadata): ParsedAct {
  const toc = parseToc(html);
  const articles = flattenArticleNodes(toc);
  if (articles.length === 0) {
    throw new Error('No article entries found in AKN table of contents');
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
      article.id.split('__').find(part => part.startsWith('art_'))?.replace(/^art_/, '') ??
      article.id,
    );

    const contentHtml = sectionBlock
      .replace(/^<section\b[^>]*>/i, '')
      .replace(/<\/section>\s*$/i, '')
      .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
      .trim();
    const content = htmlToPlainText(contentHtml);
    if (content.length < 3) continue;

    const title = normalizeWhitespace(article.title || headingText || `Article ${section}`);
    provisions.push({
      provision_ref: buildProvisionRef(section, article.id),
      chapter: article.chapter ? normalizeWhitespace(article.chapter) : undefined,
      section,
      title,
      content,
    });
  }

  if (provisions.length === 0) {
    throw new Error('No AKN provisions extracted');
  }

  return buildParsedAct(metadata, provisions);
}

function cleanPdfLines(text: string): string[] {
  return text
    .replace(/\u000c/g, '\n')
    .split(/\r?\n/)
    .map(line => normalizeWhitespace(line))
    .filter(line => line.length > 0)
    .filter(line => !/^Official Gazette\b/i.test(line))
    .filter(line => !/^\d+$/.test(line));
}

function findPdfBodyStart(lines: string[]): number {
  let lastLawHeading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^(LAW|ORGANIC LAW)\s+N[°ºO]/i.test(lines[i])) {
      lastLawHeading = i;
    }
  }
  if (lastLawHeading >= 0) return lastLawHeading;

  let lastParliament = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^THE PARLIAMENT\b/i.test(lines[i]) || /^We,\s+/i.test(lines[i])) {
      lastParliament = i;
    }
  }
  return Math.max(lastParliament, 0);
}

export function parsePdfExtractedText(pdfText: string, metadata: LawPageMetadata): ParsedAct {
  const rawLines = cleanPdfLines(pdfText);
  if (rawLines.length === 0) {
    throw new Error('No text extracted from PDF');
  }

  const startIndex = findPdfBodyStart(rawLines);
  const lines = rawLines.slice(startIndex);

  const provisions: ParsedProvision[] = [];

  const parseWithHeadingRegex = (headingRegex: RegExp): ParsedProvision[] => {
    const parsed: ParsedProvision[] = [];
    let currentChapter: string | undefined;
    let currentSection: string | undefined;
    let currentTitle: string | undefined;
    let currentRef: string | undefined;
    let currentContent: string[] = [];

    const flushCurrent = (): void => {
      if (!currentSection || !currentTitle) return;
      const content = normalizeWhitespace(currentContent.join(' '));
      if (content.length < 3) return;
      parsed.push({
        provision_ref: currentRef ?? buildProvisionRef(currentSection, currentTitle),
        chapter: currentChapter,
        section: currentSection,
        title: currentTitle,
        content,
      });
    };

    for (const line of lines) {
      if (/^CHAPTER\b/i.test(line)) {
        currentChapter = line;
        continue;
      }
      if (/^Section\b/i.test(line)) {
        if (currentChapter) currentChapter = `${currentChapter} | ${line}`;
        continue;
      }

      const headingMatch = line.match(headingRegex);
      if (headingMatch) {
        flushCurrent();
        const rawSection = normalizeArticleNumber(headingMatch[1]);
        let headingRest = normalizeWhitespace(headingMatch[2] ?? '');
        headingRest = headingRest.replace(/\s+Article$/i, '').trim();
        currentSection = rawSection;
        currentTitle = headingRest
          ? `Article ${rawSection} - ${headingRest}`
          : `Article ${rawSection}`;
        currentRef = buildProvisionRef(rawSection, currentTitle);
        currentContent = [];
        continue;
      }

      if (!currentSection) continue;
      if (/^(CHAPTER|PART|Section)\b/i.test(line)) continue;
      currentContent.push(line);
    }

    flushCurrent();
    return parsed;
  };

  const primary = parseWithHeadingRegex(
    /^Article\s+([0-9]+[A-Za-z]*|[A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:[:.-]|–|-)?\s*(.*)$/i
  );
  provisions.push(...primary);

  if (provisions.length === 0) {
    const fallback = parseWithHeadingRegex(
      /^(?!N°|LAW\b|LOI\b|THE\b|LE\b)([0-9]+[A-Za-z]*|[A-Za-z]+)\s*:\s*(.+)$/i
    );
    provisions.push(...fallback);
  }

  if (provisions.length === 0) {
    throw new Error('No article headings parsed from PDF text');
  }

  return buildParsedAct(metadata, provisions);
}
