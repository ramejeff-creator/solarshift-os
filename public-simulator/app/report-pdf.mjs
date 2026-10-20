import { horizonChartData } from './qualification-horizon.mjs';
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 46;

const WIN_ANSI = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f], ['²', 0xb2], [' ', 0x20]
]);

export function pdfHexText(value) {
  const normalized = String(value ?? '').normalize('NFC');
  const bytes = [];
  for (const character of normalized) {
    const code = character.codePointAt(0);
    if (WIN_ANSI.has(character)) bytes.push(WIN_ANSI.get(character));
    else if (code <= 0xff) bytes.push(code);
    else if (character === '−') bytes.push(0x2d);
    else if (character === '×') bytes.push(0x78);
    else if (/\s/u.test(character)) bytes.push(0x20);
    else {
      const ascii = character.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      if (ascii.length && /^[\x20-\x7e]+$/.test(ascii)) bytes.push(...ascii.split('').map((letter) => letter.charCodeAt(0)));
      else bytes.push(0x3f);
    }
  }
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}>`;
}

function color(red, green, blue) {
  return `${red} ${green} ${blue}`;
}

function wrapText(value, maxCharacters) {
  const words = String(value ?? '').replace(/\s+/gu, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return ['—'];
  const lines = [];
  let line = '';
  for (const originalWord of words) {
    let word = originalWord;
    while (word.length > maxCharacters) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, maxCharacters));
      word = word.slice(maxCharacters);
    }
    if (!word) continue;
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function makePageRenderer(pages, documentLabel = 'RAPPORT DÉCISIONNEL · DOCUMENT DE TRAVAIL') {
  let commands = [];
  let cursor = 0;

  const drawText = (text, x, top, size = 10, bold = false, ink = color(0.09, 0.25, 0.2)) => {
    const baseline = PAGE_HEIGHT - top - size;
    commands.push(`${ink} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm ${pdfHexText(text)} Tj ET`);
  };
  const drawRect = (x, top, width, height, fill, stroke = null) => {
    const y = PAGE_HEIGHT - top - height;
    if (stroke) commands.push(`${fill} rg ${stroke} RG 0.7 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re B`);
    else commands.push(`${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  };
  const addPage = () => {
    if (commands.length) pages.push(commands.join('\n'));
    commands = [];
    cursor = PAGE_MARGIN + 88;
    drawRect(0, 0, PAGE_WIDTH, 70, color(0.04, 0.19, 0.17));
    drawText('OZENO · SOLARSHIFT OS', PAGE_MARGIN, 23, 10, true, color(1, 1, 1));
    drawText(String(documentLabel).slice(0, 90), PAGE_MARGIN, 43, 8, false, color(0.72, 0.86, 0.79));
  };
  const ensureSpace = (height) => {
    if (cursor + height > PAGE_HEIGHT - PAGE_MARGIN - 18) addPage();
  };
  const drawSectionHeading = (title) => {
    ensureSpace(32);
    drawText(title, PAGE_MARGIN, cursor, 13, true, color(0.04, 0.25, 0.18));
    cursor += 23;
  };
  const drawParagraph = (text) => {
    const lines = wrapText(text, 91);
    ensureSpace(lines.length * 14 + 5);
    for (const line of lines) {
      if (cursor + 16 > PAGE_HEIGHT - PAGE_MARGIN - 18) addPage();
      drawText(line, PAGE_MARGIN, cursor, 9.5, false, color(0.2, 0.32, 0.28));
      cursor += 14;
    }
    cursor += 4;
  };
  const drawHorizon = (horizon) => {
    const data = horizonChartData(horizon, PAGE_WIDTH - PAGE_MARGIN * 2, 190);
    if (!data) return;
    ensureSpace(data.height + 12);
    const top = cursor;
    for (const tick of data.yTicks) {
      const y = PAGE_HEIGHT - top - tick.position;
      commands.push(`0.85 0.89 0.87 RG 0.5 w ${PAGE_MARGIN + data.left} ${y} m ${PAGE_MARGIN + data.right} ${y} l S`);
      drawText(tick.label, PAGE_MARGIN, top + tick.position - 5, 8);
    }
    for (const tick of data.xTicks) drawText(tick.label, PAGE_MARGIN + tick.position - 3, top + data.bottom + 10, 8);
    for (const line of data.curves) {
      const ink = [1, 3, 5].map(i => parseInt(line.color.slice(i, i + 2), 16) / 255).join(' ');
      commands.push(`${ink} RG 1.5 w ${line.key === 'december' ? '[5 3]' : '[]'} 0 d`);
      commands.push(line.points.map(([x, y], i) => `${(PAGE_MARGIN + x).toFixed(2)} ${(PAGE_HEIGHT - top - y).toFixed(2)} ${i ? 'l' : 'm'}`).join(' ') + ' S');
    }
    commands.push('[] 0 d'); cursor += data.height + 6;
    drawParagraph('Relief : gris-vert. Soleil le 21 décembre : bleu pointillé. Soleil le 21 juin : ocre. Axe horizontal : N, E, S, O, N ; axe vertical : hauteur en degrés.');
  };

  addPage();
  return {
    drawText,
    drawRect,
    drawSectionHeading,
    drawParagraph,
    drawHorizon,
    ensureSpace,
    cursor: () => cursor,
    setCursor: (value) => { cursor = value; },
    finish: () => { if (commands.length) pages.push(commands.join('\n')); }
  };
}

