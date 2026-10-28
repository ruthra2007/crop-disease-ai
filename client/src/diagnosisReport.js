import axios from 'axios'
import { cropFromClassName, formatDiseaseName, guideForClass } from './diseaseGuide'

function formatPercent(value) {
  return `${Math.round(value * 100)}%`
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The saved leaf image could not be read for the report.'))
    reader.readAsDataURL(blob)
  })
}

export async function downloadDiagnosisReport(record) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  let y = 20

  pdf.setTextColor(32, 58, 53)
  pdf.setFont('times', 'bold')
  pdf.setFontSize(23)
  pdf.text('CropAI', margin, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(102, 115, 109)
  pdf.text(`Diagnosis report · ${new Date().toLocaleDateString()}`, margin, y + 7)
  y += 17
  pdf.setDrawColor(217, 221, 210)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 10

  const addSection = (title, content) => {
    if (!content) return
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    const lines = pdf.splitTextToSize(content, contentWidth)
    if (y + lines.length * 5 + 18 > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(40, 91, 78)
    pdf.text(title.toUpperCase(), margin, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(32, 58, 53)
    pdf.text(lines, margin, y)
    y += lines.length * 5 + 6
  }

  if (record.image_url) {
    const imageResponse = await axios.get(record.image_url, { responseType: 'blob' })
    const imageData = await blobToDataUrl(imageResponse.data)
    const imageProperties = pdf.getImageProperties(imageData)
    const imageWidth = Math.min(contentWidth, 174)
    const imageHeight = Math.min(64, imageWidth / (imageProperties.width / imageProperties.height))
    if (y + imageHeight > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
    pdf.addImage(imageData, 'JPEG', margin, y, imageWidth, imageHeight, undefined, 'FAST')
    y += imageHeight + 9
  }

  addSection('Predicted crop', cropFromClassName(record.prediction))
  addSection('Predicted disease / class', formatDiseaseName(record.prediction))
  addSection('Model score', `${formatPercent(record.confidence)} · Raw softmax score; not statistically calibrated.`)

  if (record.top_predictions?.length) {
    addSection(
      'Top model outputs',
      record.top_predictions.slice(0, 3)
        .map((item, index) => `${index + 1}. ${formatDiseaseName(item.class_name)} — ${formatPercent(item.confidence)}`)
        .join('\n'),
    )
  }

  const guide = guideForClass(record.prediction)
  if (guide) {
    addSection('About this class', guide.description)
    addSection('General prevention guidance', guide.prevention)
  }
  if (record.model_version) addSection('Model version', record.model_version)

  addSection(
    'Important disclaimer',
    'This report contains a prediction from an AI image classifier. Predictions may be inaccurate and do not replace professional agricultural diagnosis. Confirm concerns with a qualified agronomist or local agricultural extension service.',
  )

  const safeName = formatDiseaseName(record.prediction)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const link = document.createElement('a')
  const reportUrl = URL.createObjectURL(pdf.output('blob'))
  link.href = reportUrl
  link.download = `cropai-report-${safeName || record.id}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(reportUrl), 1000)
}
