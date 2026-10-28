const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const sharp = require('sharp');
const modelInference = require('../services/modelInference');
const Prediction = require('../models/Prediction');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
const modelClasses = require('../../ml/output/class_names.json');
const unknownLabel = '__unknown__';
const uncertainConfidenceThreshold = 0.5;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const acceptedCrops = new Set(['auto', 'tomato', 'potato', 'pepper']);
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (request, file, callback) => {
    if (!acceptedTypes.has(file.mimetype)) {
      callback(new Error('Upload a JPG, PNG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
}).single('image');

function parseImage(request, response, next) {
  uploadImage(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 8 MB or smaller.'
          : 'Upload one image at a time.',
      });
      return;
    }
    if (error) {
      response.status(400).json({ message: error.message });
      return;
    }
    next();
  });
}

async function predictImage(request, response, next) {
  if (!request.file) {
    response.status(400).json({ message: 'Choose an image to analyze.' });
    return;
  }

  const crop = request.body?.crop || 'auto';
  if (!acceptedCrops.has(crop)) {
    response.status(400).json({ message: 'Choose auto-detect, tomato, potato, or pepper.' });
    return;
  }

  let savedImagePath;
  try {
    const result = await modelInference.predict(request.file.buffer, crop);
    const imageBuffer = await sharp(request.file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();
    const imageFilename = `${randomUUID()}.jpg`;
    savedImagePath = path.join(uploadDirectory, imageFilename);
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(savedImagePath, imageBuffer, { flag: 'wx' });

    const prediction = await Prediction.create({
      ownerId: request.ownerId,
      prediction: result.prediction,
      confidence: result.confidence,
      cropFilter: result.crop_filter || crop,
      topPredictions: result.top_predictions.map(({ class_name, confidence }) => ({
        className: class_name,
        confidence,
      })),
      imageFilename,
      imageMimeType: 'image/jpeg',
      imageSizeBytes: imageBuffer.length,
      isUncertain: result.confidence < uncertainConfidenceThreshold,
      reviewStatus: 'pending',
    });

    response.status(200).json({
      ...serializePrediction(prediction),
      top_predictions: result.top_predictions,
    });
  } catch (error) {
    if (savedImagePath) {
      try {
        await fs.unlink(savedImagePath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Could not remove an unrecorded crop image:', cleanupError.message);
        }
      }
    }
    next(error);
  }
}

function serializePrediction(prediction) {
  const id = String(prediction._id || prediction.id);
  return {
    id,
    prediction: prediction.prediction,
    confidence: prediction.confidence,
    crop_filter: prediction.cropFilter,
    top_predictions: prediction.topPredictions.map(({ className, confidence }) => ({
      class_name: className,
      confidence,
    })),
    image_url: prediction.imageFilename ? `/api/predictions/${id}/image` : null,
    is_uncertain: Boolean(prediction.isUncertain),
    review_status: prediction.reviewStatus || 'pending',
    reviewed_label: prediction.reviewedLabel || null,
    created_at: prediction.createdAt.toISOString(),
  };
}

function predictionSelection() {
  return 'prediction confidence cropFilter topPredictions imageFilename isUncertain reviewStatus reviewedLabel reviewedAt createdAt';
}

async function getRecentPredictions(request, response, next) {
  try {
    const predictions = await Prediction.find()
      .where({ ownerId: request.ownerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .select(predictionSelection())
      .lean();

    response.status(200).json({
      predictions: predictions.map(serializePrediction),
    });
  } catch (error) {
    next(error);
  }
}

async function getPredictionHistory(request, response, next) {
  const filters = [];
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const crop = typeof request.query.crop === 'string' ? request.query.crop : '';
  const disease = typeof request.query.disease === 'string' ? request.query.disease : '';
  const sort = typeof request.query.sort === 'string' ? request.query.sort : 'newest';

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.push({ $or: [
      { prediction: { $regex: escapedSearch, $options: 'i' } },
      { cropFilter: { $regex: escapedSearch, $options: 'i' } },
    ] });
  }
  if (crop && ['tomato', 'potato', 'pepper'].includes(crop)) {
    filters.push({
      prediction: { $regex: crop === 'pepper' ? '^Pepper__bell___' : `^${crop}`, $options: 'i' },
    });
  }
  if (disease) {
    const escapedDisease = disease.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.push({ prediction: { $regex: `^${escapedDisease}$`, $options: 'i' } });
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    confidence_high: { confidence: -1, createdAt: -1 },
    confidence_low: { confidence: 1, createdAt: -1 },
  };

  try {
    const filter = { ownerId: request.ownerId };
    if (filters.length) filter.$and = filters;
    const predictions = await Prediction.find(filter)
      .sort(sortOptions[sort] || sortOptions.newest)
      .select(predictionSelection())
      .lean();
    response.status(200).json({ predictions: predictions.map(serializePrediction) });
  } catch (error) {
    next(error);
  }
}

async function getDashboardStats(request, response, next) {
  try {
    const records = await Prediction.find({ ownerId: request.ownerId })
      .select(predictionSelection())
      .sort({ createdAt: -1 })
      .lean();
    const healthyCount = records.filter((record) => record.prediction.toLowerCase().endsWith('healthy')).length;
    const confidenceAverage = records.length
      ? records.reduce((total, record) => total + record.confidence, 0) / records.length
      : null;

    const firstDay = new Date();
    firstDay.setUTCHours(0, 0, 0, 0);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);
    const activityByDay = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(firstDay);
      day.setUTCDate(firstDay.getUTCDate() + offset);
      activityByDay.set(day.toISOString().slice(0, 10), 0);
    }
    const diseaseCounts = new Map();
    for (const record of records) {
      const day = record.createdAt.toISOString().slice(0, 10);
      if (activityByDay.has(day)) activityByDay.set(day, activityByDay.get(day) + 1);
      if (!record.prediction.toLowerCase().endsWith('healthy')) {
        diseaseCounts.set(record.prediction, (diseaseCounts.get(record.prediction) || 0) + 1);
      }
    }

    response.status(200).json({
      totalPredictions: records.length,
      healthyPredictions: healthyCount,
      diseasedPredictions: records.length - healthyCount,
      averageConfidence: confidenceAverage,
      weeklyActivity: Array.from(activityByDay, ([date, count]) => ({ date, count })),
      diseaseDistribution: Array.from(diseaseCounts, ([disease, count]) => ({ disease, count }))
        .sort((left, right) => right.count - left.count),
      recentPredictions: records.slice(0, 5).map(serializePrediction),
    });
  } catch (error) {
    next(error);
  }
}

