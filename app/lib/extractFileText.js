// Client-side text extraction — runs in the browser, sends text not binary to the server.
// Keeps all file payloads well under Vercel's 4.5 MB function limit.

export async function extractFileText(file) {
  const name = (file.name || '').toLowerCase()

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return readAsText(file)
  }
  if (name.endsWith('.pdf')) {
    return extractPdf(file)
  }
  // .docx / .doc — mammoth browser build
  return extractDocx(file)
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result || '')
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file)
  })
}

async function extractDocx(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  // mammoth auto-selects its browser build when bundled by Next.js
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value?.trim() || ''
}

async function extractPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // Use unpkg CDN for the worker — avoids bundling a separate worker file
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(' '))
  }

  return pages.join('\n').trim()
}
