'use client'
import { useState, useRef } from 'react'
import styles from './page.module.css'
import { buildDocx } from './lib/buildDocx'

async function safeJson(res) {
  const text = await res.text()
  if (!text) throw new Error(`Server returned an empty response (HTTP ${res.status}). Check that all environment variables are set.`)
  try { return JSON.parse(text) }
  catch { throw new Error(`Server returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 120)}`) }
}

const PROCEDURE_TYPES = [
  { id: 'Lift Plan',                      label: 'Lift Plan',                      icon: '🏗️' },
  { id: 'Method Statement',               label: 'Method Statement',               icon: '📋' },
  { id: 'RAMS',                           label: 'RAMS',                           icon: '⚠️' },
  { id: 'DP Operations Manual',           label: 'DP Operations Manual',           icon: '🚢' },
  { id: 'Commissioning Procedure',        label: 'Commissioning Procedure',        icon: '⚡' },
  { id: 'ROV Operations Manual',          label: 'ROV Operations Manual',          icon: '🤖' },
  { id: 'Cable Pulling Procedure',        label: 'Cable Pulling Procedure',        icon: '🔌' },
  { id: 'Heavy Lift Procedure',           label: 'Heavy Lift Procedure',           icon: '⚙️' },
]

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Type' },
  { id: 3, label: 'Mode' },
  { id: 4, label: 'Generate' },
  { id: 5, label: 'Flags' },
  { id: 6, label: 'Save' },
]

const GENERATION_STAGES = [
  { id: 'queued',     label: 'Queued',        desc: 'Request received and validated' },
  { id: 'extracting', label: 'Extracting',    desc: 'Parsing uploaded documents' },
  { id: 'generating', label: 'Generating',    desc: 'AI generating procedure content' },
  { id: 'building',   label: 'Building DOCX', desc: 'Assembling formatted document' },
  { id: 'complete',   label: 'Complete',      desc: 'Document ready for download' },
]

const FLAG_PATTERNS = [
  { pattern: /\[HOLD POINT\]/gi,            label: 'Hold Points',            color: '#f59e0b', icon: '🔴' },
  { pattern: /\[STOP WORK CRITERIA\]/gi,    label: 'Stop Work Criteria',     color: '#f85149', icon: '🛑' },
  { pattern: /\[CONFIRM WITH ENGINEER\]/gi, label: 'Confirm with Engineer',  color: '#388bfd', icon: '👷' },
]

function parseFlags(jsonData) {
  if (!jsonData) return []
  const text = JSON.stringify(jsonData)
  return FLAG_PATTERNS
    .map(fp => ({ ...fp, count: (text.match(fp.pattern) || []).length }))
    .filter(fp => fp.count > 0)
}