async function getPredictionClasses(request, response) {
  response.status(200).json({ classes: modelClasses, unknownLabel });
}

async function reviewPrediction(request, response, next) {
  const { id } = request.params;
  const { label } = request.body || {};
  if (!/^[a-f\d]{24}$/i.test(id)) {
    response.status(404).json({ message: 'Prediction not found.' });
    return;
  }
  if (label !== unknownLabel && !modelClasses.includes(label)) {
    response.status(400).json({ message: 'Choose a label from the model classes.' });
    return;
  }

  try {
    const prediction = await Prediction.findOne({ _id: id, ownerId: request.ownerId });
    if (!prediction) {
      response.status(404).json({ message: 'Prediction not found.' });
      return;
    }

    prediction.reviewedLabel = label;
    prediction.reviewStatus = label === prediction.prediction ? 'confirmed' : 'corrected';
    prediction.isUncertain = prediction.confidence < uncertainConfidenceThreshold || label === unknownLabel;
    prediction.reviewedAt = new Date();
    await prediction.save();
    response.status(200).json({ prediction: serializePrediction(prediction) });
  } catch (error) {
    next(error);
  }
}

async function getPredictionImage(request, response, next) {
  const { id } = request.params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    response.status(404).json({ message: 'Image not found.' });
    return;
  }

  try {
    const prediction = await Prediction.findOne({ _id: id, ownerId: request.ownerId }).select('imageFilename');
    if (!prediction?.imageFilename || !/^[a-f\d-]{36}\.jpg$/i.test(prediction.imageFilename)) {
      response.status(404).json({ message: 'Image not found.' });
      return;
    }

    response.type('image/jpeg');
    response.set('Cache-Control', 'private, max-age=3600');
    response.sendFile(path.join(uploadDirectory, prediction.imageFilename), (error) => {
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
}

async function deletePrediction(request, response, next) {
  const { id } = request.params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    response.status(404).json({ message: 'Prediction not found.' });
    return;
  }

  try {
    const prediction = await Prediction.findOne({ _id: id, ownerId: request.ownerId }).select('imageFilename');
    if (!prediction) {
      response.status(404).json({ message: 'Prediction not found.' });
      return;
    }
    if (prediction.imageFilename && /^[a-f\d-]{36}\.jpg$/i.test(prediction.imageFilename)) {
      try {
        await fs.unlink(path.join(uploadDirectory, prediction.imageFilename));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await prediction.deleteOne();
    response.status(200).json({ id, deleted: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deletePrediction,
  getDashboardStats,
  getPredictionHistory,
  getPredictionClasses,
  getPredictionImage,
  getRecentPredictions,
  parseImage,
  predictImage,
  reviewPrediction,
};