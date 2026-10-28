const jwt = require('jsonwebtoken');

const cookieName = 'cropai_session';

function getSessionToken(request) {
  const cookieHeader = request.headers.cookie || '';
  const sessionCookie = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));

  return sessionCookie ? sessionCookie.slice(cookieName.length + 1) : null;
}

function requireOwner(request, response, next) {
  const token = getSessionToken(request);
  const ownerEmail = process.env.CROP_OWNER_EMAIL?.trim().toLowerCase();
  const secret = process.env.JWT_SECRET;

  if (!ownerEmail || !secret || secret.length < 32) {
    response.status(503).json({ message: 'Owner account is not configured on the server.' });
    return;
  }

  try {
    const payload = jwt.verify(token || '', secret);
    if (payload.sub !== ownerEmail) {
      response.status(401).json({ message: 'Sign in to access this account.' });
      return;
    }
    request.ownerId = ownerEmail;
    next();
  } catch {
    response.status(401).json({ message: 'Sign in to access this account.' });
  }
}

module.exports = { cookieName, requireOwner };
