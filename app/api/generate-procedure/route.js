export const runtime = 'nodejs'
export const maxDuration = 120

const SYSTEM_PROMPT = `You are the core reasoning engine for Offshore Construction AI, specialising in generating complete, professional offshore construction procedure documents.

You will be given a REFERENCE DOCUMENT for style analysis. Your task is to generate a COMPLETE NEW procedure document that mirrors the reference in:

1. STRUCTURE — Replicate the same number of main sections and subsection depth. If the reference has 10 sections, generate 10. If it has sub-sections 1.1, 1.2 etc., match that hierarchy.

2. FORMATTING STYLE — Match exactly: numbered operational steps vs bullet lists vs prose paragraphs vs tables. If the reference uses numbered steps for operational sequences and tables for equipment lists, do the same.

3. DETAIL LEVEL — Match the technical density per step. If the reference specifies load limits, tolerance values, personnel roles, equipment references, or hold points at specific intervals, replicate that density for the new procedure.

4. APPROXIMATE LENGTH — Your output must be similar in total word count and content volume. Do NOT truncate, summarise, or produce a skeleton. If the reference is 3000 words, generate ~3000 words.

Standards to apply throughout: LOLER, PUWER, IMCA, DNV GL.
Safety markers to include appropriately: [HOLD POINT], [STOP WORK CRITERIA], [CONFIRM WITH ENGINEER].

STRICT OUTPUT RULES:
- Output ONLY valid JSON. No Markdown. No prose outside the JSON structure.
- Never use placeholder text like "... continued" or "similar steps follow".
- Complete every section fully.

OUTPUT JSON SCHEMA:
{
  "document_title": "string",
  "sections": [
    {
      "section_id": "string",
      "title": "string",
      "content_blocks": [
        {
          "type": "heading1|heading2|heading3|paragraph|bullet_list|numbered_list|table|note|warning",
          "text": "string",
          "items": ["string"],
          "columns": ["string"],
          "rows": [["string"]],
          "label": "string"
        }
      ]
    }
  ]
}`

export async function POST(request) {
  try {
    const body = await request.json()
    const { document_type, scope, template_rules, reference_text } = body

    const documentType  = document_type  || 'Offshore Construction Procedure'
    const referenceText = reference_text || ''
    const templateRules = template_rules || 'none'

    if (!referenceText || referenceText.length < 50) {
      return Response.json({ success: false, error: 'A reference document is required for style-matched generation.' }, { status: 400 })
    }

    const wordCount = referenceText.trim().split(/\s+/).length

    const userMessage = `TASK: Generate a complete ${documentType} procedure that mirrors the reference document in structure, formatting style, detail level, and length.

DOCUMENT TYPE: ${documentType}
SCOPE: ${scope || 'Full procedure'}
TEMPLATE RULES: ${templateRules}

REFERENCE DOCUMENT — ${wordCount} words. Analyse its structure carefully before generating.
Your output must reach a similar word count (target: ~${wordCount} words).
---
${referenceText.substring(0, 14000)}`

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return Response.json({ success: false, error: 'OPENAI_API_KEY not set.' }, { status: 500 })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.25,
        max_tokens: 14000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage   },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}))
      return Response.json({ success: false, error: err?.error?.message || `OpenAI error ${openaiRes.status}` }, { status: 502 })
    }

    const openaiData  = await openaiRes.json()
    const rawText     = openaiData.choices?.[0]?.message?.content || '{}'
    let parsedJson
    try   { parsedJson = JSON.parse(rawText) }
    catch { parsedJson = { error: 'Could not parse AI response', raw: rawText } }

    return Response.json({
      success: !parsedJson.error,
      data: parsedJson,
      meta: {
        agentMode:          'GENERATE',
        documentType,
        scope,
        generatedAt:        new Date().toISOString(),
        referenceWordCount: wordCount,
        referenceLength:    referenceText.length,
      },
    })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
