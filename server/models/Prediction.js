const mongoose = require('mongoose');

const topPredictionSchema = new mongoose.Schema({
  className: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
}, { _id: false });

const predictionSchema = new mongoose.Schema({
  ownerId: { type: String, index: true, default: null },
  prediction: { type: String, required: true, trim: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  cropFilter: {
    type: String,
    enum: ['auto', 'tomato', 'potato', 'pepper'],
    required: true,
  },
  topPredictions: { type: [topPredictionSchema], default: [] },
  imageFilename: { type: String },
  imageMimeType: { type: String, required: true },
  imageSizeBytes: { type: Number, required: true, min: 1 },
  isUncertain: { type: Boolean, default: false },
  reviewStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'corrected'],
    default: 'pending',
  },
  reviewedLabel: { type: String, trim: true },
  reviewedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.models.Prediction
  || mongoose.model('Prediction', predictionSchema);