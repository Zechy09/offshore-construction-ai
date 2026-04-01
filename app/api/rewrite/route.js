import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `You are the core reasoning engine for Offshore Construction AI.

You have been given:
1. A CORPORATE TEMPLATE — defines document structure, section headings, and required content areas
2. A REFERENCE PROCEDURE — an existing offshore construction procedure to be rewritten

Your task:
- Analyse the reference procedure: extract its operational logic, steps, safety controls, and technical content
- Rewrite the content into the structure defined by the corporate template
- Modernise outdated language, improve clarity, and fill any gaps using LOLER, PUWER, IMCA, DNV standards
- Do NOT copy the reference verbatim — rewrite and improve it
- Preserve all safety-critical content
- Add missing steps or safety controls where the reference is incomplete

STRICT OUTPUT RULES:
- Output ONLY valid JSON. No Markdown. No HTML. No prose.
- Preserve safety markers exactly: [HOLD POINT], [STOP WORK CRITERIA], [CONFIRM WITH ENGINEER]
- Comply with LOLER, PUWER, IMCA, DNV standards
- Tone: professional, technical, precise, safety-oriented

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
    const formData = await request.formData()
    const templateFile = formData.get('template_file')
    const referenceFile = formData.get('reference_file')
    const documentType = formData.get('document_type') || 'Offshore Construction Procedure'
    const scope = formData.get('scope') || ''
    const templateRules = formData.get('template_rules') || 'none'

    if (!referenceFile) {
      return Response.json({ success: false, error: 'Reference procedure file is required.' }, { status: 400 })
    }

    // Extract text from reference procedure
    const refBuffer = Buffer.from(await referenceFile.arrayBuffer())
    const refResult = await mammoth.extractRawText({ buffer: refBuffer })
    const referenceText = refResult.value?.trim()
    if (!referenceText || referenceText.length < 50) {
      return Response.json({ success: false, error: 'Could not extract text from reference procedure. Ensure it is a valid DOCX file.' }, { status: 400 })
    }

    // Extract text from template (if provided)
    let templateText = ''
    if (templateFile && templateFile.size > 0) {
      const tplBuffer = Buffer.from(await templateFile.arrayBuffer())
      const tplResult = await mammoth.extractRawText({ buffer: tplBuffer })
      templateText = tplResult.value?.trim() || ''
    }

    // Build prompt
    let userMessage = `TASK: Rewrite the reference procedure into the corporate template structure.
DOCUMENT_TYPE: ${documentType}
SCOPE: ${scope || 'Full procedure rewrite'}
TEMPLATE_RULES: ${templateRules}`

    if (templateText) {
      userMessage += `\n\nCORPORATE TEMPLATE STRUCTURE (extracted from uploaded template):\n${templateText.substring(0, 4000)}`
    } else {
      userMessage += `\n\nCORPORATE TEMPLATE: No template uploaded — use standard offshore construction document structure with these sections: 1. Purpose and Scope, 2. References and Standards, 3. Roles and Responsibilities, 4. Equipment and Resources, 5. Risk Assessment, 6. Pre-Job Requirements, 7. Operational Procedure (step-by-step), 8. Emergency Procedures, 9. Post-Job Requirements, 10. Appendices`
    }

    userMessage += `\n\nREFERENCE PROCEDURE TO REWRITE:\n${referenceText.substring(0, 10000)}`

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return Response.json({ success: false, error: 'OPENAI_API_KEY not set.' }, { status: 500 })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.2,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json()
      return Response.json({ success: false, error: err?.error?.message || 'OpenAI API error' }, { status: 502 })
    }

    const openaiData = await openaiRes.json()
    const responseText = openaiData.choices?.[0]?.message?.content || '{}'

    let parsedJson
    try {
      parsedJson = JSON.parse(responseText)
    } catch {
      parsedJson = { error: 'Could not parse AI response', raw: responseText }
    }

    return Response.json({
      success: !parsedJson.error,
      data: parsedJson,
      meta: {
        agentMode: 'REWRITE',
        documentType,
        scope,
        generatedAt: new Date().toISOString(),
        referenceLength: referenceText.length,
        templateUsed: !!templateText,
      },
    })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
