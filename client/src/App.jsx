import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { downloadDiagnosisReport } from './diagnosisReport'
import {
  cropFromClassName,
  formatDiseaseName,
  guideForClass,
  scoreDescription,
} from './diseaseGuide'
import './App.css'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const UNKNOWN_LABEL = '__unknown__'
const Dashboard = lazy(() => import('./Dashboard'))

function formatClassName(className) {
  return formatDiseaseName(className)
}

function percentage(value) {
  return `${Math.round(value * 100)}%`
}

function formatReviewedLabel(label) {
  return label === UNKNOWN_LABEL ? 'Unknown / new disease' : formatClassName(label)
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInput = useRef(null)
  const previewUrlRef = useRef('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [result, setResult] = useState(null)
  const [recentPredictions, setRecentPredictions] = useState([])
  const [classNames, setClassNames] = useState([])
  const [labelDrafts, setLabelDrafts] = useState({})
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [crop, setCrop] = useState('auto')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [savingReviewId, setSavingReviewId] = useState('')
  const [owner, setOwner] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historySearch, setHistorySearch] = useState('')
  const [cropFilter, setCropFilter] = useState('all')
  const [diseaseFilter, setDiseaseFilter] = useState('all')
  const [dateSort, setDateSort] = useState('newest')
  const [selectedPrediction, setSelectedPrediction] = useState(null)
  const [reportError, setReportError] = useState('')
  const [reportPending, setReportPending] = useState(false)

  useEffect(() => {
    let active = true

    axios.get('/api/auth/session')
      .then((response) => {
        if (active) setOwner(response.data.owner)
      })
      .catch((requestError) => {
        if (active && requestError.response?.status !== 401) {
          setLoginError(requestError.response?.data?.message || 'Could not connect to the CropAI server.')
        }
      })
      .finally(() => {
        if (active) setSessionLoading(false)
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!owner) return undefined
    let active = true
    const sort = dateSort
    const params = new URLSearchParams({ sort })
    if (historySearch.trim()) params.set('search', historySearch.trim())
    if (cropFilter !== 'all') params.set('crop', cropFilter)
    if (diseaseFilter !== 'all') params.set('disease', diseaseFilter)

    const timeout = setTimeout(() => {
      axios.get(`/api/predictions?${params.toString()}`)
        .then((response) => {
          if (active) {
            setRecentPredictions(response.data.predictions)
            setHistoryError('')
          }
        })
        .catch((requestError) => {
          if (active) {
            setHistoryError(requestError.response?.data?.message || 'Saved analyses could not be loaded.')
          }
        })
        .finally(() => {
          if (active) setHistoryLoading(false)
        })
    }, historySearch ? 180 : 0)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [owner, historySearch, cropFilter, diseaseFilter, dateSort])

  useEffect(() => {
    if (!owner) return undefined
    let active = true
    axios.get('/api/predictions/classes')
      .then((response) => {
        if (active) {
          setClassNames(response.data.classes)
          setHistoryError('')
        }
      })
      .catch((requestError) => {
        if (active) setHistoryError(requestError.response?.data?.message || 'Review labels could not be loaded.')
      })
    return () => { active = false }
  }, [owner])

  useEffect(() => {
    function pasteImage(event) {
      const imageItem = Array.from(event.clipboardData?.items || [])
        .find((item) => item.kind === 'file' && ACCEPTED_TYPES.includes(item.type))
      const pastedImage = imageItem?.getAsFile()
      if (!pastedImage) return

      event.preventDefault()
      chooseFile(pastedImage)
    }

    window.addEventListener('paste', pasteImage)
    return () => window.removeEventListener('paste', pasteImage)
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    setLoginPending(true)
    setLoginError('')
    try {
      const response = await axios.post('/api/auth/login', {
        email: loginEmail,
        password: loginPassword,
      })
      setOwner(response.data.owner)
      setLoginPassword('')
      setLoginError('')
    } catch (requestError) {
      setLoginError(requestError.response?.data?.message || 'Sign-in failed. Check the server and try again.')
    } finally {
      setLoginPending(false)
    }
  }

  async function handleLogout() {
    try {
      await axios.post('/api/auth/logout')
      setOwner(null)
      setRecentPredictions([])
      setResult(null)
      setSelectedPrediction(null)
      setHistoryError('')
      navigate('/')
    } catch (requestError) {
      setHistoryError(requestError.response?.data?.message || 'Could not sign out. Try again.')
    }
  }

  function chooseFile(nextFile) {
    if (!nextFile) return
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setError('Choose a JPG, PNG, or WebP photo.')
      return
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('That photo is larger than 8 MB. Choose a smaller image.')
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = URL.createObjectURL(nextFile)
    setPreviewUrl(previewUrlRef.current)
    setFile(nextFile)
    setResult(null)
    setError('')
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  async function saveReview(prediction) {
    const label = labelDrafts[prediction.id] || prediction.reviewed_label || prediction.prediction
    setSavingReviewId(prediction.id)
    setHistoryError('')

    try {
      const response = await axios.patch(`/api/predictions/${prediction.id}/label`, { label })
      const reviewedPrediction = response.data.prediction
      setRecentPredictions((current) => current.map((item) => (
        item.id === prediction.id ? reviewedPrediction : item
      )))
      setLabelDrafts((current) => {
        const next = { ...current }
        delete next[prediction.id]
        return next
      })
      if (result?.id === prediction.id) setResult(reviewedPrediction)
    } catch (requestError) {
      setHistoryError(
        requestError.response?.data?.message || 'Could not save this label. Please try again.',
      )
    } finally {
      setSavingReviewId('')
    }
  }

  async function downloadReport(prediction) {
    setReportError('')
    setReportPending(true)
    try {
      await downloadDiagnosisReport(prediction)
    } catch (requestError) {
      setReportError(requestError.response?.data?.message || requestError.message || 'Could not create the report.')
    } finally {
      setReportPending(false)
    }
  }

  async function deletePrediction(prediction) {
    const confirmed = window.confirm(
      `Delete the saved analysis for "${formatClassName(prediction.prediction)}" and its image? This cannot be undone.`,
    )
    if (!confirmed) return

    setHistoryError('')
    try {
      await axios.delete(`/api/predictions/${prediction.id}`)
      setRecentPredictions((current) => current.filter((item) => item.id !== prediction.id))
      if (result?.id === prediction.id) setResult(null)
      if (selectedPrediction?.id === prediction.id) setSelectedPrediction(null)
    } catch (requestError) {
      setHistoryError(requestError.response?.data?.message || 'Could not delete the saved analysis.')
    }
  }

  function exportHistoryCsv() {
    const rows = [
      ['Created at', 'Crop', 'Original prediction', 'Model score', 'Review status', 'Reviewed label'],
      ...recentPredictions.map((prediction) => [
        prediction.created_at,
        cropFromClassName(prediction.prediction),
        prediction.prediction,
        prediction.confidence,
        prediction.review_status,
        prediction.reviewed_label || '',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((value) => (
      `"${String(value ?? '').replaceAll('"', '""')}"`
    )).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'cropai-prediction-history.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function analyzePhoto(event) {
    event.preventDefault()
    if (!file || isLoading) return

    setIsLoading(true)
    setError('')
    const payload = new FormData()
    payload.append('image', file)
    payload.append('crop', crop)

    try {
      const response = await axios.post('/api/predict', payload)
      setResult(response.data)
      setRecentPredictions((current) => [
        response.data,
        ...current.filter((prediction) => prediction.id !== response.data.id),
      ].slice(0, 100))
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          || 'The model could not analyze this photo. Check that the prediction service is running.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  function resetAnalysis() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewUrl('')
    setFile(null)
    setResult(null)
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  if (sessionLoading) {
    return <main className="app-shell"><p className="auth-message">Connecting to your private CropAI workspace…</p></main>
  }

  if (!owner) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-card">
          <a className="brand auth-brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>
            <span className="brand-mark" aria-hidden="true">C</span><span>CropAI</span>
          </a>
          <p className="eyebrow">PRIVATE FIELD WORKSPACE</p>
          <h1>Sign in to CropAI</h1>
          <p>Use the owner account configured in the backend environment.</p>
          <form className="auth-form" onSubmit={handleLogin}>
            <label>Email<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
            {loginError && <p className="error-message" role="alert">{loginError}</p>}
            <button className="analyze-button" type="submit" disabled={loginPending}>
              {loginPending ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }} aria-label="CropAI home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>CropAI</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button type="button" className={location.pathname === '/dashboard' ? 'nav-link is-active' : 'nav-link'} onClick={() => { setSelectedPrediction(null); navigate('/dashboard') }}>Dashboard</button>
          <button type="button" className={location.pathname !== '/dashboard' ? 'nav-link is-active' : 'nav-link'} onClick={() => { setSelectedPrediction(null); navigate('/') }}>Analyze</button>
        </nav>
        <div className="account-actions">
          <span className="model-status"><span className="status-dot" /> CNN MODEL / 09 CLASSES</span>
          <button type="button" className="text-button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className="workspace" id="top">
        {location.pathname === '/dashboard' ? (
          <Suspense fallback={<p className="dashboard-state">Loading dashboard…</p>}>
            <Dashboard
              onDetails={setSelectedPrediction}
              onAnalyzeNew={() => { setSelectedPrediction(null); navigate('/') }}
              onViewHistory={() => {
                setSelectedPrediction(null)
                navigate('/')
                window.setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' }), 0)
              }}
            />
          </Suspense>
        ) : (
          <>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">FIELD DIAGNOSTICS <span>01 / LEAF HEALTH</span></p>
          <div className="intro-row">
            <h1 id="page-title">A clearer read<br />on crop health.</h1>
            <p className="intro-copy">
              Check a leaf photo against nine pepper, potato, and tomato conditions.
              Keep the leaf in focus and use even, natural light.
            </p>
          </div>
        </section>

        <form className="analysis-grid" onSubmit={analyzePhoto}>
          <section className="upload-panel" aria-labelledby="upload-heading">
            <div className="panel-heading">
              <span className="step-number">01</span>
              <div>
                <p className="panel-kicker">IMAGE INPUT</p>
                <h2 id="upload-heading">Choose a leaf photo</h2>
              </div>
            </div>

            <label className="crop-control">
              <span>Plant type</span>
              <select value={crop} onChange={(event) => setCrop(event.target.value)}>
                <option value="auto">Auto-detect all crops</option>
                <option value="tomato">Tomato</option>
                <option value="potato">Potato</option>
                <option value="pepper">Pepper</option>
              </select>
            </label>

            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <div
              className={`dropzone${isDragging ? ' is-dragging' : ''}${previewUrl ? ' has-preview' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Choose or paste a crop leaf photo"
              onClick={() => fileInput.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileInput.current?.click()
                }
              }}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
              }}
              onDrop={handleDrop}
            >
              {previewUrl ? (
                <img className="photo-preview" src={previewUrl} alt="Selected crop leaf" />
              ) : (
                <div className="dropzone-prompt">
                  <span className="upload-mark" aria-hidden="true">↑</span>
                  <p className="dropzone-title">Drop a photo here</p>
                  <p className="dropzone-caption">JPG, PNG, or WebP · up to 8 MB</p>
                  <p className="dropzone-caption">Click, drop, or paste an image (Ctrl+V)</p>
                </div>
              )}
            </div>

            <div className="upload-controls">
              <div className="file-details" aria-live="polite">
                <span className="file-indicator" />
                <span>{file ? file.name : 'No photo selected'}</span>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                Browse photos
              </button>
            </div>

            <button className="analyze-button" type="submit" disabled={!file || isLoading}>
              {isLoading ? <><span className="spinner" /> Reading leaf...</> : 'Analyze photo'}
              {!isLoading && <span aria-hidden="true">→</span>}
            </button>
            {error && <p className="error-message" role="alert">{error}</p>}
          </section>

          <section className="result-panel" aria-labelledby="result-heading" aria-live="polite">
            <div className="panel-heading">
              <span className="step-number step-number-olive">02</span>
              <div>
                <p className="panel-kicker">MODEL READOUT</p>
                <h2 id="result-heading">{result ? 'Prediction' : 'Your result appears here'}</h2>
              </div>
              {result && (
                <button className="text-button result-reset" type="button" onClick={resetAnalysis}>
                  Analyze Another Image
                </button>
              )}
            </div>

            {result ? (
              <div className="result-content">
                <p className="result-label">TOP MATCH</p>
                <span className={`review-badge${result.is_uncertain ? ' is-uncertain' : ''}`}>
                  {result.review_status !== 'pending'
                    ? `REVIEWED · ${formatReviewedLabel(result.reviewed_label)}`
                    : (result.confidence < 0.5 || result.reviewed_label === UNKNOWN_LABEL ? 'LOW MODEL SCORE · REVIEW NEEDED' : 'PROVISIONAL AI LABEL')}
                </span>
                <p className={`score-guidance score-${scoreDescription(result.confidence).split(' ')[0].toLowerCase()}`}>
                  {cropFromClassName(result.prediction)} · {scoreDescription(result.confidence)}
                </p>
                <h3>{formatClassName(result.prediction)}</h3>
                <div className="confidence-row">
                  <span>Model score · provisional guidance</span>
                  <strong>{percentage(result.confidence)}</strong>
                </div>
                <div className={`confidence-track score-${scoreDescription(result.confidence).split(' ')[0].toLowerCase()}`} role="meter" aria-label="Model score guidance, not calibrated confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(result.confidence * 100)}>
                  <span style={{ width: percentage(result.confidence) }} />
                </div>
                <div className="alternatives-heading">
                  <span>TOP MODEL OUTPUTS</span>
                  <span>SCORE</span>
                </div>
                <ol className="prediction-list">
                  {result.top_predictions.slice(0, 3).map((prediction, index) => (
                    <li key={prediction.class_name}>
                      <span className="prediction-rank">0{index + 1}</span>
                      <span className="prediction-name">{formatClassName(prediction.class_name)}</span>
                      <strong>{percentage(prediction.confidence)}</strong>
                    </li>
                  ))}
                </ol>
                {guideForClass(result.prediction) && (
                  <div className="disease-guidance">
                    <h4>About this class</h4>
                    <p>{guideForClass(result.prediction).description}</p>
                    <h4>General prevention</h4>
                    <p>{guideForClass(result.prediction).prevention}</p>
                  </div>
                )}
                <p className="model-disclaimer">
                  {result.crop_filter !== 'auto' && 'Ranked within the selected crop; the score is not renormalized. '}
                  These display bands are provisional guidance, not validated calibration. Softmax scores may not reflect real-world accuracy. The model only covers nine trained classes; verify results with a local agricultural professional.
                </p>
                {reportError && <p className="error-message" role="alert">{reportError}</p>}
                <button className="report-button" type="button" disabled={reportPending} onClick={() => downloadReport(result)}>{reportPending ? 'Preparing report…' : 'Download Report'}</button>
              </div>
            ) : (
              <div className={`result-empty${isLoading ? ' is-loading' : ''}`}>
                <span className="result-orbit" aria-hidden="true"><span /></span>
                <p>{isLoading ? 'Comparing leaf patterns' : 'Waiting for an image'}</p>
                <span className="empty-rule" />
                <span className="empty-caption">PEPPER · POTATO · TOMATO</span>
              </div>
            )}
          </section>
        </form>

        <section className="recent-section" id="history" aria-labelledby="recent-heading">
          <div className="recent-heading-row">
            <div>
              <p className="panel-kicker">PRIVATE MONGODB HISTORY + LOCAL IMAGE ARCHIVE</p>
              <h2 id="recent-heading">Analysis history</h2>
            </div>
            <div className="history-actions">
              <span className="recent-count">{recentPredictions.length} RECORDS</span>
              <button className="text-button" type="button" disabled={!recentPredictions.length} onClick={exportHistoryCsv}>Export CSV</button>
            </div>
          </div>
          <div className="history-filters">
            <label className="history-search">Search crop or disease
              <input type="search" value={historySearch} onChange={(event) => { setHistoryLoading(true); setHistorySearch(event.target.value) }} placeholder="e.g. tomato, blight" />
            </label>
            <label>Crop
              <select value={cropFilter} onChange={(event) => { setHistoryLoading(true); setCropFilter(event.target.value) }}>
                <option value="all">All crops</option><option value="tomato">Tomato</option><option value="potato">Potato</option><option value="pepper">Pepper</option>
              </select>
            </label>
            <label>Disease
              <select value={diseaseFilter} onChange={(event) => { setHistoryLoading(true); setDiseaseFilter(event.target.value) }}>
                <option value="all">All classes</option>
                {classNames.map((className) => <option key={className} value={className}>{formatClassName(className)}</option>)}
              </select>
            </label>
            <label>Sort
              <select value={dateSort} onChange={(event) => { setHistoryLoading(true); setDateSort(event.target.value) }}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="confidence_high">Highest score</option>
                <option value="confidence_low">Lowest score</option>
              </select>
            </label>
          </div>
          {historyError && <p className="error-message" role="alert">{historyError}</p>}
          {historyLoading ? (
            <p className="history-empty" role="status">Loading your saved analyses…</p>
          ) : recentPredictions.length === 0 ? (
            <p className="history-empty">No matching analyses. New users will see their saved leaf photos here.</p>
          ) : (
            <ol className="recent-list">
              {recentPredictions.map((prediction) => (
                <li key={prediction.id}>
                  {prediction.image_url ? (
                    <img className="history-thumbnail" src={prediction.image_url} alt={`Saved leaf for ${formatClassName(prediction.prediction)}`} loading="lazy" />
                  ) : (
                    <span className="history-thumbnail history-thumbnail-missing" aria-label="Image unavailable">—</span>
                  )}
                  <div className="history-record">
                    <div className="history-record-heading">
                      <div className="recent-record-name">
                        <strong>{formatClassName(prediction.prediction)}</strong>
                        <span>{cropFromClassName(prediction.prediction)} · {new Date(prediction.created_at).toLocaleString()}</span>
                      </div>
                      <span className="recent-score">{percentage(prediction.confidence)}</span>
                    </div>
                    <div className="history-status-row">
                      <span className={`review-badge${prediction.is_uncertain ? ' is-uncertain' : ''}`}>
                        {prediction.review_status === 'pending'
                          ? (prediction.confidence < 0.5 || prediction.reviewed_label === UNKNOWN_LABEL ? 'LOW MODEL SCORE · NEEDS REVIEW' : 'PROVISIONAL · NEEDS REVIEW')
                          : `${prediction.review_status === 'corrected' ? 'REVIEWED' : 'CONFIRMED'}: ${formatReviewedLabel(prediction.reviewed_label)}`}
                      </span>
                    </div>
                    {classNames.length > 0 && (
                      <div className="review-controls">
                        <label>
                          <span>Confirm or correct label</span>
                          <select value={labelDrafts[prediction.id] || prediction.reviewed_label || prediction.prediction} onChange={(event) => setLabelDrafts((current) => ({ ...current, [prediction.id]: event.target.value }))}>
                            {classNames.map((className) => <option key={className} value={className}>{formatClassName(className)}</option>)}
                            <option value={UNKNOWN_LABEL}>Unknown / new disease</option>
                          </select>
                        </label>
                        <button type="button" className="review-save-button" disabled={savingReviewId === prediction.id} onClick={() => saveReview(prediction)}>
                          {savingReviewId === prediction.id ? 'Saving…' : (prediction.review_status === 'pending' ? 'Save label' : 'Update label')}
                        </button>
                      </div>
                    )}
                    <div className="history-record-actions">
                      <button className="text-button" type="button" onClick={() => setSelectedPrediction(prediction)}>Details</button>
                      <button className="text-button" type="button" disabled={reportPending} onClick={() => downloadReport(prediction)}>{reportPending ? 'Preparing report…' : 'Download report'}</button>
                      <button className="text-button destructive-button" type="button" onClick={() => deletePrediction(prediction)}>Delete</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {reportError && <p className="error-message" role="alert">{reportError}</p>}
        </section>

        <footer className="page-footer">
          <span>CropAI <span className="footer-divider">/</span> FIELD MODEL</span>
          <span>AI predictions can be inaccurate · Not a confirmed diagnosis</span>
        </footer>
          </>
        )}
        {selectedPrediction && (
          <PredictionDetails
            prediction={selectedPrediction}
            onClose={() => setSelectedPrediction(null)}
            onDownload={() => downloadReport(selectedPrediction)}
            downloadPending={reportPending}
            reportError={reportError}
          />
        )}
      </div>
    </main>
  )
}

export default App

function PredictionDetails({ prediction, onClose, onDownload, downloadPending, reportError }) {
  const guide = guideForClass(prediction.prediction)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="prediction-modal" role="dialog" aria-modal="true" aria-labelledby="prediction-detail-title">
        <div className="prediction-modal-heading">
          <div>
            <p className="panel-kicker">SAVED PREDICTION DETAIL</p>
            <h2 id="prediction-detail-title">{formatClassName(prediction.prediction)}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close details">×</button>
        </div>
        {prediction.image_url && <img className="detail-image" src={prediction.image_url} alt={`Analyzed crop leaf for ${formatClassName(prediction.prediction)}`} />}
        <dl className="detail-facts">
          <div><dt>Predicted crop</dt><dd>{cropFromClassName(prediction.prediction)}</dd></div>
          <div><dt>Original model class</dt><dd>{formatClassName(prediction.prediction)}</dd></div>
          <div><dt>Model score</dt><dd>{percentage(prediction.confidence)} · {scoreDescription(prediction.confidence)}</dd></div>
          <div><dt>Analyzed</dt><dd>{new Date(prediction.created_at).toLocaleString()}</dd></div>
          <div><dt>Review status</dt><dd>{prediction.review_status === 'pending' ? 'Provisional, awaiting review' : `${prediction.review_status}: ${formatReviewedLabel(prediction.reviewed_label)}`}</dd></div>
        </dl>
        {prediction.top_predictions?.length > 0 && (
          <div className="detail-subsection">
            <h3>Top model outputs</h3>
            <ol className="detail-top-list">
              {prediction.top_predictions.slice(0, 3).map((item) => (
                <li key={item.class_name}><span>{formatClassName(item.class_name)}</span><strong>{percentage(item.confidence)}</strong></li>
              ))}
            </ol>
          </div>
        )}
        {guide && (
          <div className="detail-subsection">
            <h3>About this class</h3><p>{guide.description}</p>
            <h3>General prevention</h3><p>{guide.prevention}</p>
          </div>
        )}
        <p className="model-disclaimer">AI model output may be inaccurate and is not a confirmed diagnosis. Consult a qualified agricultural professional.</p>
        <div className="modal-actions">
          <button className="report-button" type="button" disabled={downloadPending} onClick={onDownload}>{downloadPending ? 'Preparing report…' : 'Download Report'}</button>
          <button className="review-save-button" type="button" onClick={onClose}>Close</button>
        </div>
        {reportError && <p className="error-message" role="alert">{reportError}</p>}
      </section>
    </div>
  )
}
