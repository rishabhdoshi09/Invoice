// backend/src/controller/index.js
const path = require('path');
const glob = require('glob');

const basename = path.basename(__filename);
const controller = {};

const files = glob.sync(path.join(__dirname, '**', '*.js'));

for (const file of files) {
  const base = path.basename(file); // e.g., "users.js"
  // skip this file (index.js) and any hidden files
  if (base === basename || base.startsWith('.')) continue;
  if (path.extname(base) !== '.js') continue;

  const name = path.basename(base, '.js'); // e.g., "users"

  try {
    controller[name] = require(file);
  } catch (err) {
    // Log but don't crash the whole app — makes debugging easier
    console.error(`Failed to load controller "${name}" from ${file}:`, err);
  }
}

module.exports = controller;
