import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
  LevelFormat,
  NumberingConfig,
} from 'docx'

// ─── Colour palette ───────────────────────────────────────────
const NAVY   = '1a3c5e'
const AMBER  = 'f59e0b'
const RED    = 'dc2626'
const LGREY  = 'f1f5f9'
const DGREY  = '334155'

// ─── Helper: plain paragraph ─────────────────────────────────
function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: text || '', color: opts.color || DGREY, size: opts.size || 22, bold: opts.bold || false, font: 'Arial' })],
    spacing: { after: opts.spacingAfter ?? 120 },
    alignment: opts.alignment || AlignmentType.LEFT,
    indent: opts.indent ? { left: convertInchesToTwip(opts.indent) } : undefined,
  })
}

// ─── Helper: heading ─────────────────────────────────────────
function heading(text, level) {
  const map = {
    heading1: { level: HeadingLevel.HEADING_1, size: 32, color: NAVY, spacing: 200 },
    heading2: { level: HeadingLevel.HEADING_2, size: 26, color: NAVY, spacing: 160 },
    heading3: { level: HeadingLevel.HEADING_3, size: 24, color: DGREY, spacing: 140 },
  }
  const s = map[level] || map.heading2
  return new Paragraph({
    heading: s.level,
    children: [new TextRun({ text: text || '', bold: true, color: s.color, size: s.size, font: 'Arial' })],
    spacing: { before: s.spacing, after: 100 },
  })
}

// ─── Helper: bullet item ────────────────────────────────────
function bullet(text, numbered = false) {
  return new Paragraph({
    children: [new TextRun({ text: text || '', size: 22, color: DGREY, font: 'Arial' })],
    bullet: numbered ? undefined : { level: 0 },
    numbering: numbered ? { reference: 'default-numbering', level: 0 } : undefined,
    spacing: { after: 80 },
    indent: { left: convertInchesToTwip(0.4) },
  })
}

// ─── Helper: coloured banner (note / warning) ────────────────
function banner(text, type) {
  const isWarn = type === 'warning'
  const bg = isWarn ? 'fff7ed' : 'eff6ff'
  const border = isWarn ? AMBER : '3b82f6'
  const label = isWarn ? '⚠  WARNING' : 'ℹ  NOTE'
  return [
    new Paragraph({
      children: [new TextRun({ text: label, bold: true, size: 20, color: isWarn ? 'b45309' : '1d4ed8', font: 'Arial' })],
      spacing: { before: 160, after: 40 },
      shading: { type: ShadingType.SOLID, color: bg },
      border: { left: { style: BorderStyle.THICK, size: 12, color: border } },
      indent: { left: convertInchesToTwip(0.2) },
    }),
    new Paragraph({
      children: [new TextRun({ text: text || '', size: 20, color: DGREY, font: 'Arial' })],
      spacing: { after: 160 },
      shading: { type: ShadingType.SOLID, color: bg },
      border: { left: { style: BorderStyle.THICK, size: 12, color: border } },
      indent: { left: convertInchesToTwip(0.2) },
    }),
  ]
}

// ─── Helper: table ──────────────────────────────────────────
function buildTable(columns, rows) {
  const headerRow = new TableRow({
    children: columns.map(col =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, color: 'ffffff', size: 20, font: 'Arial' })] })],
        shading: { type: ShadingType.SOLID, color: NAVY },
        width: { size: Math.floor(9000 / columns.length), type: WidthType.DXA },
      })
    ),
    tableHeader: true,
  })

  const dataRows = (rows || []).map((row, i) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: cell || '', size: 20, color: DGREY, font: 'Arial' })] })],
          shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? 'ffffff' : LGREY },
          width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
        })
      ),
    })
  )

  return new Table({ rows: [headerRow, ...dataRows], width: { size: 9000, type: WidthType.DXA } })
}

// ─── Convert a single content_block to docx elements ────────
function blockToElements(block) {
  switch (block.type) {
    case 'heading1': return [heading(block.text, 'heading1')]
    case 'heading2': return [heading(block.text, 'heading2')]
    case 'heading3': return [heading(block.text, 'heading3')]
    case 'paragraph': return [para(block.text)]
    case 'bullet_list': return (block.items || []).map(item => bullet(item, false))
    case 'numbered_list': return (block.items || []).map(item => bullet(item, true))
    case 'table': return [buildTable(block.columns || [], block.rows || [])]
    case 'note': return banner(block.text, 'note')
    case 'warning': return banner(block.text, 'warning')
    case 'image_placeholder': return [para(`[ Image: ${block.label || 'placeholder'} ]`, { color: '94a3b8', bold: false })]
    default: return [para(block.text || '')]
  }
}

// ─── Build PLANNER outline doc ───────────────────────────────
function buildPlannerDoc(data, meta) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: data.document_title || 'Document Outline', bold: true, size: 52, color: NAVY, font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Document Type: ${meta.documentType || ''}   |   Generated: ${new Date(meta.generatedAt).toUTCString()}`, size: 18, color: '94a3b8', font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ]

  for (const section of data.sections || []) {
    children.push(heading(`${section.section_id}  ${section.title}`, 'heading1'))
    children.push(para(`Target: ${section.target_words?.toLocaleString() || '—'} words`, { color: '64748b', size: 20 }))
    children.push(para(section.description || ''))
    for (const sub of section.subsections || []) {
      children.push(heading(`${sub.section_id}  ${sub.title}`, 'heading2'))
      children.push(para(`Target: ${sub.target_words?.toLocaleString() || '—'} words`, { color: '64748b', size: 20 }))
      children.push(para(sub.description || ''))
    }
    children.push(new Paragraph({ children: [], spacing: { after: 200 } }))
  }

  return children
}

// ─── Build WRITER / QA / TERMINOLOGY section doc ────────────
function buildSectionDoc(data, meta) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: data.title || 'Section', bold: true, size: 48, color: NAVY, font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `${meta.documentType || ''}   |   Mode: ${meta.agentMode || ''}   |   ${new Date(meta.generatedAt).toUTCString()}`, size: 18, color: '94a3b8', font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ]

  for (const block of data.content_blocks || []) {
    children.push(...blockToElements(block))
  }

  return children
}

// ─── Build REWRITE full procedure doc ────────────────────────
function buildRewriteDoc(data, meta) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: data.document_title || meta.documentType || 'Offshore Construction Procedure', bold: true, size: 52, color: NAVY, font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Document Type: ${meta.documentType || ''}   |   Generated: ${new Date(meta.generatedAt).toUTCString()}`, size: 18, color: '94a3b8', font: 'Arial' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ]

  for (const section of data.sections || []) {
    children.push(heading(section.title || '', 'heading1'))
    for (const block of section.content_blocks || []) {
      children.push(...blockToElements(block))
    }
    children.push(new Paragraph({ children: [], spacing: { after: 240 } }))
  }

  return children
}

// ─── Main export ─────────────────────────────────────────────
export async function buildDocx(jsonData, meta) {
  const isPlanner = meta.agentMode === 'PLANNER' || (!!jsonData.sections && !jsonData.sections[0]?.content_blocks)
  const isRewrite = meta.agentMode === 'REWRITE' || (!!jsonData.sections && !!jsonData.sections[0]?.content_blocks)

  const children = isRewrite
    ? buildRewriteDoc(jsonData, meta)
    : isPlanner
    ? buildPlannerDoc(jsonData, meta)
    : buildSectionDoc(jsonData, meta)

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.25) } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBlob(doc)
}
