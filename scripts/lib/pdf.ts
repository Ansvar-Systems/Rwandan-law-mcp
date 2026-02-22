import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface PdfTextExtractionResult {
  text: string;
  method: 'plain' | 'bbox_center';
  warnings: string[];
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function safeRun(command: string, args: string[]): void {
  execFileSync(command, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: process.env,
  });
}

function extractPlainText(pdfPath: string, outputPath: string): string {
  safeRun('pdftotext', ['-enc', 'UTF-8', pdfPath, outputPath]);
  return fs.readFileSync(outputPath, 'utf-8');
}

function extractCenterColumnFromBbox(pdfPath: string, outputPath: string): string {
  safeRun('pdftotext', ['-bbox-layout', '-enc', 'UTF-8', pdfPath, outputPath]);
  const xml = fs.readFileSync(outputPath, 'utf-8');

  const pageRegex = /<page\s+width="([0-9.]+)"\s+height="([0-9.]+)">([\s\S]*?)<\/page>/g;
  const linesOut: string[] = [];

  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const pageWidth = Number.parseFloat(pageMatch[1]);
    const pageBody = pageMatch[3];
    const xMin = pageWidth * 0.36;
    const xMax = pageWidth * 0.62;

    const lineRegex = /<line\b[^>]*>([\s\S]*?)<\/line>/g;
    let lineMatch: RegExpExecArray | null;

    while ((lineMatch = lineRegex.exec(pageBody)) !== null) {
      const wordRegex = /<word\s+[^>]*xMin="([0-9.]+)"[^>]*>([\s\S]*?)<\/word>/g;
      const words: string[] = [];
      let wordMatch: RegExpExecArray | null;
      while ((wordMatch = wordRegex.exec(lineMatch[1])) !== null) {
        const x = Number.parseFloat(wordMatch[1]);
        if (x < xMin || x > xMax) continue;
        words.push(decodeHtmlEntities(wordMatch[2]));
      }

      if (words.length === 0) continue;
      const line = words.join(' ').replace(/\s+/g, ' ').trim();
      if (!line) continue;
      if (/^Official Gazette\b/i.test(line)) continue;
      if (/^\d+$/.test(line)) continue;
      linesOut.push(line);
    }

    linesOut.push('');
  }

  return normalizeWhitespace(linesOut.join('\n'));
}

function countArticleHeadings(text: string): number {
  const matches = text.match(/^Article\s+[A-Za-z0-9]+/gim);
  return matches ? matches.length : 0;
}

function isLikelyTrilingual(text: string): boolean {
  return /Ingingo\b|ISHAKIRO|TABLE DES MATIERES|Sommaire|Loi\b/i.test(text);
}

export function extractTextFromPdf(pdfPath: string): PdfTextExtractionResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-law-pdf-'));
  const plainPath = path.join(tmpDir, 'plain.txt');
  const bboxPath = path.join(tmpDir, 'bbox.html');
  const warnings: string[] = [];

  try {
    const plainRaw = extractPlainText(pdfPath, plainPath);
    const plainText = normalizeWhitespace(plainRaw);
    let chosenText = plainText;
    let method: PdfTextExtractionResult['method'] = 'plain';

    if (isLikelyTrilingual(plainText)) {
      try {
        const centerText = extractCenterColumnFromBbox(pdfPath, bboxPath);
        const plainArticleCount = countArticleHeadings(plainText);
        const centerArticleCount = countArticleHeadings(centerText);

        if (
          centerText.length > 0 &&
          (centerArticleCount >= Math.max(3, Math.floor(plainArticleCount * 0.3)) ||
            centerText.length > plainText.length * 0.35)
        ) {
          chosenText = centerText;
          method = 'bbox_center';
        }
      } catch (error) {
        warnings.push(
          `bbox extraction failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (chosenText.length < 1200) {
      warnings.push('very low extracted text volume; PDF may be image-only or heavily degraded');
    }

    return {
      text: chosenText,
      method,
      warnings,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore temporary cleanup failures
    }
  }
}
