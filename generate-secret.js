// Run this file to generate a secure SESSION_SECRET
// Usage: node generate-secret.js

import crypto from 'crypto';

const secret = crypto.randomBytes(32).toString('hex');
console.log('\n🔐 Your SESSION_SECRET:');
console.log(secret);
console.log('\nCopy this value to your .env file\n');
