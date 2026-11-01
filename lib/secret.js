'use strict';

/*
 * Single source of truth for the JWT signing key.
 *
 * A hardcoded fallback is not acceptable: the repository is public, so anyone
 * could sign tokens with it. Without JWT_SECRET we generate a random secret for
 * this process instead — tokens then stop working after a restart, which is the
 * safe failure mode. Set JWT_SECRET in .env for anything you actually deploy.
 */
const crypto = require('crypto');

const fromEnv = process.env.JWT_SECRET;

if (!fromEnv) {
  console.warn(
    '[auth] JWT_SECRET is not set — using a random per-process secret. ' +
      'Sessions will be dropped on restart.'
  );
}

module.exports = fromEnv || crypto.randomBytes(32).toString('hex');