export default function Home() {
  const [currentStep, setCurrentStep]           = useState(1)
  const [agentMode, setAgentMode]               = useState('WRITER')
  const [documentType, setDocumentType]         = useState('')
  const [scope, setScope]                       = useState('')
  const [templateRules, setTemplateRules]       = useState('')
  const [referenceText, setReferenceText]       = useState('')
  const [referenceFile, setReferenceFile]       = useState(null)
  const [templateFile, setTemplateFile]         = useState(null)
  const [generationStage, setGenerationStage]   = useState('idle')
  const [generationProgress, setGenProgress]    = useState(0)
  const [flags, setFlags]                       = useState([])
  const [output, setOutput]                     = useState(null)
  const [error, setError]                       = useState(null)
  const refFileRef = useRef()
  const tplFileRef = useRef()

  function canAdvance() {
    if (currentStep === 2) return !!documentType
    if (currentStep === 3) return (agentMode !== 'REWRITE' && agentMode !== 'GENERATE') || !!referenceFile
    return true
  }

  function goNext() {
    if (currentStep === 3) {
      setCurrentStep(4)
      startGeneration()
      return
    }
    setCurrentStep(s => s + 1)
  }

  function goBack() {
    if (currentStep === 4) {
      setGenerationStage('idle')
      setGenProgress(0)
      setError(null)
    }
    setCurrentStep(s => s - 1)
  }

  async function startGeneration() {
    setError(null)
    setGenerationStage('queued')
    setGenProgress(5)

    try {
      setGenerationStage('extracting')
      setGenProgress(20)

      // Extract text from uploaded file (DOCX or PDF) for WRITER mode
      let effectiveReferenceText = referenceText
      if (agentMode === 'WRITER' && referenceFile) {
        const extractForm = new FormData()
        extractForm.append('file', referenceFile)
        const extractRes = await fetch('/api/extract', { method: 'POST', body: extractForm })
        const extractData = await safeJson(extractRes)
        if (extractData.success && extractData.text) {
          effectiveReferenceText = extractData.text
        }
      }

      let result
      if (agentMode === 'REWRITE' && referenceFile) {
        const form = new FormData()
        form.append('document_type', documentType)
        form.append('scope', scope.trim() || 'Full procedure rewrite')
        form.append('template_rules', templateRules.trim() || 'none')
        form.append('reference_file', referenceFile)
        if (templateFile) form.append('template_file', templateFile)

        setGenerationStage('generating')
        setGenProgress(40)
        const res = await fetch('/api/rewrite', { method: 'POST', body: form })
        result = await safeJson(res)
      } else if (agentMode === 'GENERATE' && referenceFile) {
        const form = new FormData()
        form.append('document_type', documentType)
        form.append('scope', scope.trim() || 'Full procedure')
        form.append('template_rules', templateRules.trim() || 'none')
        form.append('reference_file', referenceFile)

        setGenerationStage('generating')
        setGenProgress(40)
        const res = await fetch('/api/generate-procedure', { method: 'POST', body: form })
        result = await safeJson(res)
      } else {
        setGenerationStage('generating')
        setGenProgress(40)
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_mode: agentMode === 'GENERATE' ? 'WRITER' : agentMode,
            document_type: documentType,
            scope: scope.trim() || 'Full document',
            template_rules: templateRules.trim() || 'none',
            reference_text: effectiveReferenceText.trim(),
          }),
        })
        result = await safeJson(res)
      }

      if (!result.success) throw new Error(result.error || 'AI generation failed')

      setGenProgress(70)
      setFlags(parseFlags(result.data))

      setGenerationStage('building')
      setGenProgress(85)
      const blob = await buildDocx(result.data, result.meta)
      const safeName = documentType.replace(/\s+/g, '-').toLowerCase()
      const filename = `${safeName}-${agentMode.toLowerCase()}-${Date.now()}.docx`
      setOutput({ blob, filename })

      setGenProgress(100)
      setGenerationStage('complete')
      setTimeout(() => setCurrentStep(5), 900)
    } catch (err) {
      setError(err.message)
      setGenerationStage('idle')
      setGenProgress(0)
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

  function reset() {
    setCurrentStep(1)
    setAgentMode('WRITER')
    setDocumentType('')
    setScope('')
    setTemplateRules('')
    setReferenceText('')
    setReferenceFile(null)
    setTemplateFile(null)
    setGenerationStage('idle')
    setGenProgress(0)
    setFlags([])
    setOutput(null)
    setError(null)
  }

  const stageIndex = GENERATION_STAGES.findIndex(s => s.id === generationStage)

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoIcon}>⚓</span>
          <span className={styles.logoText}>OffshoreAI</span>
        </div>
        <nav className={styles.sidebarNav}>
          <button className={`${styles.navItem} ${styles.navItemActive}`}>
            <span>📄</span> New Procedure
          </button>
          <button className={styles.navItem} onClick={reset}>
            <span>📚</span> Library
          </button>
          <button className={styles.navItem}>
            <span>⚙️</span> Settings
          </button>
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.avatar}>OB</div>
          <div className={styles.avatarInfo}>
            <div className={styles.avatarName}>Offshore User</div>
            <div className={styles.avatarRole}>Senior Engineer</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {/* Top bar */}
        <div className={styles.topbar}>
          <h1 className={styles.pageTitle}>New Procedure</h1>
          <p className={styles.pageSubtitle}>LOLER · PUWER · IMCA · DNV</p>
        </div>

        {/* Stepper */}
        <div className={styles.stepper}>
          {STEPS.map((step, i) => {
            const state = step.id < currentStep ? 'done' : step.id === currentStep ? 'active' : 'upcoming'
            return (
              <div key={step.id} className={styles.stepWrapper}>
                <div className={`${styles.stepDot} ${styles[`stepDot_${state}`]}`}>
                  {state === 'done' ? '✓' : step.id}
                </div>
                <span className={`${styles.stepLabel} ${styles[`stepLabel_${state}`]}`}>{step.label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`${styles.stepLine} ${step.id < currentStep ? styles.stepLineDone : ''}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Panel */}
        <div className={styles.panel}>

          {/* Step 1 — Upload */}
          {currentStep === 1 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Upload Documents</h2>
              <p className={styles.stepDesc}>Upload your reference procedure and optional corporate template. You can also paste text below.</p>

              <div className={styles.uploadGrid}>
                <div>
                  <label className={styles.fieldLabel}>Reference Procedure <span className={styles.optional}>(optional)</span></label>
                  <p className={styles.fieldHint}>Existing procedure to analyse or rewrite</p>
                  <div
                    className={`${styles.dropZone} ${referenceFile ? styles.dropZoneActive : ''}`}
                    onClick={() => refFileRef.current.click()}
                  >
                    <span className={styles.dropIcon}>📄</span>
                    <span className={styles.dropText}>{referenceFile ? referenceFile.name : 'Click to upload'}</span>
                    <span className={styles.dropSub}>DOCX, PDF, TXT — max 50MB</span>
                    {referenceFile && (
                      <button type="button" className={styles.removeBtn} onClick={e => { e.stopPropagation(); setReferenceFile(null); refFileRef.current.value = '' }}>
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <input ref={refFileRef} type="file" accept=".docx,.doc,.pdf,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) setReferenceFile(f) }} />
                </div>

                <div>
                  <label className={styles.fieldLabel}>Corporate Template <span className={styles.optional}>(optional)</span></label>
                  <p className={styles.fieldHint}>Branded DOCX template defining section structure</p>
                  <div
                    className={`${styles.dropZone} ${templateFile ? styles.dropZoneActive : ''}`}
                    onClick={() => tplFileRef.current.click()}
                  >
                    <span className={styles.dropIcon}>📝</span>
                    <span className={styles.dropText}>{templateFile ? templateFile.name : 'Click to upload'}</span>
                    <span className={styles.dropSub}>DOCX only</span>
                    {templateFile && (
                      <button type="button" className={styles.removeBtn} onClick={e => { e.stopPropagation(); setTemplateFile(null); tplFileRef.current.value = '' }}>
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <input ref={tplFileRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) setTemplateFile(f) }} />
                </div>
              </div>

              <div className={styles.pasteBlock}>
                <label className={styles.fieldLabel}>Or Paste Reference Text <span className={styles.optional}>(optional)</span></label>
                <textarea
                  className={styles.textarea}
                  rows={5}
                  placeholder="Paste extracted text from your reference document here…"
                  value={referenceText}
                  onChange={e => setReferenceText(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2 — Procedure Type */}
          {currentStep === 2 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Procedure Type</h2>
              <p className={styles.stepDesc}>Select the offshore construction document type to generate.</p>

              <div className={styles.typeGrid}>
                {PROCEDURE_TYPES.map(pt => (
                  <button
                    key={pt.id}
                    type="button"
                    className={`${styles.typeCard} ${documentType === pt.id ? styles.typeCardActive : ''}`}
                    onClick={() => setDocumentType(pt.id)}
                  >
                    <span className={styles.typeIcon}>{pt.icon}</span>
                    <span className={styles.typeLabel}>{pt.label}</span>
                  </button>
                ))}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Scope / Specific Focus <span className={styles.optional}>(optional)</span></label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder='e.g. "Section 4.2 — Cable Pulling Operations" or "DP operations for CSV Deep Pioneer during J-tube pull-in"'
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Corporate Template Rules <span className={styles.optional}>(optional)</span></label>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder='e.g. "Arial 11pt, navy #1a3c5e headers, A4 margins 25mm" — or leave blank for defaults'
                  value={templateRules}
                  onChange={e => setTemplateRules(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3 — Mode */}
          {currentStep === 3 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Generation Mode</h2>
              <p className={styles.stepDesc}>Choose how the AI should process your documents.</p>

              <div className={styles.modeGrid}>
                <button
                  type="button"
                  className={`${styles.modeCard} ${agentMode === 'REWRITE' ? styles.modeCardActive : ''} ${!referenceFile ? styles.modeCardDisabled : ''}`}
                  onClick={() => referenceFile && setAgentMode('REWRITE')}
                >
                  <span className={styles.modeIcon}>🔄</span>
                  <span className={styles.modeTitle}>Mirror Structure</span>
                  <span className={styles.modeDesc}>Rewrite the uploaded procedure into your template structure with modernised content.</span>
                  {!referenceFile && <span className={styles.modeRequires}>Requires a reference file in Step 1</span>}
                </button>

                <button
                  type="button"
                  className={`${styles.modeCard} ${agentMode === 'WRITER' ? styles.modeCardActive : ''}`}
                  onClick={() => setAgentMode('WRITER')}
                >
                  <span className={styles.modeIcon}>✍️</span>
                  <span className={styles.modeTitle}>Context Only</span>
                  <span className={styles.modeDesc}>Use reference as context to generate fresh, comprehensive procedure content.</span>
                </button>

                <button
                  type="button"
                  className={`${styles.modeCard} ${styles.modeCardWide} ${agentMode === 'GENERATE' ? styles.modeCardActive : ''} ${!referenceFile ? styles.modeCardDisabled : ''}`}
                  onClick={() => referenceFile && setAgentMode('GENERATE')}
                >
                  <span className={styles.modeIcon}>📋</span>
                  <span className={styles.modeTitle}>Generate Procedure</span>
                  <span className={styles.modeDesc}>
                    Analyse the reference document and generate a complete new procedure that matches its formatting style, level of detail, and approximate length — section for section.
                  </span>
                  {!referenceFile && <span className={styles.modeRequires}>Requires a reference file in Step 1</span>}
                </button>
              </div>

              {(agentMode === 'REWRITE' || agentMode === 'GENERATE') && !referenceFile && (
                <div className={styles.modeWarning}>
                  This mode requires a reference procedure file. Go back to Step 1 to upload one.
                </div>
              )}
            </div>
          )}

          {/* Step 4 — Generate */}
          {currentStep === 4 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Generating Procedure</h2>
              <p className={styles.stepDesc}>
                {documentType} &nbsp;·&nbsp; {agentMode === 'REWRITE' ? 'Mirror Structure' : agentMode === 'GENERATE' ? 'Generate Procedure' : 'Context Only'}
                {scope ? ` · ${scope}` : ''}
              </p>

              {error && (
                <div className={styles.errorBanner}>
                  ❌ {error}
                  <button className={styles.retryBtn} onClick={startGeneration}>Retry</button>
                </div>
              )}

              <div className={styles.stageList}>
                {GENERATION_STAGES.map((stage, i) => {
                  const isDone   = i < stageIndex || generationStage === 'complete'
                  const isActive = stage.id === generationStage && generationStage !== 'complete'
                  return (
                    <div key={stage.id} className={`${styles.stageItem} ${isDone ? styles.stageItemDone : isActive ? styles.stageItemActive : ''}`}>
                      <div className={styles.stageDot}>
                        {isDone ? '✓' : isActive ? <span className={styles.spinner}>◌</span> : '○'}
                      </div>
                      <div>
                        <div className={styles.stageLabel}>{stage.label}</div>
                        <div className={styles.stageDesc}>{stage.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${generationProgress}%` }} />
              </div>
              <div className={styles.progressPct}>{generationProgress}%</div>
            </div>
          )}

          {/* Step 5 — Review Flags */}
          {currentStep === 5 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Review Compliance Flags</h2>
              <p className={styles.stepDesc}>Safety-critical markers identified in your generated document.</p>

              {flags.length === 0 ? (
                <div className={styles.noFlags}>
                  ✅ No compliance flags identified — document appears complete.
                </div>
              ) : (
                <div className={styles.flagList}>
                  {flags.map((flag, i) => (
                    <div key={i} className={styles.flagItem} style={{ borderColor: flag.color }}>
                      <span className={styles.flagIcon}>{flag.icon}</span>
                      <div>
                        <div className={styles.flagLabel}>{flag.label}</div>
                        <div className={styles.flagCount}>{flag.count} instance{flag.count !== 1 ? 's' : ''} in document</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.flagNote}>
                <strong>Note:</strong> Review all flagged sections before distributing. Hold Points and Stop Work Criteria require sign-off from a Competent Person under LOLER/PUWER requirements.
              </div>
            </div>
          )}

          {/* Step 6 — Save */}
          {currentStep === 6 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>Save Document</h2>
              <p className={styles.stepDesc}>Your {documentType} is ready for download.</p>

              {output ? (
                <div className={styles.saveOptions}>
                  <button className={styles.downloadBtn} onClick={downloadDocx}>
                    📄 Download DOCX
                    <span className={styles.downloadFilename}>{output.filename}</span>
                  </button>
                  <button className={styles.newBtn} onClick={reset}>
                    + New Procedure
                  </button>
                </div>
              ) : (
                <div className={styles.errorBanner}>Document not ready — go back to Step 4 and regenerate.</div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className={styles.navButtons}>
            {currentStep > 1 && currentStep !== 4 && (
              <button className={styles.backBtn} onClick={goBack}>← Back</button>
            )}
            {currentStep === 4 && generationStage === 'idle' && (
              <button className={styles.backBtn} onClick={goBack}>← Back</button>
            )}

            {currentStep < 4 && (
              <button
                className={styles.nextBtn}
                onClick={goNext}
                disabled={!canAdvance()}
              >
                {currentStep === 3 ? '⚙️ Generate' : 'Next →'}
              </button>
            )}
            {currentStep === 4 && generationStage === 'complete' && (
              <button className={styles.nextBtn} onClick={() => setCurrentStep(5)}>
                Review Flags →
              </button>
            )}
            {currentStep === 5 && (
              <button className={styles.nextBtn} onClick={() => setCurrentStep(6)}>
                Save Document →
              </button>
            )}
          </div>

        </div>

        <footer className={styles.footer}>
          OffshoreAI · LOLER · PUWER · IMCA · DNV
        </footer>
      </main>
    </div>
  )
}
