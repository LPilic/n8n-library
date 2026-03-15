#!/usr/bin/env node
/**
 * Import an n8n workflow JSON export as a template via the API.
 *
 * Usage:
 *   node add-template.js <workflow.json> [--name "Name"] [--category "Cat1,Cat2"] [--description "Desc"]
 *
 * The workflow JSON is a standard n8n export (Editor UI → Download).
 * Requires the server to be running.
 */
const fs = require('fs');
const http = require('http');

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log('Usage: node add-template.js <workflow.json> [--name "Name"] [--category "Cat1,Cat2"] [--description "Desc"]');
  console.log('\nPOSTs the workflow to the running library server.');
  process.exit(0);
}

const inputFile = args[0];
if (!fs.existsSync(inputFile)) {
  console.error(`File not found: ${inputFile}`);
  process.exit(1);
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const categoryArg = getArg('--category');

const body = JSON.stringify({
  name: getArg('--name') || workflow.name || 'Untitled Template',
  description: getArg('--description') || '',
  categories: categoryArg ? categoryArg.split(',').map(c => c.trim()) : [],
  workflow,
});

const port = process.env.PORT || 3100;
const req = http.request({
  hostname: 'localhost',
  port,
  path: '/api/templates',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (res.statusCode === 201) {
      console.log(`Template created with id: ${result.id}`);
    } else {
      console.error(`Error (${res.statusCode}):`, result.error || result);
    }
  });
});

req.on('error', (err) => {
  console.error(`Could not connect to server on port ${port}. Is it running?`);
  console.error(err.message);
  process.exit(1);
});

req.write(body);
req.end();
