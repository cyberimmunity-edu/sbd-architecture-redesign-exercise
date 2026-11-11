/* Генератор docx для ТЗ «Конструктор СКИБ».
 * Разбирает download/ТЗ_Конструктор_СКИБ.md (строгий грамматический набор)
 * и строит документ: обложка R4 (GO-1) + СОДЕРЖАНИЕ (римская нумерация)
 * + основная часть (арабская нумерация с 1). Правила: docx skill R4. */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType, SectionType,
  TableOfContents,
} = require("docx");
const fs = require("fs");
const path = require("path");

const SRC = "/home/z/my-project/download/ТЗ_Конструктор_СКИБ.md";
const OUT = "/home/z/my-project/download/ТЗ_Конструктор_СКИБ.docx";

/* ── Палитра GO-1 (Graphite Orange — proposal/PRD) ── */
const P = {
  bg: "1A2330", accent: "D4875A",
  titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "707070",
  footerColor: "909090",
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A",
           innerLine: "DDD0C8", surface: "F8F0EB" },
  headingColor: "1A2330", body: "000000", codeBg: "F4F5F7",
};

const NB = { style: BorderStyle.NONE, size: 0, color: "auto" };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB,
                       insideHorizontal: NB, insideVertical: NB };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const emptyPara = () => new Paragraph({ children: [] });
const FONT = "Times New Roman";
const MONO = "Consolas";

/* ── Оценка ширины текста (кириллица/латиница/CJK) в twips ── */
function estimateTextWidth(text, pt) {
  let w = 0;
  for (const ch of text) {
    const em = pt * 20;
    if (/[\u4e00-\u9fff]/.test(ch)) w += em;
    else if (/[A-ZА-ЯЁ0-9]/.test(ch)) w += em * 0.7;
    else if (/[ \t]/.test(ch)) w += em * 0.3;
    else w += em * 0.52;
  }
  return w;
}

/* Разбиение заголовка по словам, без сирот; ≤ 3 строк */
function splitTitleLines(title, maxWidthTwips, pt) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const cand = cur ? cur + " " + word : word;
    if (estimateTextWidth(cand, pt) <= maxWidthTwips || !cur) cur = cand;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    lines = splitTitleLines(title, maxWidthTwips, titlePt);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, maxWidthTwips, minPt);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

/* ── Обложка: рецепт R4 (Top Color Block) ── */
function buildCoverR4(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 26);
  const titleSize = titlePt * 2;

  const titleBlockHeight = titleLines.length * (titlePt * 23 + 200);
  const englishLabelH = config.englishLabel ? (9 * 23 + 500) : 0;
  const subtitleH = config.subtitle ? (12 * 23 + 200) : 0;
  const upperContentH = englishLabelH + titleBlockHeight + subtitleH;
  const UPPER_MIN = 7500;
  const UPPER_H = Math.max(UPPER_MIN, upperContentH + 1500 + 800);
  const DIVIDER_H = 60;
  const contentEstimate = englishLabelH + titleBlockHeight + subtitleH;
  const spacerIntrinsic = 280;
  const topSpacing = Math.max(UPPER_H - contentEstimate - spacerIntrinsic - 800, 400);

  const upperBlock = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: UPPER_H, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        verticalAlign: "top",
        margins: { left: padL, right: padR },
        children: [
          new Paragraph({ spacing: { before: topSpacing } }),
          config.englishLabel ? new Paragraph({
            spacing: { after: 500 },
            children: [new TextRun({ text: config.englishLabel.split("").join(" "),
              size: 18, color: P.accent, font: { ascii: "Calibri", hAnsi: "Calibri" },
              characterSpacing: 60 })],
          }) : null,
          ...titleLines.map((line, i) => new Paragraph({
            spacing: { after: i < titleLines.length - 1 ? 100 : 200,
                       line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
            children: [new TextRun({ text: line, size: titleSize, bold: true,
              color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial", hAnsi: "Arial" } })],
          })),
          config.subtitle ? new Paragraph({
            spacing: { after: 100, line: 312 },
            children: [new TextRun({ text: config.subtitle, size: 24,
              color: P.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial", hAnsi: "Arial" } })],
          }) : null,
        ].filter(Boolean),
      })],
    })],
  });

  const divider = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: DIVIDER_H, rule: "exact" },
      children: [new TableCell({ borders: noBorders,
        shading: { type: ShadingType.CLEAR, fill: P.accent },
        children: [emptyPara()] })],
    })],
  });

  const lowerContent = [
    new Paragraph({ spacing: { before: 800 } }),
    ...(config.metaLines || []).map(line => new Paragraph({
      indent: { left: padL }, spacing: { after: 100, line: 312 },
      children: [new TextRun({ text: line, size: 28, color: P.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial", hAnsi: "Arial" } })],
    })),
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      indent: { left: padL },
      children: [
        new TextRun({ text: config.footerLeft || "", size: 22, color: P.footerColor,
          font: { ascii: "Arial", hAnsi: "Arial" } }),
        new TextRun({ text: "          " }),
        new TextRun({ text: config.footerRight || "", size: 22, color: P.footerColor,
          font: { ascii: "Arial", hAnsi: "Arial" } }),
      ],
    }),
  ];

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "FFFFFF" }, borders: noBorders,
        verticalAlign: "top",
        children: [upperBlock, divider, ...lowerContent],
      })],
    })],
  })];
}

