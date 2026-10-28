const express = require('express');
const {
	deletePrediction,
	getDashboardStats,
	getPredictionHistory,
	getRecentPredictions,
	getPredictionClasses,
	getPredictionImage,
	parseImage,
	predictImage,
	reviewPrediction,
} = require('../controllers/predictionController');
const { requireOwner } = require('../middleware/requireOwner');

const router = express.Router();

router.use(requireOwner);
router.get('/predictions/recent', getRecentPredictions);
router.get('/predictions/classes', getPredictionClasses);
router.get('/predictions', getPredictionHistory);
router.get('/dashboard/stats', getDashboardStats);
router.post('/predict', parseImage, predictImage);
router.get('/predictions/:id/image', getPredictionImage);
router.patch('/predictions/:id/label', reviewPrediction);
router.delete('/predictions/:id', deletePrediction);

module.exports = router;