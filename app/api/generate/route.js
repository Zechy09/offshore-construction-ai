export const runtime = 'edge'

const SYSTEM_PROMPT = `You are the core reasoning engine for Offshore Construction AI. Generate highly structured, technically accurate content for offshore construction documents covering heavy lifting, marine construction, ROV operations, DP vessels, and commissioning.

STRICT OUTPUT RULES:
- Output ONLY valid JSON. No Markdown. No HTML. No prose.
- Preserve safety markers exactly: [HOLD POINT], [STOP WORK CRITERIA], [CONFIRM WITH ENGINEER]
- All content must comply with LOLER, PUWER, IMCA, DNV standards.
- Tone: professional, technical, precise, safety-oriented.

JSON SCHEMA for WRITER / QA / TERMINOLOGY mode:
{
  "section_id": "string",
  "title": "string",
  "content_blocks": [
    {
      "type": "heading1|heading2|heading3|paragraph|bullet_list|numbered_list|table|image_placeholder|note|warning",
      "text": "string",
      "items": ["string"],
      "columns": ["string"],
      "rows": [["string"]],
      "label": "string"
    }
  ]
}

JSON SCHEMA for PLANNER mode:
{
  "document_title": "string",
  "sections": [
    {
      "section_id": "1",
      "title": "string",
      "target_words": 500,
      "description": "string",
      "subsections": [
        { "section_id": "1.1", "title": "string", "target_words": 200, "description": "string" }
      ]
    }
  ]
}

Never include numbering in headings. Each section must be self-contained.`

const MODE_INSTRUCTIONS = {
  PLANNER: 'Act as Document Planner Agent. Produce a complete document outline with sections, subsections, target word counts, and descriptions. Structure suitable for a 200–500+ page offshore construction technical document. Output ONLY the Planner JSON schema.',
  WRITER: 'Act as Section Writer Agent. Generate full, technically detailed content for the specified section only. Use the reference document as a guide if provided. Output ONLY structured JSON content blocks.',
  QA: 'Act as QA/Consistency Agent. Review and correct content for technical accuracy, safety compliance, and alignment with LOLER, PUWER, IMCA, DNV standards. Preserve safety markers exactly. Output corrected JSON content blocks.',
  TERMINOLOGY: 'Act as Style and Terminology Agent. Replace vague or non-technical language with precise offshore construction engineering terms. Preserve safety markers exactly. Output corrected JSON content blocks.',
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { agent_mode, document_type, scope, template_rules, reference_text } = body

    const agentMode = (agent_mode || 'PLANNER').toUpperCase()
    const instruction = MODE_INSTRUCTIONS[agentMode] || MODE_INSTRUCTIONS.PLANNER

    let userMessage = `AGENT_MODE: ${agentMode}
DOCUMENT_TYPE: ${document_type || ''}
SCOPE: ${scope || ''}
TEMPLATE_RULES: ${template_rules || 'none'}

INSTRUCTION: ${instruction}`

    if (reference_text?.trim()) {
      userMessage += `\n\nREFERENCE DOCUMENT TEXT:\n${reference_text.trim().substring(0, 8000)}`
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return Response.json({ success: false, error: 'OPENAI_API_KEY environment variable not set.' }, { status: 500 })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.2,
        max_tokens: 4096,
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
        agentMode,
        documentType: document_type,
        scope,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