/* ── Встроенное форматирование: **жирный** и `код` ── */
function inlineRuns(text, base = {}) {
  const size = base.size || 24;
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size,
        color: base.color || P.body, font: base.mono ? MONO : FONT }));
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      runs.push(new TextRun({ text: part.slice(1, -1), size: Math.max(size - 2, 16),
        color: "24425C", font: MONO }));
    } else {
      runs.push(new TextRun({ text: part, size, color: base.color || P.body,
        font: base.mono ? MONO : FONT, bold: base.bold || false }));
    }
  }
  return runs;
}

/* ── Таблицы ── */
function buildTable(headerCells, rows) {
  const nCols = headerCells.length;
  const contentLen = headerCells.map(h => Math.max(h.length, 4));
  for (const row of rows)
    row.forEach((cell, i) => { contentLen[i] += Math.min(cell.length, 60); });
  const capped = contentLen.map(v => Math.min(v, 260));
  const total = capped.reduce((a, b) => a + b, 0);
  let pcts = capped.map(v => Math.max(8, Math.round((v / total) * 100)));
  const sum = pcts.reduce((a, b) => a + b, 0);
  const biggest = pcts.indexOf(Math.max(...pcts));
  pcts[biggest] += 100 - sum;

  const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };
  const mkPara = (text, opts = {}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { line: 312 },
    children: inlineRuns(text, { size: 21, color: opts.color || P.body }),
  });

  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headerCells.map((text, i) => new TableCell({
      children: [new Paragraph({
        alignment: AlignmentType.LEFT, spacing: { line: 312 },
        children: [new TextRun({ text, bold: true, size: 21,
          color: P.table.headerText, font: FONT })],
      })],
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: cellMargins,
      width: { size: pcts[i], type: WidthType.PERCENTAGE },
    })),
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    cantSplit: true,
    children: row.map((text, i) => new TableCell({
      children: [mkPara(text)],
      margins: cellMargins,
      width: { size: pcts[i], type: WidthType.PERCENTAGE },
      shading: ri % 2 === 1
        ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined,
    })),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}

/* ── Разбор markdown ── */
function parseMd(md) {
  const lines = md.split("\n");
  let i = 0;
  // пропускаем всё до первого заголовка раздела "## "
  while (i < lines.length && !lines[i].startsWith("## ")) i++;

  const blocks = [];
  let prevWasTable = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      blocks.push({ type: "h1", text: line.slice(3).trim() }); prevWasTable = false;
    } else if (line.startsWith("### ")) {
      blocks.push({ type: "h2", text: line.slice(4).trim() }); prevWasTable = false;
    } else if (line.startsWith("#### ")) {
      blocks.push({ type: "h3", text: line.slice(5).trim() }); prevWasTable = false;
    } else if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]); i++;
      }
      blocks.push({ type: "code", lines: codeLines }); prevWasTable = false;
    } else if (line.startsWith("| ")) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const raw = lines[i].replace(/\\\|/g, "\u0001");
        const cells = raw.split("|").slice(1, -1)
          .map(c => c.replace(/\u0001/g, "|").trim());
        tbl.push(cells); i++;
      }
      i--;
      const header = tbl[0];
      const rows = tbl.slice(1).filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
      blocks.push({ type: "table", header, rows }); prevWasTable = true;
    } else if (/^- /.test(line)) {
      blocks.push({ type: "bullet", text: line.slice(2).trim(), keepWithNext: prevWasTable });
      prevWasTable = false;
    } else if (/^\d+[\.\)] /.test(line)) {
      blocks.push({ type: "numbered", text: line, keepWithNext: prevWasTable });
      prevWasTable = false;
    } else if (line.trim() === "" || line.startsWith("> ")) {
      continue;
    } else {
      blocks.push({ type: "para", text: line.trim(), keepWithNext: prevWasTable });
      prevWasTable = false;
    }
  }
  return blocks;
}

