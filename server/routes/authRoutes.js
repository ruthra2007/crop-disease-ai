const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { cookieName, requireOwner } = require('../middleware/requireOwner');

const router = express.Router();
const getSessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

function equalSecret(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

router.post('/auth/login', (request, response) => {
  const ownerEmail = process.env.CROP_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.CROP_OWNER_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;
  if (!ownerEmail || !ownerPassword || !jwtSecret || jwtSecret.length < 32) {
    response.status(503).json({ message: 'Set CROP_OWNER_EMAIL, CROP_OWNER_PASSWORD, and a JWT_SECRET of at least 32 characters in server/.env.' });
    return;
  }

  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!equalSecret(email, ownerEmail) || !equalSecret(password, ownerPassword)) {
    response.status(401).json({ message: 'Email or password is incorrect.' });
    return;
  }

  const token = jwt.sign({ sub: ownerEmail }, jwtSecret, { expiresIn: '7d' });
  response.cookie(cookieName, token, { ...getSessionCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
  response.status(200).json({ owner: { email: ownerEmail } });
});

router.get('/auth/session', requireOwner, (request, response) => {
  response.status(200).json({ owner: { email: request.ownerId } });
});

router.post('/auth/logout', (request, response) => {
  response.clearCookie(cookieName, getSessionCookieOptions());
  response.status(200).json({ status: 'signed_out' });
});

module.exports = router;
