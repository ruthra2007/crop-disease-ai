const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('node:path');
const predictionRoutes = require('./routes/predictionRoutes');
const authRoutes = require('./routes/authRoutes');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);
app.use('/api', authRoutes);

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
    message: 'Crop Disease AI backend is running.',
  });
});

app.use('/api', predictionRoutes);

app.use((error, req, res, next) => {
  console.error('API error:', error.message);
  res.status(503).json({ message: 'Prediction could not be completed. Check the model worker and database connection.' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
