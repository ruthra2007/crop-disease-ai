const diseaseGuide = {
  Pepper__bell___Bacterial_spot: {
    description: 'Bacterial spot can cause small, dark, water-soaked lesions on pepper leaves and fruit.',
    prevention: 'Use clean seed and transplants, avoid working with wet foliage, remove infected debris, and rotate away from peppers and tomatoes.',
  },
  Pepper__bell___healthy: {
    description: 'The model matched this image to the healthy pepper-leaf class.',
    prevention: 'Continue regular scouting and use clean tools, balanced irrigation, and good airflow.',
  },
  Potato___Early_blight: {
    description: 'Early blight commonly causes brown leaf spots with concentric rings, often on older foliage.',
    prevention: 'Rotate crops, remove infected plant debris, avoid overhead watering, and maintain good airflow.',
  },
  Potato___Late_blight: {
    description: 'Late blight can develop rapidly, producing water-soaked lesions that may spread in cool, wet conditions.',
    prevention: 'Inspect plants frequently, avoid prolonged leaf wetness, remove infected material safely, and follow local extension guidance.',
  },
  Potato___healthy: {
    description: 'The model matched this image to the healthy potato-leaf class.',
    prevention: 'Continue regular scouting and use clean tools, balanced irrigation, and good airflow.',
  },
  Tomato_Early_blight: {
    description: 'Early blight often causes dark, target-like lesions and yellowing on older tomato leaves.',
    prevention: 'Rotate crops, remove infected debris, mulch to reduce soil splash, and water near the soil rather than over foliage.',
  },
  Tomato_Late_blight: {
    description: 'Late blight can cause fast-spreading, water-soaked lesions and may affect leaves, stems, and fruit.',
    prevention: 'Scout frequently, reduce leaf wetness, remove infected material, and seek local extension advice promptly.',
  },
  Tomato_Leaf_Mold: {
    description: 'Leaf mold is associated with humid conditions and may show pale areas above leaves with mold growth below.',
    prevention: 'Improve ventilation, avoid overhead irrigation, and remove infected leaves and crop debris.',
  },
  Tomato_healthy: {
    description: 'The model matched this image to the healthy tomato-leaf class.',
    prevention: 'Continue regular scouting and use clean tools, balanced irrigation, and good airflow.',
  },
}

export const MODEL_SCORE_THRESHOLDS = {
  high: 0.8,
  moderate: 0.5,
}

export function cropFromClassName(className = '') {
  if (className.startsWith('Tomato')) return 'Tomato'
  if (className.startsWith('Potato')) return 'Potato'
  if (className.startsWith('Pepper')) return 'Pepper'
  return 'Unknown crop'
}

export function guideForClass(className) {
  return diseaseGuide[className] || null
}

export function scoreDescription(score) {
  if (score >= MODEL_SCORE_THRESHOLDS.high) return 'High model score'
  if (score >= MODEL_SCORE_THRESHOLDS.moderate) return 'Moderate model score'
  return 'Low model score'
}

export function formatDiseaseName(className = '') {
  return className
    .replaceAll('___', ' / ')
    .replaceAll('__', ' / ')
    .replaceAll('_', ' ')
}
