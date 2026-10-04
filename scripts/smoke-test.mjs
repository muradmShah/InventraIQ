import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await mkdtemp(join(os.tmpdir(), 'stocksense-check-'));
let lastOllamaRequest = null;
let ollamaRequestCount = 0;
const ollama = http.createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    ollamaRequestCount += 1;
    lastOllamaRequest = JSON.parse(body);
    const question = lastOllamaRequest.messages?.find((message) => message.role === 'user')?.content || '';
    const stockChange = /^add 5 units/i.test(question);
    const task = {
      intent: stockChange ? 'stock_change_request' : 'stock_lookup',
      productNames: [stockChange ? 'EL-2048' : 'EL-2048'],
      days: 7,
      quantity: stockChange ? 5 : 0,
      direction: stockChange ? 'in' : 'unknown',
      reason: stockChange ? 'receipt' : 'unknown',
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify({ tasks: [task] }) } }));
  });
});
await new Promise((resolveListen, reject) => {
  ollama.once('error', reject);
  ollama.listen(0, '127.0.0.1', resolveListen);
});
const ollamaPort = ollama.address().port;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const api = spawn(process.execPath, ['server/index.js'], {
  cwd: projectRoot,
  env: { ...process.env, API_PORT: String(port), STOCKSENSE_DATA_DIR: tempRoot, AI_PROVIDER: 'ollama', OLLAMA_URL: `http://127.0.0.1:${ollamaPort}`, OLLAMA_MODEL: 'qwen-test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
api.stdout.on('data', (chunk) => { serverOutput += chunk; });
api.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function request(path, cookie, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
  });
}

async function signIn(email, password) {
  const response = await request('/api/login', null, {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `Sign in should succeed for ${email}`);
  return response.headers.get('set-cookie').split(';')[0];
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`API exited early. ${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* The API is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`API did not start in time. ${serverOutput}`);
}

try {
  await waitForApi();
  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.deepEqual(health, { ok: true, database: 'SQLite' });
  assert.equal((await request('/api/products')).status, 401, 'Inventory must require sign-in');

  const manager = await signIn('manager@stocksense.local', 'Manager123!');
  const staff = await signIn('staff@stocksense.local', 'Staff123!');

  const sampleProducts = await (await request('/api/products', staff)).json();
  assert.equal(sampleProducts.length, 52, 'A fresh database should include the complete 52-item demo catalog');
  const lowStockAnswer = await request('/api/assistant/ask', staff, {
    method: 'POST', body: JSON.stringify({ question: 'Which products are currently low in stock, and how many units of each remain?' }),
  });
  const lowStockBody = await lowStockAnswer.json();
  assert.equal(lowStockAnswer.status, 200);
  assert.match(lowStockBody.answer, /Low-stock items \(5\)/, 'Low-stock questions should query inventory rows directly');
  assert.match(lowStockBody.answer, /Organic Green Tea/);
  assert.equal(ollamaRequestCount, 0, 'Common low-stock questions should not wait for the local model');

  const inventoryAnswer = await request('/api/assistant/ask', staff, {
    method: 'POST', body: JSON.stringify({ question: 'How many Type-C Fast Charging Cables are in stock?' }),
  });
  assert.equal(inventoryAnswer.status, 200, 'A product stock question should be answered from SQLite');
  assert.match((await inventoryAnswer.json()).answer, /128 pcs in stock/, 'Assistant answers must come from database records');
  assert.equal(ollamaRequestCount, 0, 'A direct SKU lookup should avoid a slow model call');

  const stockProposalResponse = await request('/api/assistant/ask', staff, {
    method: 'POST', body: JSON.stringify({ question: 'Add 5 units of Type-C Fast Charging Cable as a delivery' }),
  });
  assert.equal(stockProposalResponse.status, 200);
  const { proposal } = await stockProposalResponse.json();
  assert.ok(proposal?.id, 'The assistant should prepare a stock review proposal');
  assert.equal(lastOllamaRequest.model, 'qwen-test', 'Stock-change language should still use the configured Ollama model');
  assert.equal(lastOllamaRequest.stream, false, 'Ollama should return one complete structured response');
  assert.ok(lastOllamaRequest.format?.properties?.tasks, 'Ollama should receive the response schema');
  let assistantProducts = await (await request('/api/products', staff)).json();
  assert.equal(assistantProducts.find((item) => item.sku === 'EL-2048').quantity, 128, 'An AI suggestion must not update stock before confirmation');
  assert.equal((await request(`/api/assistant/proposals/${proposal.id}/confirm`, staff, { method: 'POST' })).status, 200, 'A user confirmation should save the proposed stock change');
  assistantProducts = await (await request('/api/products', staff)).json();
  assert.equal(assistantProducts.find((item) => item.sku === 'EL-2048').quantity, 133, 'Confirmed AI changes should update the database');
  const updatedInventoryAnswer = await request('/api/assistant/ask', staff, {
    method: 'POST', body: JSON.stringify({ question: 'How many EL-2048 cables are in stock?' }),
  });
  assert.match((await updatedInventoryAnswer.json()).answer, /133 pcs in stock/, 'A later answer should reflect confirmed database changes');
  assert.equal(ollamaRequestCount, 1, 'Direct database answers should not make extra model requests');

  for (const path of ['/api/manager/pricing', '/api/manager/reports', '/api/manager/catalog', '/api/manager/suppliers']) {
    assert.equal((await request(path, manager)).status, 200, `Manager should access ${path}`);
    assert.equal((await request(path, staff)).status, 403, `Staff must not access ${path}`);
  }

  const supplierName = `Smoke Test Supplier ${Date.now()}`;
  const createSupplier = await request('/api/manager/suppliers', manager, {
    method: 'POST',
    body: JSON.stringify({ name: supplierName, contactName: 'Test Contact', phone: '+92 300 1234567', email: 'test@supplier.example' }),
  });
  assert.equal(createSupplier.status, 201, 'Manager should be able to create a supplier');
  const { supplierId } = await createSupplier.json();
  assert.equal((await request('/api/manager/suppliers', staff, {
    method: 'POST', body: JSON.stringify({ name: 'Staff must not create suppliers' }),
  })).status, 403);
  assert.equal((await request('/api/manager/suppliers', manager, {
    method: 'POST', body: JSON.stringify({ name: supplierName.toLowerCase() }),
  })).status, 409, 'Duplicate supplier names should be rejected');

  const products = await (await request('/api/products', staff)).json();
  assert.equal(products.length, 52, 'The demo catalog should remain complete after stock changes');
  const product = products[0];
  const receipt = await request('/api/movements', staff, {
    method: 'POST',
    body: JSON.stringify({ movementType: 'in', productId: product.id, quantity: 2, supplierId, note: 'automated supplier receipt check' }),
  });
  assert.equal(receipt.status, 201, 'Staff should be able to record a receipt from an active supplier');
  let movements = await (await request('/api/movements', staff)).json();
  assert.equal(movements[0].supplierName, supplierName, 'Movement history should keep the supplier name');

  const excessiveRemoval = await request('/api/movements', staff, {
    method: 'POST',
    body: JSON.stringify({ movementType: 'out', productId: product.id, quantity: product.quantity + 3, reason: 'other', note: 'below zero check' }),
  });
  assert.equal(excessiveRemoval.status, 409, 'Stock must not be allowed to go below zero');
  const unchangedProduct = (await (await request('/api/products', staff)).json()).find((item) => item.id === product.id);
  assert.equal(unchangedProduct.quantity, product.quantity + 2, 'Rejected stock removal must leave stock unchanged');

  const deactivateSupplier = await request(`/api/manager/suppliers/${supplierId}`, manager, {
    method: 'PATCH',
    body: JSON.stringify({ name: supplierName, contactName: 'Test Contact', phone: '+92 300 1234567', email: 'test@supplier.example', isActive: false }),
  });
  assert.equal(deactivateSupplier.status, 200);
  const activeSuppliers = await (await request('/api/suppliers', staff)).json();
  assert.ok(!activeSuppliers.some((supplier) => supplier.id === supplierId), 'Inactive suppliers should not be selectable');
  movements = await (await request('/api/movements', staff)).json();
  assert.equal(movements[0].supplierName, supplierName, 'Deactivation must preserve older receipt history');

  console.log('PASS: sign-in, Manager/Staff permissions, 52 database-backed demo products, fast stock answers, structured Ollama stock proposals, human confirmation, suppliers, and movement history.');
  console.log('Note: Ollama is simulated for this test; install Ollama and Qwen locally to use the real model.');
} catch (error) {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  api.kill();
  await new Promise((resolveExit) => {
    if (api.exitCode !== null) return resolveExit();
    api.once('exit', resolveExit);
    setTimeout(resolveExit, 1000).unref();
  });
  await new Promise((resolveClose) => ollama.close(resolveClose));
  await rm(tempRoot, { recursive: true, force: true });
}
