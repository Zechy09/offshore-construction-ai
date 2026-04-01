'use client'
import { useState, useRef } from 'react'
import styles from './page.module.css'
import { buildDocx } from './lib/buildDocx'

const AGENT_MODES = [
  {
    id: 'PLANNER',
    label: 'Planner',
    icon: '🗂️',
    desc: 'Full document outline with sections and word counts',
  },
  {
    id: 'WRITER',
    label: 'Writer',
    icon: '✍️',
    desc: 'Generate full section content as a DOCX document',
  },
  {
    id: 'QA',
    label: 'QA Review',
    icon: '🔍',
    desc: 'Review and correct existing section content',
  },
  {
    id: 'TERMINOLOGY',
    label: 'Terminology',
    icon: '📐',
    desc: 'Enforce consistent offshore construction terminology',
  },
]

const DOCUMENT_TYPES = [
  'Lift Plan',
  'Method Statement',
  'RAMS',
  'DP Operations Manual',
  'Commissioning Procedure',
  'ROV Operations Manual',
  'Offshore Substation Installation Manual',
  'Cable Pulling Procedure',
  'Marine Coordination Plan',
  'Offshore Installation Manual',
  'Pre-Lay Survey Procedure',
  'Heavy Lift Procedure',
  'Subsea Cable Burial Procedure',
  'Vessel Operations Manual',
]

const SCOPE_EXAMPLES = [
  'Full document outline',
  'Section 3.1 — Pre-Lay Survey Operations',
  'Section 4.2 — Cable Pulling Operations',
  'DP Operations for CSV Deep Pioneer',
  'ROV Pre-Dive Checklist and Procedures',
  'Heavy Lift Rigging and Crane Operations',
  'Commissioning — Electrical Continuity Testing',
  'Marine Spread Coordination Protocol',
]

const API_ENDPOINT = '/api/generate'