/** Build a dependency-free, downloadable PDF from the current decision-report data. */
export function buildReportPdf(report = {}) {
  const pages = [];
  const page = makePageRenderer(pages, report.documentLabel);
  const titleLines = wrapText(report.title || 'Rapport décisionnel', 58);
  let y = 94;
  titleLines.forEach((line, index) => page.drawText(line, PAGE_MARGIN, y + index * 23, 18, true, color(0.04, 0.19, 0.17)));
  y += titleLines.length * 23 + 4;
  const metaLines = wrapText(report.meta || 'Projet · date à préciser', 92);
  metaLines.forEach((line, index) => page.drawText(line, PAGE_MARGIN, y + index * 14, 9.5, false, color(0.31, 0.43, 0.38)));
  y += metaLines.length * 14 + 12;
  page.drawRect(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN * 2, 1, color(0.81, 0.88, 0.84));
  y += 15;
  page.setCursor(y);

  const metrics = Array.isArray(report.metrics) ? report.metrics.filter((item) => item && (item.label || item.value)) : [];
  if (metrics.length) {
    page.drawSectionHeading('Indicateurs du projet');
    const gap = 10;
    const width = (PAGE_WIDTH - PAGE_MARGIN * 2 - gap) / 2;
    for (let index = 0; index < metrics.length; index += 2) {
      const row = metrics.slice(index, index + 2).map((item) => ({
        label: wrapText(item.label || 'Indicateur', 42),
        value: wrapText(item.value || 'À renseigner', 43)
      }));
      const height = Math.max(60, ...row.map((item) => 22 + item.label.length * 11 + item.value.length * 14));
      page.ensureSpace(height + 9);
      const top = page.cursor();
      row.forEach((item, cellIndex) => {
        const x = PAGE_MARGIN + cellIndex * (width + gap);
        page.drawRect(x, top, width, height, color(0.96, 0.98, 0.96), color(0.81, 0.88, 0.84));
        item.label.forEach((line, lineIndex) => page.drawText(line, x + 11, top + 10 + lineIndex * 11, 8.5, false, color(0.31, 0.43, 0.38)));
        const valueTop = top + 14 + item.label.length * 11;
        item.value.forEach((line, lineIndex) => page.drawText(line, x + 11, valueTop + lineIndex * 14, 10.5, true, color(0.04, 0.25, 0.18)));
      });
      page.setCursor(top + height + 9);
    }
  }

  for (const section of Array.isArray(report.sections) ? report.sections : []) {
    if (!section || !String(section.title || section.text || '').trim()) continue;
    const paragraphs = String(section.text || '').split(/\n+/u).filter(Boolean);
    const textHeight = paragraphs.reduce((height, text) => height + wrapText(text, 91).length * 14 + 4, 0);
    // Keep compact sections together, including the observations and their limitations.
    page.ensureSpace(section.horizon?.state === 'AVAILABLE' ? 250 : Math.max(54, Math.min(300, textHeight + 28)));
    if (section.title) page.drawSectionHeading(section.title);
    if (section.horizon) page.drawHorizon(section.horizon);
    if (section.text) String(section.text).split(/\n+/u).filter(Boolean).forEach((paragraph) => page.drawParagraph(paragraph));
  }

  page.finish();
  const pageObjectIds = [];
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  for (const [index, content] of pages.entries()) {
    const stream = `${content}\n0.32 0.42 0.37 rg BT /F1 8 Tf 1 0 0 1 ${PAGE_WIDTH - PAGE_MARGIN - 45} 24 Tm ${pdfHexText(`${index + 1} / ${pages.length}`)} Tj ET`;
    const contentId = objects.length;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(output);
}

export function downloadReportPdf(report, { filename = 'rapport-decisionnel.pdf' } = {}) {
  const safeFilename = String(filename).replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'rapport-decisionnel.pdf';
  const blob = new Blob([buildReportPdf(report)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename.toLowerCase().endsWith('.pdf') ? safeFilename : `${safeFilename}.pdf`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return link.download;
}
