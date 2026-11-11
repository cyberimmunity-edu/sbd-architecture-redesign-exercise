// Генератор docx-версии ТЗ SecArch Lab по навыку docx (recipe R1, палитра GO-1)
"use strict";

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, WidthType, BorderStyle,
  ShadingType, PageOrientation, SectionType, NumberFormat, TableOfContents,
  PageBreak, TableLayoutType, SimpleField,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { cover, sections: CONTENT } = require("./tz_content.js");

// ---------- Палитра GO-1 (Graphite Orange — proposals/PRD) ----------
const PAL = {
  bg: "1A2330", accent: "D4875A",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A", innerLine: "DDD0C8", surface: "F8F0EB" },
  headingInk: "1A2330", body: "000000", secondary: "808080",
};

const FONT_BODY = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "Times New Roman" };
const FONT_HEAD = { ascii: "Arial", hAnsi: "Arial", eastAsia: "Arial" };
const FONT_MONO = { ascii: "Courier New", hAnsi: "Courier New", eastAsia: "Courier New" };

const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};
const allNoBorders = {
  ...noBorders,
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};

// ---------- Хелперы обложки (по design-system, кириллица ≈ pt*11 twips/символ) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length <= charsPerLine || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11; // кириллица/латиница ≈ вдвое уже CJK
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---------- Recipe R1: Pure Paragraph Cover (Left-Aligned) ----------
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split("").join("  "),
        size: 18, color: P.accent, font: FONT_HEAD, characterSpacing: 40,
      })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: FONT_HEAD })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800, line: 312 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: FONT_HEAD })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.cover.metaColor, font: FONT_HEAD })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.cover.footerColor, font: FONT_HEAD }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.cover.footerColor, font: FONT_HEAD }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------- Инлайн-разметка: **bold** ----------
function rich(text, base) {
  const runs = [];
  const parts = String(text).split("**");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    runs.push(new TextRun({ text: parts[i], bold: i % 2 === 1 ? true : undefined, ...base }));
  }
  return runs;
}

// ---------- Компоненты тела ----------
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: PAL.headingInk, font: FONT_HEAD })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: PAL.headingInk, font: FONT_HEAD })],
  });
}
function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 709 },
    spacing: { line: 312, after: 80 },
    children: rich(text, { size: 24, color: PAL.body, font: FONT_BODY }),
  });
}
function note(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 400 },
    spacing: { line: 312, before: 60, after: 120 },
    children: rich(text, { size: 20, color: PAL.secondary, italics: true, font: FONT_BODY }),
  });
}
function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 60 },
    children: rich(text, { size: 24, color: PAL.body, font: FONT_BODY }),
  });
}
function numbered(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 60 },
    children: rich(text, { size: 24, color: PAL.body, font: FONT_BODY }),
  });
}
function plainListItem(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 400, hanging: 0 },
    spacing: { line: 312, after: 60 },
    children: rich(text, { size: 24, color: PAL.body, font: FONT_BODY }),
  });
}
function formula(runs) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120, line: 312 },
    children: runs.map(r => new TextRun({
      text: r.t, italics: !r.sub, subScript: r.sub ? true : undefined,
      size: 24, color: PAL.body, font: FONT_BODY,
    })),
  });
}
function codeBlock(lines) {
  return lines.map((line, idx) => new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 360 },
    spacing: { line: 276, before: idx === 0 ? 120 : 0, after: idx === lines.length - 1 ? 160 : 0 },
    shading: { type: ShadingType.CLEAR, fill: PAL.table.surface },
    children: [new TextRun({ text: line === "" ? " " : line, size: 18, color: "333333", font: FONT_MONO })],
  }));
}
function table(spec) {
  const { widths, header, rows } = spec;
  const mkCell = (text, w, isHeader) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: PAL.table.headerBg } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: 276 },
      children: rich(text, {
        size: isHeader ? 21 : 20,
        bold: isHeader ? true : undefined,
        color: isHeader ? PAL.table.headerText : PAL.body,
        font: isHeader ? FONT_HEAD : FONT_BODY,
      }),
    })],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: header.map((t, i) => mkCell(t, widths[i], true)),
      }),
      ...rows.map(r => new TableRow({
        cantSplit: true,
        children: r.map((t, i) => mkCell(t, widths[i], false)),
      })),
    ],
  });
}

// ---------- Сборка тела ----------
function buildBody() {
  const out = [];
  for (const s of CONTENT) {
    switch (s.type) {
      case "h1": out.push(h1(s.text)); break;
      case "h2": out.push(h2(s.text)); break;
      case "p": out.push(body(s.text)); break;
      case "note": out.push(note(s.text)); break;
      case "bullets": s.items.forEach(it => out.push(bullet(it))); break;
      case "steps":
        if (s.ref === "assump") s.items.forEach(it => out.push(plainListItem(it)));
        else s.items.forEach(it => out.push(numbered(it, s.ref)));
        break;
      case "formula": out.push(formula(s.runs)); break;
      case "code": codeBlock(s.lines).forEach(p => out.push(p)); break;
      case "table":
        out.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: " ", size: 2 })] }));
        out.push(table(s));
        out.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: " ", size: 2 })] }));
        break;
      default: throw new Error("Unknown block type: " + s.type);
    }
  }
  return out;
}

// ---------- Колонтитулы ----------
function pageFooter(fmt) {
  const instr = fmt === "roman" ? "PAGE \\* ROMAN \\* MERGEFORMAT" : "PAGE \\* arabic \\* MERGEFORMAT";
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new SimpleField(instr, fmt === "roman" ? "I" : "1")].map(f => f),
    })],
  });
}
function bodyHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine, space: 4 } },
      children: [new TextRun({ text: "SecArch Lab · Техническое задание · v1.0", size: 18, color: PAL.secondary, font: FONT_HEAD })],
    })],
  });
}

// ---------- Документ ----------
const pgSize = { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const frontMatter = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Содержание", bold: true, size: 32, color: PAL.headingInk, font: FONT_HEAD })],
  }),
  new TableOfContents("Содержание", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Примечание: оглавление сформировано полями Word. После редактирования документа щёлкните по оглавлению правой кнопкой мыши и выберите «Обновить поле», чтобы обновить номера страниц.",
      italics: true, size: 18, color: "888888", font: FONT_BODY,
    })],
  }),
];

const doc = new Document({
  creator: "SecArch Lab",
  title: "Техническое задание — SecArch Lab v1.0",
  styles: {
    default: {
      document: {
        run: { font: FONT_BODY, size: 24, color: PAL.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT_HEAD, size: 32, bold: true, color: PAL.headingInk },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FONT_HEAD, size: 28, bold: true, color: PAL.headingInk },
        paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  numbering: {
    config: [
      { reference: "inv", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "decomp", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    { // Секция 1: обложка — без номеров страниц
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({ ...cover, palette: PAL }),
    },
    { // Секция 2: содержание — римские номера
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter("roman") },
      children: frontMatter,
    },
    { // Секция 3: тело — арабские с 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader() },
      footers: { default: pageFooter("arabic") },
      children: buildBody(),
    },
  ],
});

const OUT = path.resolve("/home/z/my-project/download/TZ_SecArch_Lab_v1.0.docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("OK:", OUT, buf.length, "bytes");
}).catch(e => { console.error("FAIL:", e); process.exit(1); });