export default function Home() {
  const [agentMode, setAgentMode] = useState('PLANNER')
  const [documentType, setDocumentType] = useState('')
  const [scope, setScope] = useState('')
  const [templateRules, setTemplateRules] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [referenceFile, setReferenceFile] = useState(null)
  const [templateFile, setTemplateFile] = useState(null)
  const [status, setStatus] = useState(null) // { type: 'loading'|'success'|'error', message: string }
  const [output, setOutput] = useState(null)   // { blob, filename } for download
  const refFileRef = useRef()
  const tplFileRef = useRef()

  function handleReferenceFile(e) {
    const f = e.target.files[0]
    if (f) setReferenceFile(f)
  }

  function handleTemplateFile(e) {
    const f = e.target.files[0]
    if (f) setTemplateFile(f)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!documentType) { setStatus({ type: 'error', message: 'Please select a Document Type.' }); return }
    if (!scope.trim()) { setStatus({ type: 'error', message: 'Please provide a Scope.' }); return }

    setStatus({ type: 'loading', message: 'Submitting to Offshore Construction AI…' })
    setOutput(null)

    try {
      setStatus({ type: 'loading', message: 'Generating content…' })
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_mode: agentMode,
          document_type: documentType,
          scope: scope.trim(),
          template_rules: templateRules.trim() || 'none',
          reference_text: referenceText.trim(),
        }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`)

      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'AI generation failed')

      setStatus({ type: 'loading', message: 'Building DOCX…' })
      const blob = await buildDocx(result.data, result.meta)
      const safeName = (documentType || 'document').replace(/\s+/g, '-').toLowerCase()
      const filename = `${safeName}-${agentMode.toLowerCase()}-${Date.now()}.docx`

      setOutput({ blob, filename })
      setStatus({ type: 'success', message: `Document ready — click below to download.` })
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err.message}` })
    }
  }

  function downloadDocx() {
    if (!output) return
    const url = URL.createObjectURL(output.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = output.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>⚓</div>
          <div>
            <h1 className={styles.title}>Offshore Construction AI</h1>
            <p className={styles.subtitle}>
              Advanced document generation · Heavy Lifting · Marine Construction · ROV · DP Vessels · Commissioning<br />
              <span className={styles.standards}>LOLER · PUWER · IMCA · DNV</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>

          {/* Agent Mode */}
          <section className={styles.section}>
            <label className={styles.label}>Agent Mode</label>
            <p className={styles.hint}>Select how the AI should process your request.</p>
            <div className={styles.modeGrid}>
              {AGENT_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.modeCard} ${agentMode === m.id ? styles.modeCardActive : ''}`}
                  onClick={() => setAgentMode(m.id)}
                >
                  <span className={styles.modeIcon}>{m.icon}</span>
                  <span className={styles.modeLabel}>{m.label}</span>
                  <span className={styles.modeDesc}>{m.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Document Type */}
          <section className={styles.section}>
            <label className={styles.label} htmlFor="docType">Document Type</label>
            <p className={styles.hint}>Select the type of offshore construction document to generate.</p>
            <select
              id="docType"
              className={styles.select}
              value={documentType}
              onChange={e => setDocumentType(e.target.value)}
            >
              <option value="">— Select document type —</option>
              {DOCUMENT_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </section>

          {/* Scope */}
          <section className={styles.section}>
            <label className={styles.label} htmlFor="scope">Scope</label>
            <p className={styles.hint}>Describe the specific section, vessel, operation, or phase. Be precise.</p>
            <div className={styles.exampleChips}>
              {SCOPE_EXAMPLES.map(ex => (
                <button key={ex} type="button" className={styles.chip} onClick={() => setScope(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <textarea
              id="scope"
              className={styles.textarea}
              rows={3}
              placeholder='e.g. "Section 4.2 — Cable Pulling Operations" or "DP operations for CSV Deep Pioneer during J-tube pull-in"'
              value={scope}
              onChange={e => setScope(e.target.value)}
            />
          </section>

          {/* Template Rules */}
          <section className={styles.section}>
            <label className={styles.label} htmlFor="templateRules">Corporate Template Rules</label>
            <p className={styles.hint}>Describe any branding constraints (fonts, colours, header/footer). Leave blank to use industry-standard defaults.</p>
            <textarea
              id="templateRules"
              className={styles.textarea}
              rows={3}
              placeholder='e.g. "Arial 11pt, navy #1a3c5e headers, A4 margins 25mm, company logo top-right" — or leave blank for defaults.'
              value={templateRules}
              onChange={e => setTemplateRules(e.target.value)}
            />
          </section>

          {/* Reference Document */}
          <section className={styles.section}>
            <label className={styles.label}>Reference Document <span className={styles.optional}>(optional)</span></label>
            <p className={styles.hint}>Upload an existing document for the AI to analyse, extract, and modernise. Or paste extracted text below.</p>
            <div
              className={`${styles.uploadZone} ${referenceFile ? styles.uploadZoneActive : ''}`}
              onClick={() => refFileRef.current.click()}
            >
              <span className={styles.uploadIcon}>📄</span>
              <span className={styles.uploadText}>
                {referenceFile ? referenceFile.name : 'Click to upload reference document'}
              </span>
              <span className={styles.uploadSub}>PDF, DOCX, TXT — max 50MB</span>
              {referenceFile && (
                <button
                  type="button"
                  className={styles.clearFileBtn}
                  onClick={e => { e.stopPropagation(); setReferenceFile(null); refFileRef.current.value = '' }}
                >
                  ✕ Remove
                </button>
              )}
            </div>
            <input ref={refFileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: 'none' }} onChange={handleReferenceFile} />
            <textarea
              className={`${styles.textarea} ${styles.textareaSmall}`}
              rows={4}
              placeholder='Or paste extracted text from your reference document here…'
              value={referenceText}
              onChange={e => setReferenceText(e.target.value)}
            />
          </section>

          {/* Corporate Template File */}
          <section className={styles.section}>
            <label className={styles.label}>Corporate DOCX Template <span className={styles.optional}>(optional)</span></label>
            <p className={styles.hint}>Upload your branded DOCX template file. The AI will map content blocks to its styles.</p>
            <div
              className={`${styles.uploadZone} ${templateFile ? styles.uploadZoneActive : ''}`}
              onClick={() => tplFileRef.current.click()}
            >
              <span className={styles.uploadIcon}>📝</span>
              <span className={styles.uploadText}>
                {templateFile ? templateFile.name : 'Click to upload DOCX template'}
              </span>
              <span className={styles.uploadSub}>DOCX only</span>
              {templateFile && (
                <button
                  type="button"
                  className={styles.clearFileBtn}
                  onClick={e => { e.stopPropagation(); setTemplateFile(null); tplFileRef.current.value = '' }}
                >
                  ✕ Remove
                </button>
              )}
            </div>
            <input ref={tplFileRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={handleTemplateFile} />
          </section>

          {/* Status */}
          {status && (
            <div className={`${styles.statusBanner} ${styles[`status_${status.type}`]}`}>
              {status.type === 'loading' && <span className={styles.spinner}>⏳</span>}
              {status.type === 'success' && '✅ '}
              {status.type === 'error' && '❌ '}
              {status.message}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={status?.type === 'loading'}
          >
            {status?.type === 'loading' ? '⏳ Generating…' : '⚙️ Generate Document Content'}
          </button>
        </form>

        {/* Download */}
        {output && (
          <div className={styles.downloadSection}>
            <button className={styles.downloadBtn} onClick={downloadDocx}>
              📄 Download {output.filename}
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          Offshore Construction AI · LOLER · PUWER · IMCA · DNV standards
        </footer>
      </div>
    </main>
  )
}
