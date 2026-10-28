import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cropFromClassName, formatDiseaseName } from './diseaseGuide'

function formatPercent(value) {
  return `${Math.round(value * 100)}%`
}

function formatDay(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })
}

function Dashboard({ onDetails, onAnalyzeNew, onViewHistory }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    axios.get('/api/dashboard/stats')
      .then((response) => {
        if (active) setStats(response.data)
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.message || 'Dashboard statistics could not be loaded.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const recentRecords = stats?.recentPredictions || []
  const distribution = stats?.diseaseDistribution || []

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">FIELD OVERVIEW <span>02 / YOUR DATA</span></p>
          <h1 id="dashboard-title">Crop health dashboard</h1>
          <p className="dashboard-intro">A summary of your saved model predictions. Model scores are estimates, not calibrated probabilities.</p>
        </div>
        <button className="dashboard-action" type="button" onClick={onAnalyzeNew}>
          Analyze New Leaf <span aria-hidden="true">→</span>
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {loading ? (
        <p className="dashboard-state" role="status">Loading your dashboard…</p>
      ) : stats ? (
        <>
          <div className="dashboard-stat-grid">
            <article className="dashboard-stat-card"><span>Total predictions</span><strong>{stats.totalPredictions}</strong><small>Saved analyses</small></article>
            <article className="dashboard-stat-card"><span>Healthy predictions</span><strong>{stats.healthyPredictions}</strong><small>Original model outputs</small></article>
            <article className="dashboard-stat-card"><span>Diseased predictions</span><strong>{stats.diseasedPredictions}</strong><small>Original model outputs</small></article>
            <article className="dashboard-stat-card"><span>Average model score</span><strong>{stats.averageConfidence == null ? '—' : formatPercent(stats.averageConfidence)}</strong><small>Not statistically calibrated</small></article>
          </div>

          {stats.totalPredictions === 0 ? (
            <div className="dashboard-empty">
              <span className="result-orbit" aria-hidden="true"><span /></span>
              <h2>No analyses yet</h2>
              <p>Analyze a leaf to start building your dashboard and history.</p>
            </div>
          ) : (
            <>
              <div className="dashboard-chart-grid">
                <article className="dashboard-card">
                  <div className="dashboard-card-heading"><div><p className="panel-kicker">LAST SEVEN DAYS</p><h2>Prediction activity</h2></div></div>
                  <div className="chart-frame">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.weeklyActivity} margin={{ top: 8, right: 8, left: -20, bottom: 2 }}>
                        <CartesianGrid stroke="#e3e6dc" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <Tooltip labelFormatter={(value) => new Date(`${value}T00:00:00Z`).toLocaleDateString()} />
                        <Bar dataKey="count" name="Predictions" fill="#47735d" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
                <article className="dashboard-card">
                  <div className="dashboard-card-heading"><div><p className="panel-kicker">MODEL OUTPUTS</p><h2>Disease distribution</h2></div></div>
                  {distribution.length ? (
                    <div className="chart-frame">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={distribution} dataKey="count" nameKey="disease" innerRadius={48} outerRadius={83} paddingAngle={2}>
                            {distribution.map((entry, index) => (
                              <Cell key={entry.disease} fill={['#47735d', '#a2ad75', '#d49a66', '#788e83', '#c77557'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, _name, item) => [value, formatDiseaseName(item.payload.disease)]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="chart-empty">No disease-class predictions are available.</p>}
                  <ul className="distribution-legend">
                    {distribution.slice(0, 6).map((entry) => (
                      <li key={entry.disease}><span>{formatDiseaseName(entry.disease)}</span><strong>{entry.count}</strong></li>
                    ))}
                  </ul>
                </article>
              </div>

              <article className="dashboard-card dashboard-recent-card">
                <div className="dashboard-card-heading">
                  <div><p className="panel-kicker">YOUR SAVED RECORDS</p><h2>Recent predictions</h2></div>
                  <button className="text-button" type="button" onClick={onViewHistory}>View history</button>
                </div>
                {recentRecords.length ? (
                  <ol className="dashboard-recent-list">
                    {recentRecords.map((record) => (
                      <li key={record.id}>
                        <div><strong>{formatDiseaseName(record.prediction)}</strong><span>{cropFromClassName(record.prediction)} · {new Date(record.created_at).toLocaleString()}</span></div>
                        <button type="button" className="text-button" onClick={() => onDetails(record)}>Details · {formatPercent(record.confidence)}</button>
                      </li>
                    ))}
                  </ol>
                ) : <p className="chart-empty">No saved predictions yet.</p>}
              </article>
            </>
          )}
        </>
      ) : null}
    </section>
  )
}

export default Dashboard