function mdBlocksToDocx(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "h1") {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160, line: 312 },
        children: [new TextRun({ text: b.text, bold: true, size: 32,
          color: P.headingColor, font: FONT })],
      }));
    } else if (b.type === "h2") {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120, line: 312 },
        children: [new TextRun({ text: b.text, bold: true, size: 28,
          color: P.headingColor, font: FONT })],
      }));
    } else if (b.type === "h3") {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 100, line: 312 },
        children: [new TextRun({ text: b.text, bold: true, size: 24,
          color: P.headingColor, font: FONT })],
      }));
    } else if (b.type === "para") {
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 709 },
        spacing: { line: 312, after: 60 },
        keepNext: b.keepWithNext || undefined,
        children: inlineRuns(b.text),
      }));
    } else if (b.type === "bullet") {
      out.push(new Paragraph({
        bullet: { level: 0 },
        indent: { left: 720, hanging: 360 },
        spacing: { line: 312, after: 40 },
        keepNext: b.keepWithNext || undefined,
        children: inlineRuns(b.text),
      }));
    } else if (b.type === "numbered") {
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 720, hanging: 360 },
        spacing: { line: 312, after: 40 },
        keepNext: b.keepWithNext || undefined,
        children: inlineRuns(b.text),
      }));
    } else if (b.type === "code") {
      b.lines.forEach((codeLine, idx) => {
        out.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: P.codeBg },
          indent: { left: 240, right: 240 },
          spacing: { line: 312, before: idx === 0 ? 120 : 0,
                     after: idx === b.lines.length - 1 ? 120 : 0 },
          children: [new TextRun({ text: codeLine.length ? codeLine : " ",
            size: 18, color: "1F2937", font: MONO })],
        }));
      });
    } else if (b.type === "table") {
      out.push(buildTable(b.header, b.rows));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }
  return out;
}

/* ── Сборка документа ── */
const md = fs.readFileSync(SRC, "utf8");
const blocks = parseMd(md);
const bodyChildren = mdBlocksToDocx(blocks);

const pageNumFooter = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666", font: FONT })],
  })],
});

const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine, space: 4 } },
    children: [new TextRun({
      text: "Техническое задание · Конструктор СКИБ · версия 1.0",
      size: 16, color: "888888", font: FONT })],
  })],
});

const coverConfig = {
  title: "Конструктор СКИБ",
  englishLabel: "TECHNICAL SPECIFICATION",
  subtitle: "Техническое задание на разработку учебного веб-инструмента",
  metaLines: [
    "Документ: Техническое задание · версия 1.0",
    "Дата: 9 ноября 2026 г.",
    "Статус: утверждено для разработки (v0)",
    "Назначение: спецификация для генерации кода инструмента",
    "Контекст курса: ГОСТ Р 72118-2025 · ГОСТ ISO/IEC TS 19249-2021",
  ],
  footerLeft: "Конструктивная информационная безопасность · учебный курс",
  footerRight: "skib-lab · v1.0",
};

const doc = new Document({
  creator: "skib-lab",
  title: "ТЗ Конструктор СКИБ",
  styles: {
    default: {
      document: {
        run: { font: { ascii: FONT, hAnsi: FONT, eastAsia: FONT }, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: FONT, hAnsi: FONT }, size: 32, bold: true, color: P.headingColor },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: FONT, hAnsi: FONT }, size: 28, bold: true, color: P.headingColor },
        paragraph: { spacing: { before: 280, after: 120, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { ascii: FONT, hAnsi: FONT }, size: 24, bold: true, color: P.headingColor },
        paragraph: { spacing: { before: 240, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  sections: [
    { /* Секция 1: обложка — без номеров страниц */
      properties: {
        page: { size: { width: 11906, height: 16838 },
                margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCoverR4(coverConfig),
    },
    { /* Секция 2: СОДЕРЖАНИЕ — римская нумерация */
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 11906, height: 16838 },
                margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
                pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "СОДЕРЖАНИЕ", bold: true, size: 32,
            color: P.headingColor, font: FONT })],
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true, headingStyleRange: "1-3",
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Примечание: оглавление построено на полях Word. После редактирования документа щёлкните по оглавлению правой кнопкой мыши и выберите команду «Обновить поле», чтобы обновить номера страниц.",
            italics: true, size: 18, color: "888888", font: FONT })],
        }),
      ],
    },
    { /* Секция 3: основная часть — арабская нумерация с 1 */
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 11906, height: 16838 },
                margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
                pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("OK:", OUT, buf.length, "bytes");
});
