import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) {
      return Response.json({ success: false, error: 'No file provided.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const name = (file.name || '').toLowerCase()

    let text = ''
    if (name.endsWith('.pdf')) {
      const result = await pdfParse(buffer)
      text = result.text?.trim() || ''
    } else {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value?.trim() || ''
    }

    if (!text || text.length < 20) {
      return Response.json({ success: false, error: 'Could not extract readable text from this file.' }, { status: 400 })
    }

    return Response.json({ success: true, text, length: text.length })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
