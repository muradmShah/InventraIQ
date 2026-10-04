import express from 'express';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}
const dataDirectory = process.env.STOCKSENSE_DATA_DIR
  ? resolve(process.env.STOCKSENSE_DATA_DIR)
  : join(here, '..', 'data');
const databasePath = join(dataDirectory, 'stocksense.sqlite');
mkdirSync(dataDirectory, { recursive: true });

const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
const db = existsSync(databasePath)
  ? new SQL.Database(new Uint8Array(readFileSync(databasePath)))
  : new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit TEXT NOT NULL,
    low_stock_threshold INTEGER NOT NULL DEFAULT 20 CHECK (low_stock_threshold >= 0),
    icon TEXT NOT NULL,
    color TEXT NOT NULL
  )
`);
const productColumns = db.exec('PRAGMA table_info(products)')[0].values.map((column) => column[1]);
if (!productColumns.includes('cost_price')) db.run('ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0');
if (!productColumns.includes('selling_price')) db.run('ALTER TABLE products ADD COLUMN selling_price REAL NOT NULL DEFAULT 0');
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
    password_hash TEXT NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS supplier_change_log (
    id INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated')),
    details TEXT NOT NULL,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
    reason TEXT NOT NULL DEFAULT 'other',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
    new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
    note TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS product_change_log (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated')),
    details TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  )
`);
const movementColumns = db.exec('PRAGMA table_info(stock_movements)')[0].values.map((column) => column[1]);
if (!movementColumns.includes('reason')) db.run("ALTER TABLE stock_movements ADD COLUMN reason TEXT NOT NULL DEFAULT 'other'");
if (!movementColumns.includes('supplier_id')) db.run('ALTER TABLE stock_movements ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)');

const userCount = db.exec('SELECT COUNT(*) AS count FROM users')[0].values[0][0];
if (userCount === 0) {
  const addUser = db.prepare('INSERT INTO users (email, display_name, role, password_hash) VALUES (?, ?, ?, ?)');
  addUser.run(['manager@stocksense.local', 'Mall Manager', 'manager', bcrypt.hashSync('Manager123!', 10)]);
  addUser.run(['staff@stocksense.local', 'Store Staff', 'staff', bcrypt.hashSync('Staff123!', 10)]);
  addUser.free();
}

const seedProducts = [
  ['Type-C Fast Charging Cable', 'EL-2048', 'Electronics', 128, 'pcs', 20, 'ϟ', 'mint', 350, 500],
  ['Everyday Cotton T-Shirt', 'CL-1032', 'Clothing', 42, 'pcs', 20, 'T', 'lavender', 850, 1250],
  ['Premium Basmati Rice · 5 kg', 'GR-5011', 'Grocery', 18, 'bags', 20, '✳', 'butter', 1200, 1500],
  ['Stainless Steel Water Bottle', 'HH-3086', 'Household', 64, 'pcs', 20, '◒', 'blue', 600, 900],
  ['Wireless Bluetooth Earbuds', 'EL-2056', 'Electronics', 9, 'pcs', 20, '◉', 'pink', 1800, 2500],
  ['Organic Green Tea · 100 bags', 'GR-5028', 'Grocery', 0, 'boxes', 20, '♧', 'sage', 500, 700],
  ['Classic Denim Jeans', 'CL-1074', 'Clothing', 31, 'pcs', 20, 'D', 'blue', 1500, 2200],
  ['Ceramic Dinner Plate Set', 'HH-3112', 'Household', 22, 'sets', 20, '◉', 'lavender', 1100, 1600],
  ['Portable Power Bank · 10k', 'EL-2072', 'Electronics', 7, 'pcs', 20, '▰', 'butter', 1800, 2500],
  ['Whole Wheat Flour · 10 kg', 'GR-5041', 'Grocery', 53, 'bags', 20, '✳', 'mint', 1450, 1750],
  ['Kids Hoodie', 'CL-1098', 'Clothing', 16, 'pcs', 20, 'H', 'pink', 1300, 1900],
  ['Glass Food Storage Set', 'HH-3145', 'Household', 37, 'sets', 20, '▱', 'sage', 900, 1300],
  ['USB-C Wall Charger · 30W', 'EL-2080', 'Electronics', 45, 'pcs', 20, 'ϟ', 'mint', 650, 900],
  ['Wireless Optical Mouse', 'EL-2081', 'Electronics', 38, 'pcs', 20, '◉', 'blue', 900, 1300],
  ['Portable Bluetooth Speaker', 'EL-2082', 'Electronics', 27, 'pcs', 20, '♫', 'pink', 2200, 3200],
  ['HDMI Cable · 2 m', 'EL-2083', 'Electronics', 54, 'pcs', 20, 'ϟ', 'mint', 450, 700],
  ['USB Flash Drive · 64 GB', 'EL-2084', 'Electronics', 72, 'pcs', 20, '▰', 'butter', 950, 1250],
  ['Wireless Keyboard', 'EL-2085', 'Electronics', 31, 'pcs', 20, '▦', 'lavender', 1800, 2500],
  ['Smart Watch · Basic', 'EL-2086', 'Electronics', 26, 'pcs', 20, '◷', 'blue', 3500, 4500],
  ['Laptop Cooling Pad', 'EL-2087', 'Electronics', 24, 'pcs', 20, '▤', 'sage', 1600, 2200],
  ['27-inch Full HD Monitor', 'EL-2088', 'Electronics', 23, 'pcs', 20, '▱', 'blue', 28000, 34000],
  ['Dual-Band Wi-Fi Router', 'EL-2089', 'Electronics', 35, 'pcs', 20, '⌁', 'mint', 5200, 6900],
  ['Men’s Cotton Polo Shirt', 'CL-1105', 'Clothing', 60, 'pcs', 20, 'T', 'lavender', 1100, 1600],
  ['Women’s Casual Kurta', 'CL-1106', 'Clothing', 34, 'pcs', 20, 'K', 'pink', 1800, 2600],
  ['Everyday Walking Sneakers', 'CL-1107', 'Clothing', 29, 'pairs', 20, 'S', 'blue', 2400, 3300],
  ['Women’s Denim Jacket', 'CL-1108', 'Clothing', 26, 'pcs', 20, 'J', 'blue', 2800, 3900],
  ['Kids School Uniform Set', 'CL-1109', 'Clothing', 48, 'sets', 20, 'U', 'mint', 1500, 2100],
  ['Cotton Printed Scarf', 'CL-1110', 'Clothing', 52, 'pcs', 20, 'S', 'pink', 500, 850],
  ['Men’s Formal Shirt', 'CL-1111', 'Clothing', 33, 'pcs', 20, 'F', 'lavender', 1700, 2400],
  ['Kids Sports T-Shirt', 'CL-1112', 'Clothing', 41, 'pcs', 20, 'T', 'butter', 700, 1100],
  ['Women’s Cotton Leggings', 'CL-1113', 'Clothing', 37, 'pcs', 20, 'L', 'sage', 650, 1000],
  ['Men’s Winter Sweatshirt', 'CL-1114', 'Clothing', 28, 'pcs', 20, 'W', 'blue', 1900, 2700],
  ['Cooking Oil · 5 L', 'GR-5052', 'Grocery', 35, 'bottles', 20, '◉', 'butter', 2400, 2850],
  ['Red Lentils · 1 kg', 'GR-5053', 'Grocery', 48, 'packs', 20, '✳', 'butter', 280, 360],
  ['Whole Milk · 1 L', 'GR-5054', 'Grocery', 46, 'cartons', 20, '◒', 'blue', 210, 260],
  ['Granulated Sugar · 2 kg', 'GR-5055', 'Grocery', 62, 'packs', 20, '✳', 'sage', 320, 390],
  ['Black Tea · 450 g', 'GR-5056', 'Grocery', 40, 'packs', 20, '♧', 'mint', 650, 820],
  ['Wheat Flour · 5 kg', 'GR-5057', 'Grocery', 58, 'bags', 20, '✳', 'butter', 720, 860],
  ['Canned Chickpeas · 400 g', 'GR-5058', 'Grocery', 31, 'cans', 20, '✳', 'sage', 180, 250],
  ['Olive Oil · 1 L', 'GR-5059', 'Grocery', 24, 'bottles', 20, '◉', 'mint', 1700, 2150],
  ['Chocolate Biscuits · Family Pack', 'GR-5060', 'Grocery', 73, 'boxes', 20, '▱', 'pink', 250, 340],
  ['Mineral Water · 1.5 L', 'GR-5061', 'Grocery', 80, 'bottles', 20, '◒', 'blue', 75, 110],
  ['LED Bulb · 12W', 'HH-3160', 'Household', 47, 'pcs', 20, '☼', 'butter', 280, 420],
  ['Microfiber Cleaning Cloth', 'HH-3161', 'Household', 52, 'pcs', 20, '▱', 'blue', 120, 200],
  ['Laundry Detergent · 2 kg', 'HH-3162', 'Household', 34, 'packs', 20, '✳', 'mint', 650, 850],
  ['Nonstick Frying Pan · 28 cm', 'HH-3163', 'Household', 26, 'pcs', 20, '◒', 'blue', 1800, 2500],
  ['Bath Towel Set', 'HH-3164', 'Household', 29, 'sets', 20, '▱', 'lavender', 1200, 1700],
  ['Storage Basket · Medium', 'HH-3165', 'Household', 41, 'pcs', 20, '▦', 'sage', 500, 750],
  ['Stainless Steel Cutlery Set', 'HH-3166', 'Household', 22, 'sets', 20, '◉', 'blue', 2100, 2900],
  ['Vacuum Flask · 1 L', 'HH-3167', 'Household', 25, 'pcs', 20, '◒', 'mint', 1300, 1900],
  ['Air Freshener Spray', 'HH-3168', 'Household', 43, 'cans', 20, '♧', 'pink', 300, 450],
  ['Dishwashing Liquid · 750 ml', 'HH-3169', 'Household', 36, 'bottles', 20, '◉', 'sage', 240, 350],
];
const existingProductCount = db.exec('SELECT COUNT(*) AS count FROM products')[0].values[0][0];
const hasInventraDemoProduct = db.exec("SELECT COUNT(*) AS count FROM products WHERE sku = 'EL-2048' AND name = 'Type-C Fast Charging Cable'")[0].values[0][0] > 0;
// Seed a fresh database, or add new demo rows to an existing demo database without
// overwriting quantities or catalog edits. Never add demo stock to a custom catalog.
if (existingProductCount === 0 || hasInventraDemoProduct) {
  const insert = db.prepare('INSERT OR IGNORE INTO products (name, sku, category, quantity, unit, low_stock_threshold, icon, color, cost_price, selling_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.run('BEGIN TRANSACTION');
  for (const product of seedProducts) insert.run(product);
  insert.free();
  db.run('COMMIT');
}

const samplePrices = [
  ['EL-2048', 350, 500], ['CL-1032', 850, 1250], ['GR-5011', 1200, 1500],
  ['HH-3086', 600, 900], ['EL-2056', 1800, 2500], ['GR-5028', 500, 700],
  ['CL-1074', 1500, 2200], ['HH-3112', 1100, 1600], ['EL-2072', 1800, 2500],
  ['GR-5041', 1450, 1750], ['CL-1098', 1300, 1900], ['HH-3145', 900, 1300],
];
const fillMissingPrices = db.prepare('UPDATE products SET cost_price = ?, selling_price = ? WHERE sku = ? AND (cost_price = 0 OR selling_price = 0)');
for (const [sku, costPrice, sellingPrice] of samplePrices) fillMissingPrices.run([costPrice, sellingPrice, sku]);
fillMissingPrices.free();

function saveDatabase() {
  writeFileSync(databasePath, Buffer.from(db.export()));
}
saveDatabase();

function rows(sql) {
  const result = db.exec(sql);
  if (!result.length) return [];
  const [table] = result;
  return table.values.map((values) => Object.fromEntries(table.columns.map((column, index) => [column, values[index]])));
}

const app = express();
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_request, response) => response.json({ ok: true, database: 'SQLite' }));

const SESSION_COOKIE = 'stocksense_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
function tokenFromRequest(request) {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null;
}
function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
}
function getUserByEmail(email) {
  const statement = db.prepare('SELECT id, email, display_name, role, password_hash FROM users WHERE email = ?');
  statement.bind([email]);
  const user = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return user;
}
function getSessionUser(request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const statement = db.prepare(`SELECT users.id, users.email, users.display_name, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`);
  statement.bind([hashToken(token), Date.now()]);
  const user = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return user;
}
function requireAuth(request, response, next) {
  const user = getSessionUser(request);
  if (!user) return response.status(401).json({ error: 'Sign in is required.' });
  request.user = user;
  next();
}
function requireRole(role) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ error: 'Sign in is required.' });
    if (request.user.role !== role) return response.status(403).json({ error: 'Your account does not have permission for this action.' });
    next();
  };
}

app.post('/api/login', (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase();
  const password = String(request.body?.password || '');
  if (!email || !password || password.length > 200) return response.status(400).json({ error: 'Enter your email and password.' });
  const user = getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return response.status(401).json({ error: 'Email or password is incorrect.' });

  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  insert.run([hashToken(token), user.id, expiresAt]);
  insert.free();
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  saveDatabase();
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}${secureFlag}`);
  response.json({ user: publicUser(user) });
});

app.get('/api/session', requireAuth, (request, response) => response.json({ user: publicUser(request.user) }));
app.post('/api/logout', (request, response) => {
  const token = tokenFromRequest(request);
  if (token) {
    db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    saveDatabase();
  }
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  response.json({ ok: true });
});

app.get('/api/manager/permission-check', requireAuth, requireRole('manager'), (_request, response) => response.json({ managerAccess: true }));
function catalogFields(body) {
  const name = String(body?.name || '').trim();
  const sku = String(body?.sku || '').trim().toUpperCase();
  const category = String(body?.category || '').trim();
  const unit = String(body?.unit || '').trim();
  const lowStockThreshold = Number(body?.lowStockThreshold);
  if (!name || name.length > 100) return { error: 'Product name is required and must be 100 characters or fewer.' };
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(sku)) return { error: 'SKU must be 1–32 letters, numbers, hyphens, or underscores.' };
  if (!category || category.length > 40) return { error: 'Category is required and must be 40 characters or fewer.' };
  if (!unit || unit.length > 20) return { error: 'Unit is required and must be 20 characters or fewer.' };
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1000000) return { error: 'Low-stock threshold must be a whole number from 0 to 1,000,000.' };
  return { value: { name, sku, category, unit, lowStockThreshold } };
}
function catalogStyle(category) {
  const styles = { Electronics: ['ϟ', 'mint'], Clothing: ['T', 'lavender'], Grocery: ['✳', 'butter'], Household: ['◒', 'blue'] };
  const [icon, color] = styles[category] || ['▦', 'sage'];
  return { icon, color };
}
app.get('/api/manager/catalog', requireAuth, requireRole('manager'), (_request, response) => {
  const catalog = rows(`SELECT id, name, sku, category, quantity, unit, low_stock_threshold AS lowStockThreshold, icon, color,
      cost_price AS costPrice, selling_price AS sellingPrice FROM products ORDER BY category, name`);
  const changes = rows(`SELECT product_change_log.id, product_change_log.product_id AS productId,
      products.name AS productName, product_change_log.event_type AS eventType,
      product_change_log.details, users.display_name AS changedBy,
      product_change_log.created_at AS createdAt
    FROM product_change_log JOIN products ON products.id = product_change_log.product_id
      JOIN users ON users.id = product_change_log.created_by
    ORDER BY product_change_log.id DESC LIMIT 30`);
  response.json({ catalog, changes });
});
app.post('/api/manager/catalog', requireAuth, requireRole('manager'), (request, response) => {
  const parsed = catalogFields(request.body);
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const { name, sku, category, unit, lowStockThreshold } = parsed.value;
  const costPrice = Number(request.body?.costPrice);
  const sellingPrice = Number(request.body?.sellingPrice);
  const validPrice = (value) => Number.isFinite(value) && value > 0 && value <= 100000000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
  if (!validPrice(costPrice) || !validPrice(sellingPrice)) return response.status(400).json({ error: 'Enter valid cost and selling prices greater than zero, up to two decimal places.' });
  const duplicate = db.prepare('SELECT id FROM products WHERE UPPER(sku) = ?');
  duplicate.bind([sku]); const alreadyExists = duplicate.step(); duplicate.free();
  if (alreadyExists) return response.status(409).json({ error: 'That SKU is already used by another product.' });
  const { icon, color } = catalogStyle(category);
  const detail = { name, sku, category, unit, lowStockThreshold, costPrice, sellingPrice, initialQuantity: 0 };
  try {
    db.run('BEGIN TRANSACTION');
    db.run(`INSERT INTO products (name, sku, category, quantity, unit, low_stock_threshold, icon, color, cost_price, selling_price)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`, [name, sku, category, unit, lowStockThreshold, icon, color, costPrice, sellingPrice]);
    const productId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    db.run(`INSERT INTO product_change_log (product_id, event_type, details, created_by, created_at) VALUES (?, 'created', ?, ?, ?)`, [productId, JSON.stringify(detail), request.user.id, new Date().toISOString()]);
    db.run('COMMIT'); saveDatabase();
    return response.status(201).json({ ok: true, productId, quantity: 0, message: 'Product created with zero stock. Record stock in through Stock movements when it arrives.' });
  } catch (error) {
    db.run('ROLLBACK'); console.error('Could not create catalog product:', error.name || 'Error');
    return response.status(500).json({ error: 'The product could not be created. No changes were saved.' });
  }
});
app.patch('/api/manager/catalog/:id', requireAuth, requireRole('manager'), (request, response) => {
  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return response.status(400).json({ error: 'Choose a valid product.' });
  const parsed = catalogFields(request.body);
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const { name, sku, category, unit, lowStockThreshold } = parsed.value;
  const currentStatement = db.prepare('SELECT id, name, sku, category, unit, low_stock_threshold AS lowStockThreshold FROM products WHERE id = ?');
  currentStatement.bind([productId]); const current = currentStatement.step() ? currentStatement.getAsObject() : null; currentStatement.free();
  if (!current) return response.status(404).json({ error: 'Product not found.' });
  const duplicate = db.prepare('SELECT id FROM products WHERE UPPER(sku) = ? AND id <> ?');
  duplicate.bind([sku, productId]); const alreadyExists = duplicate.step(); duplicate.free();
  if (alreadyExists) return response.status(409).json({ error: 'That SKU is already used by another product.' });
  const next = { name, sku, category, unit, lowStockThreshold };
  const details = Object.fromEntries(Object.entries(next).filter(([key, value]) => current[key] !== value).map(([key, value]) => [key, { before: current[key], after: value }]));
  if (!Object.keys(details).length) return response.json({ ok: true, productId, changedFields: [] });
  const { icon, color } = catalogStyle(category);
  try {
    db.run('BEGIN TRANSACTION');
    db.run(`UPDATE products SET name = ?, sku = ?, category = ?, unit = ?, low_stock_threshold = ?, icon = ?, color = ? WHERE id = ?`, [name, sku, category, unit, lowStockThreshold, icon, color, productId]);
    db.run(`INSERT INTO product_change_log (product_id, event_type, details, created_by, created_at) VALUES (?, 'updated', ?, ?, ?)`, [productId, JSON.stringify(details), request.user.id, new Date().toISOString()]);
    db.run('COMMIT'); saveDatabase();
    return response.json({ ok: true, productId, changedFields: Object.keys(details) });
  } catch (error) {
    db.run('ROLLBACK'); console.error('Could not update catalog product:', error.name || 'Error');
    return response.status(500).json({ error: 'The product details could not be updated. No changes were saved.' });
  }
});
function supplierFields(body) {
  const name = String(body?.name || '').trim();
  const contactName = String(body?.contactName || '').trim();
  const phone = String(body?.phone || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  if (!name || name.length > 100) return { error: 'Supplier name is required and must be 100 characters or fewer.' };
  if (contactName.length > 80) return { error: 'Contact name must be 80 characters or fewer.' };
  if (phone.length > 30 || (phone && !/^[+()0-9 .-]+$/.test(phone))) return { error: 'Enter a valid phone number using digits, spaces, +, brackets, dots, or hyphens.' };
  if (email.length > 120 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: 'Enter a valid email address.' };
  return { value: { name, contactName, phone, email } };
}
app.get('/api/suppliers', requireAuth, (_request, response) => {
  response.json(rows(`SELECT id, name, contact_name AS contactName, phone, email
    FROM suppliers WHERE is_active = 1 ORDER BY name`));
});
app.get('/api/manager/suppliers', requireAuth, requireRole('manager'), (_request, response) => {
  const suppliers = rows(`SELECT id, name, contact_name AS contactName, phone, email, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM suppliers ORDER BY is_active DESC, name`);
  const changes = rows(`SELECT supplier_change_log.id, supplier_change_log.supplier_id AS supplierId,
      suppliers.name AS supplierName, supplier_change_log.event_type AS eventType,
      supplier_change_log.details, users.display_name AS changedBy,
      supplier_change_log.created_at AS createdAt
    FROM supplier_change_log JOIN suppliers ON suppliers.id = supplier_change_log.supplier_id
      JOIN users ON users.id = supplier_change_log.changed_by
    ORDER BY supplier_change_log.id DESC LIMIT 30`);
  response.json({ suppliers, changes });
});
app.post('/api/manager/suppliers', requireAuth, requireRole('manager'), (request, response) => {
  const parsed = supplierFields(request.body);
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const { name, contactName, phone, email } = parsed.value;
  const duplicate = db.prepare('SELECT id FROM suppliers WHERE UPPER(name) = UPPER(?)');
  duplicate.bind([name]); const exists = duplicate.step(); duplicate.free();
  if (exists) return response.status(409).json({ error: 'A supplier with this name already exists.' });
  const now = new Date().toISOString();
  const details = { name, contactName, phone, email, isActive: true };
  try {
    db.run('BEGIN TRANSACTION');
    db.run(`INSERT INTO suppliers (name, contact_name, phone, email, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`, [name, contactName, phone, email, request.user.id, now, now]);
    const supplierId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    db.run(`INSERT INTO supplier_change_log (supplier_id, event_type, details, changed_by, created_at) VALUES (?, 'created', ?, ?, ?)`, [supplierId, JSON.stringify(details), request.user.id, now]);
    db.run('COMMIT'); saveDatabase();
    return response.status(201).json({ ok: true, supplierId });
  } catch (error) {
    db.run('ROLLBACK'); console.error('Could not create supplier:', error.name || 'Error');
    return response.status(500).json({ error: 'The supplier could not be saved.' });
  }
});
app.patch('/api/manager/suppliers/:id', requireAuth, requireRole('manager'), (request, response) => {
  const supplierId = Number(request.params.id);
  if (!Number.isSafeInteger(supplierId) || supplierId < 1) return response.status(400).json({ error: 'Choose a valid supplier.' });
  const parsed = supplierFields(request.body);
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const currentStatement = db.prepare('SELECT id, name, contact_name AS contactName, phone, email, is_active AS isActive FROM suppliers WHERE id = ?');
  currentStatement.bind([supplierId]); const current = currentStatement.step() ? currentStatement.getAsObject() : null; currentStatement.free();
  if (!current) return response.status(404).json({ error: 'Supplier not found.' });
  const duplicate = db.prepare('SELECT id FROM suppliers WHERE UPPER(name) = UPPER(?) AND id <> ?');
  duplicate.bind([parsed.value.name, supplierId]); const exists = duplicate.step(); duplicate.free();
  if (exists) return response.status(409).json({ error: 'A supplier with this name already exists.' });
  const isActive = request.body?.isActive === undefined ? current.isActive : request.body.isActive === false || request.body.isActive === 0 ? 0 : request.body.isActive === true || request.body.isActive === 1 ? 1 : -1;
  if (isActive < 0) return response.status(400).json({ error: 'Supplier status must be active or inactive.' });
  const next = { ...parsed.value, isActive };
  const details = Object.fromEntries(Object.entries(next).filter(([key, value]) => current[key] !== value).map(([key, value]) => [key, { before: current[key], after: value }]));
  if (!Object.keys(details).length) return response.json({ ok: true, supplierId, changedFields: [] });
  const now = new Date().toISOString();
  try {
    db.run('BEGIN TRANSACTION');
    db.run('UPDATE suppliers SET name = ?, contact_name = ?, phone = ?, email = ?, is_active = ?, updated_at = ? WHERE id = ?', [next.name, next.contactName, next.phone, next.email, next.isActive, now, supplierId]);
    db.run(`INSERT INTO supplier_change_log (supplier_id, event_type, details, changed_by, created_at) VALUES (?, 'updated', ?, ?, ?)`, [supplierId, JSON.stringify(details), request.user.id, now]);
    db.run('COMMIT'); saveDatabase();
    return response.json({ ok: true, supplierId, changedFields: Object.keys(details) });
  } catch (error) {
    db.run('ROLLBACK'); console.error('Could not update supplier:', error.name || 'Error');
    return response.status(500).json({ error: 'Supplier details could not be updated.' });
  }
});
app.get('/api/manager/pricing', requireAuth, requireRole('manager'), (_request, response) => {
  const pricing = rows(`SELECT id, name, sku, category, quantity, unit, cost_price AS costPrice, selling_price AS sellingPrice
    FROM products ORDER BY category, name`).map((product) => ({
      ...product,
      unitProfit: product.sellingPrice - product.costPrice,
      grossMarginPercent: product.sellingPrice ? ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100 : 0,
      stockCostValue: product.quantity * product.costPrice,
    }));
  response.json(pricing);
});
function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function karachiDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function queryRows(sql, params) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const result = [];
  while (statement.step()) result.push(statement.getAsObject());
  statement.free();
  return result;
}
app.get('/api/manager/reports', requireAuth, requireRole('manager'), (request, response) => {
  const today = karachiDateString();
  const defaultFrom = shiftDate(today, -29);
  const dateFrom = request.query.dateFrom || defaultFrom;
  const dateTo = request.query.dateTo || today;
  if (!validIsoDate(dateFrom) || !validIsoDate(dateTo)) return response.status(400).json({ error: 'Enter valid dates in YYYY-MM-DD format.' });
  const fromTime = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
  const throughTime = new Date(`${dateTo}T00:00:00.000Z`).getTime();
  const dayCount = Math.floor((throughTime - fromTime) / 86400000) + 1;
  if (dayCount < 1) return response.status(400).json({ error: 'The start date must be on or before the end date.' });
  if (dayCount > 366) return response.status(400).json({ error: 'Choose a date range of 366 days or less.' });
  const rangeStart = new Date(`${dateFrom}T00:00:00+05:00`).toISOString();
  const rangeEnd = new Date(`${shiftDate(dateTo, 1)}T00:00:00+05:00`).toISOString();
  const params = [rangeStart, rangeEnd];
  const [summary] = queryRows(`SELECT COUNT(*) AS movementCount,
      COALESCE(SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END), 0) AS unitsReceived,
      COALESCE(SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END), 0) AS unitsRemoved,
      COALESCE(SUM(CASE WHEN movement_type = 'out' AND reason = 'sale' THEN quantity ELSE 0 END), 0) AS salesUnits,
      COUNT(DISTINCT product_id) AS productsAffected
    FROM stock_movements WHERE created_at >= ? AND created_at < ?`, params);
  const topProducts = queryRows(`SELECT products.name AS productName, products.sku,
      SUM(stock_movements.quantity) AS quantitySold, COUNT(*) AS saleEvents
    FROM stock_movements JOIN products ON products.id = stock_movements.product_id
    WHERE stock_movements.movement_type = 'out' AND stock_movements.reason = 'sale'
      AND stock_movements.created_at >= ? AND stock_movements.created_at < ?
    GROUP BY products.id ORDER BY quantitySold DESC, products.name LIMIT 10`, params);
  const byReason = queryRows(`SELECT reason, COUNT(*) AS movementCount, SUM(quantity) AS quantity
    FROM stock_movements WHERE created_at >= ? AND created_at < ?
    GROUP BY reason ORDER BY quantity DESC, reason`, params);
  const salesByDay = queryRows(`SELECT date(created_at, '+5 hours') AS date, SUM(quantity) AS quantity
    FROM stock_movements WHERE movement_type = 'out' AND reason = 'sale'
      AND created_at >= ? AND created_at < ?
    GROUP BY date(created_at, '+5 hours') ORDER BY date`, params);
  const activities = queryRows(`SELECT stock_movements.id, stock_movements.created_at AS createdAt,
      products.name AS productName, products.sku, stock_movements.movement_type AS movementType,
      stock_movements.reason, stock_movements.quantity,
      stock_movements.previous_quantity AS previousQuantity,
      stock_movements.new_quantity AS newQuantity, stock_movements.note,
      suppliers.name AS supplierName,
      users.display_name AS createdBy
    FROM stock_movements JOIN products ON products.id = stock_movements.product_id
      LEFT JOIN suppliers ON suppliers.id = stock_movements.supplier_id
      JOIN users ON users.id = stock_movements.created_by
    WHERE stock_movements.created_at >= ? AND stock_movements.created_at < ?
    ORDER BY stock_movements.created_at DESC, stock_movements.id DESC LIMIT 200`, params);
  response.json({ dateFrom, dateTo, dayCount, summary, topProducts, byReason, salesByDay, activities, activitiesLimited: activities.length === 200 });
});
app.patch('/api/manager/products/:id/pricing', requireAuth, requireRole('manager'), (request, response) => {
  const productId = Number(request.params.id);
  const costPrice = Number(request.body?.costPrice);
  const sellingPrice = Number(request.body?.sellingPrice);
  const validPrice = (value) => Number.isFinite(value) && value > 0 && value <= 100000000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
  if (!Number.isSafeInteger(productId) || productId < 1) return response.status(400).json({ error: 'Choose a valid product.' });
  if (!validPrice(costPrice) || !validPrice(sellingPrice)) return response.status(400).json({ error: 'Enter valid prices greater than zero, up to two decimal places.' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?');
  exists.bind([productId]);
  const found = exists.step();
  exists.free();
  if (!found) return response.status(404).json({ error: 'Product not found.' });
  db.run('UPDATE products SET cost_price = ?, selling_price = ? WHERE id = ?', [costPrice, sellingPrice, productId]);
  saveDatabase();
  response.json({ ok: true, productId, costPrice, sellingPrice, unitProfit: sellingPrice - costPrice });
});
app.get('/api/products', requireAuth, (request, response) => {
  const items = rows(`SELECT id, name, sku, category, quantity, unit, low_stock_threshold, icon, color FROM products ORDER BY id`)
    .map((product) => ({
      ...product,
      status: product.quantity === 0 ? 'Out of stock' : product.quantity <= product.low_stock_threshold ? 'Low stock' : 'In stock',
      tone: product.quantity === 0 ? 'red' : product.quantity <= product.low_stock_threshold ? 'amber' : 'green',
    }));
  response.json(items);
});
app.get('/api/movements', requireAuth, (_request, response) => {
  const history = rows(`SELECT stock_movements.id, stock_movements.product_id AS productId,
      products.name AS productName, products.sku,
      suppliers.name AS supplierName,
      stock_movements.movement_type AS movementType,
      stock_movements.reason,
      stock_movements.quantity,
      stock_movements.previous_quantity AS previousQuantity,
      stock_movements.new_quantity AS newQuantity,
      stock_movements.note,
      users.display_name AS createdBy,
      stock_movements.created_at AS createdAt
    FROM stock_movements
    JOIN products ON products.id = stock_movements.product_id
    LEFT JOIN suppliers ON suppliers.id = stock_movements.supplier_id
    JOIN users ON users.id = stock_movements.created_by
    ORDER BY stock_movements.id DESC LIMIT 100`);
  response.json(history);
});
app.post('/api/movements', requireAuth, (request, response) => {
  const productId = Number(request.body?.productId);
  const quantity = Number(request.body?.quantity);
  const movementType = String(request.body?.movementType || '');
  const note = String(request.body?.note || '').trim();
  const reason = String(request.body?.reason || (request.body?.movementType === 'in' ? 'receipt' : 'other'));
  const requestedSupplierId = request.body?.supplierId;
  const supplierId = movementType === 'in' && requestedSupplierId !== undefined && requestedSupplierId !== null && requestedSupplierId !== '' ? Number(requestedSupplierId) : null;
  if (!Number.isSafeInteger(productId) || productId < 1) return response.status(400).json({ error: 'Choose a valid product.' });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return response.status(400).json({ error: 'Quantity must be a whole number from 1 to 1,000,000.' });
  if (!['in', 'out'].includes(movementType)) return response.status(400).json({ error: 'Choose stock in or stock out.' });
  if (movementType === 'out' && !['sale', 'damage', 'transfer', 'adjustment', 'other'].includes(reason)) return response.status(400).json({ error: 'Choose a valid stock-out reason.' });
  if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) return response.status(400).json({ error: 'Choose a valid supplier.' });
  if (!note || note.length > 120) return response.status(400).json({ error: 'Enter a short supplier or reason (up to 120 characters).' });

  const productStatement = db.prepare('SELECT id, quantity FROM products WHERE id = ?');
  productStatement.bind([productId]);
  const product = productStatement.step() ? productStatement.getAsObject() : null;
  productStatement.free();
  if (!product) return response.status(404).json({ error: 'Product not found.' });
  if (supplierId !== null) {
    const supplierStatement = db.prepare('SELECT id FROM suppliers WHERE id = ? AND is_active = 1');
    supplierStatement.bind([supplierId]); const supplierIsActive = supplierStatement.step(); supplierStatement.free();
    if (!supplierIsActive) return response.status(400).json({ error: 'That supplier is not active. Select another supplier or leave it blank.' });
  }
  if (movementType === 'out' && quantity > product.quantity) {
    return response.status(409).json({ error: `Only ${product.quantity} ${product.quantity === 1 ? 'unit is' : 'units are'} available. Stock cannot go below zero.` });
  }

  const previousQuantity = product.quantity;
  const newQuantity = movementType === 'in' ? previousQuantity + quantity : previousQuantity - quantity;
  try {
    db.run('BEGIN TRANSACTION');
    db.run('UPDATE products SET quantity = ? WHERE id = ?', [newQuantity, productId]);
    db.run(`INSERT INTO stock_movements (product_id, movement_type, reason, supplier_id, quantity, previous_quantity, new_quantity, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [productId, movementType, movementType === 'in' ? 'receipt' : reason, supplierId, quantity, previousQuantity, newQuantity, note, request.user.id, new Date().toISOString()]);
    db.run('COMMIT');
    saveDatabase();
    return response.status(201).json({ ok: true, previousQuantity, newQuantity });
  } catch (error) {
    db.run('ROLLBACK');
    console.error('Could not record stock movement:', error);
    return response.status(500).json({ error: 'The stock movement could not be saved. No change was applied.' });
  }
});
app.get('/api/summary', requireAuth, (_request, response) => {
  const [summary] = rows(`
    SELECT COUNT(*) AS totalProducts,
      SUM(CASE WHEN quantity > 0 AND quantity <= low_stock_threshold THEN 1 ELSE 0 END) AS lowStockItems,
      SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS outOfStockItems
    FROM products
  `);
  response.json(summary);
});

const assistantPlanSchema = {
  type: 'object', additionalProperties: false, required: ['tasks'],
  properties: { tasks: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['intent', 'productNames', 'days', 'quantity', 'direction', 'reason'],
    properties: {
      intent: { type: 'string', enum: ['stock_lookup', 'low_stock', 'summary', 'top_selling', 'financial_lookup', 'stock_change_request', 'unsupported'] },
      productNames: { type: 'array', items: { type: 'string' } },
      days: { type: 'integer', minimum: 1, maximum: 90 },
      quantity: { type: 'integer', minimum: 0, maximum: 1000000 },
      direction: { type: 'string', enum: ['in', 'out', 'unknown'] },
      reason: { type: 'string', enum: ['sale', 'damage', 'transfer', 'adjustment', 'other', 'receipt', 'unknown'] },
    },
  } } },
};
const pendingStockProposals = new Map();
const PROPOSAL_LIFETIME_MS = 10 * 60 * 1000;
const assistantInstructions = 'Classify the user question into one or more InventraIQ inventory tasks. Return only the required structured plan. Never invent product names: copy requested product names or SKU text into productNames. Use stock_lookup for current quantity, low_stock for low or empty items, summary for total counts, top_selling for sales ranking (days=7 if they say this week/recently without a period), financial_lookup for costs, prices, margins or profit, stock_change_request when the user requests stock to be received/added/removed/sold/damaged/transferred, and unsupported for unrelated requests. For a stock change extract product, whole number quantity, direction=in for receive/add and out for remove/sell/damage, and a reason (receipt, sale, damage, transfer, adjustment or other). If missing use quantity=0, direction=unknown, reason=unknown, or an empty productNames list so InventraIQ can ask follow-up. Never claim you changed stock. For broad questions use an empty productNames array. Every task must include all schema fields.';

function findProducts(names) {
  const inventory = rows('SELECT id, name, sku, category, quantity, unit, low_stock_threshold, cost_price, selling_price FROM products ORDER BY name');
  return names.map((search) => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return { search, matches: [] };
    const exact = inventory.filter((item) => item.name.toLowerCase() === query || item.sku.toLowerCase() === query);
    const matches = exact.length ? exact : inventory.filter((item) => item.name.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query));
    return { search, matches };
  });
}

function resolveInventoryQuestion(plan, user) {
  const answers = [];
  for (const task of plan.tasks) {
    if (task.intent === 'unsupported') {
      answers.push('I can answer questions about current stock, low-stock items, recorded sales, and manager-only product pricing.');
    } else if (task.intent === 'summary') {
      const [summary] = rows(`SELECT COUNT(*) AS total, SUM(CASE WHEN quantity <= low_stock_threshold THEN 1 ELSE 0 END) AS low,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS out FROM products`);
      answers.push(`There are ${summary.total} products: ${summary.low} at or below their low-stock threshold, including ${summary.out} out of stock.`);
    } else if (task.intent === 'low_stock') {
      const items = rows('SELECT name, sku, quantity, unit FROM products WHERE quantity <= low_stock_threshold ORDER BY quantity, name');
      answers.push(items.length ? `Low-stock items (${items.length}): ${items.map((item) => `${item.name} (${item.quantity} ${item.unit})`).join('; ')}.` : 'No products are currently at or below their low-stock threshold.');
    } else if (task.intent === 'stock_lookup') {
      const lookups = findProducts(task.productNames);
      if (!lookups.length) answers.push('Which product should I look up? You can include its name or SKU.');
      for (const lookup of lookups) {
        if (!lookup.matches.length) answers.push(`I couldn't find “${lookup.search}” in the product records.`);
        else if (lookup.matches.length > 1) answers.push(`I found several matches for “${lookup.search}”: ${lookup.matches.map((item) => `${item.name} (${item.sku})`).join(', ')}. Please ask about one by name or SKU.`);
        else { const item = lookup.matches[0]; answers.push(`${item.name} (${item.sku}) has ${item.quantity} ${item.unit} in stock.`); }
      }
    } else if (task.intent === 'top_selling') {
      const days = Math.min(90, Math.max(1, Number(task.days) || 7));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const statement = db.prepare(`SELECT products.name, products.sku, SUM(stock_movements.quantity) AS sold
        FROM stock_movements JOIN products ON products.id = stock_movements.product_id
        WHERE stock_movements.movement_type = 'out' AND stock_movements.reason = 'sale' AND stock_movements.created_at >= ?
        GROUP BY products.id ORDER BY sold DESC, products.name LIMIT 5`);
      statement.bind([cutoff]);
      const items = [];
      while (statement.step()) items.push(statement.getAsObject());
      statement.free();
      answers.push(items.length ? `Top recorded sales in the last ${days} days: ${items.map((item, index) => `${index + 1}. ${item.name} — ${item.sold} units`).join('; ')}.` : `No stock movements categorized as sales are recorded in the last ${days} days. Stock removals marked as damage or other reasons are excluded.`);
    } else if (task.intent === 'financial_lookup') {
      if (user.role !== 'manager') {
        answers.push('Pricing and profit information is only available to Manager accounts.');
        continue;
      }
      const lookups = findProducts(task.productNames);
      for (const lookup of lookups) {
        if (lookup.matches.length !== 1) answers.push(lookup.matches.length ? `I found multiple products for “${lookup.search}”. Please use one exact product name or SKU.` : `I couldn't find “${lookup.search}” in the product records.`);
        else {
          const item = lookup.matches[0];
          answers.push(`${item.name}: cost ${item.cost_price} PKR, selling price ${item.selling_price} PKR, gross profit per unit ${item.selling_price - item.cost_price} PKR.`);
        }
      }
      if (!task.productNames.length) answers.push('Please include a product name or SKU for a pricing lookup.');
    }
  }
  return answers.join('\n\n') || 'I could not identify an inventory question. Try asking about stock, low-stock items, recent recorded sales, or manager-only pricing.';
}

function normalizeAssistantText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function answerCommonInventoryQuestion(question, user) {
  const normalized = normalizeAssistantText(question);
  const asksForChange = /\b(?:add|receive|remove|decrease|reduce|increase|sell|transfer|adjust|record|change|set)\b/.test(normalized)
    || /\b(?:stock|inventory|quantity)\s+(?:in|out|adjustment|change)\b/.test(normalized)
    || /\bupdate\s+(?:stock|inventory|quantity)\b/.test(normalized);
  if (asksForChange) return null;

  if (/\b(?:low stock|low inventory|out of stock|below (?:the )?threshold|under (?:the )?threshold|need restocking)\b/.test(normalized)) {
    return resolveInventoryQuestion({ tasks: [{ intent: 'low_stock' }] }, user);
  }
  if (/\b(?:inventory summary|inventory overview|stock summary|overall inventory|overall stock|total stock|total products|total items|how many (?:products|items))\b/.test(normalized)) {
    return resolveInventoryQuestion({ tasks: [{ intent: 'summary' }] }, user);
  }

  if (/\b(?:price|cost|margin|profit|financial|value|revenue)\b/.test(normalized)) return null;
  const asksAboutStock = /\b(?:stock|quantity|available|remaining|left|on hand|how many|count)\b/.test(normalized);
  if (!asksAboutStock) return null;
  const inventory = rows('SELECT name, sku FROM products ORDER BY LENGTH(name) DESC, name');
  const singularize = (word) => word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
  const queryWords = new Set(normalized.split(' ').map(singularize));
  const ignoredWords = new Set(['what', 'which', 'how', 'many', 'much', 'the', 'are', 'is', 'in', 'on', 'of', 'for', 'do', 'we', 'have', 'currently', 'there', 'left', 'available', 'remaining', 'stock', 'quantity', 'count', 'units', 'unit', 'pcs', 'pieces', 'pairs', 'sets', 'packs', 'bags', 'bottles', 'boxes', 'please', 'tell', 'me', 'show', 'product', 'products', 'item', 'items']);
  const matches = inventory.map((product) => {
    const sku = normalizeAssistantText(product.sku);
    const nameWords = normalizeAssistantText(product.name).split(' ').map(singularize).filter((word) => word.length > 1 && !ignoredWords.has(word));
    if (normalized.includes(sku)) return { product, score: Number.MAX_SAFE_INTEGER };
    return { product, score: nameWords.filter((word) => queryWords.has(word)).length };
  }).filter((entry) => entry.score > 0);
  const bestScore = Math.max(0, ...matches.map((entry) => entry.score));
  const bestMatches = matches.filter((entry) => entry.score === bestScore).map((entry) => entry.product);
  if (bestMatches.length === 1) return resolveInventoryQuestion({ tasks: [{ intent: 'stock_lookup', productNames: [bestMatches[0].sku] }] }, user);
  if (bestMatches.length > 1) return `I found several matching products: ${bestMatches.map((product) => `${product.name} (${product.sku})`).join(', ')}. Please include a SKU or a more specific product name.`;
  if (/\b(?:how many|quantity|stock of|available|remaining|on hand)\b/.test(normalized)) return 'I could not match that product to the inventory. Please check its name or include its SKU.';
  return null;
}

app.post('/api/assistant/ask', requireAuth, async (request, response) => {
  const question = String(request.body?.question || '').trim();
  if (!question || question.length > 500) return response.status(400).json({ error: 'Enter a question up to 500 characters.' });
  const directAnswer = answerCommonInventoryQuestion(question, request.user);
  if (directAnswer) return response.json({ answer: directAnswer });
  const provider = String(process.env.AI_PROVIDER || 'ollama').trim().toLowerCase();
  const model = provider === 'ollama' ? (process.env.OLLAMA_MODEL || 'qwen3:0.6b') : (process.env.OPENAI_MODEL || 'gpt-4.1-mini');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!['ollama', 'openai'].includes(provider)) return response.status(503).json({ error: 'AI_PROVIDER must be set to ollama or openai in the local .env file.' });
  if (provider === 'openai' && (!apiKey || apiKey === 'your_api_key_here')) return response.status(503).json({ error: 'OpenAI is selected, but its API key is not configured in the local .env file.' });
  try {
    let apiResponse;
    let result;
    let outputText;
    if (provider === 'ollama') {
      const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
      apiResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: assistantPlanSchema,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: assistantInstructions },
            { role: 'user', content: question },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      });
      result = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) {
        console.error('InventraIQ Ollama request returned an error:', apiResponse.status);
        const error = apiResponse.status === 404
          ? `Qwen model “${model}” was not found. In PowerShell, run: ollama pull ${model}`
          : 'Could not reach Ollama. Make sure Ollama is running and its local service is available.';
        return response.status(502).json({ error: `${error} Your inventory was not changed.` });
      }
      outputText = result.message?.content;
    } else {
      apiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: 600,
          instructions: assistantInstructions,
          input: question,
          text: { format: { type: 'json_schema', name: 'stocksense_question_plan', strict: true, schema: assistantPlanSchema } },
        }),
        signal: AbortSignal.timeout(20000),
      });
      result = await apiResponse.json();
      if (!apiResponse.ok) {
        console.error('InventraIQ OpenAI request returned an error:', apiResponse.status);
        return response.status(502).json({ error: 'The AI service could not answer just now. Your inventory was not changed; please try again.' });
      }
      outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text;
    }
    if (!outputText) return response.status(502).json({ error: 'The AI could not interpret that question. Your inventory was not changed; try asking in a different way.' });
    const plan = JSON.parse(outputText);
    if (!Array.isArray(plan.tasks)) throw new Error('Invalid AI plan');
    if (plan.tasks.length > 5) return response.status(400).json({ error: 'Please ask a shorter or more focused inventory question.' });
    const internalLookupTerms = new Set(['low stock', 'low_stock', 'summary', 'top selling', 'top_selling', 'financial lookup', 'stock lookup', 'stock change request', 'unsupported']);
    if (plan.tasks.some((task) => task.intent === 'stock_lookup' && task.productNames.some((name) => internalLookupTerms.has(normalizeAssistantText(name).replace(/ /g, '_'))))) {
      return response.json({ answer: 'I could not interpret that inventory question. Try the Low stock suggestion, ask for one product by name or SKU, or request an inventory summary.' });
    }
    const changes = plan.tasks.filter((task) => task.intent === 'stock_change_request');
    if (changes.length) {
      if (plan.tasks.length !== 1 || changes.length !== 1) return response.json({ answer: 'Please ask about one inventory change at a time so I can show you a clear confirmation.' });
      const task = changes[0];
      if (!task.productNames.length || task.quantity < 1 || task.direction === 'unknown') {
        return response.json({ answer: 'To prepare a change, include one product name or SKU, a whole-number quantity, and whether stock is coming in or going out. I will show a review card before anything is saved.' });
      }
      const matches = findProducts([task.productNames[0]])[0].matches;
      if (!matches.length) return response.json({ answer: `I couldn't find “${task.productNames[0]}” in the product records. Nothing was changed.` });
      if (matches.length !== 1) return response.json({ answer: `I found multiple products for “${task.productNames[0]}”. Ask again using an exact product name or SKU. Nothing was changed.` });
      if (!['in', 'out'].includes(task.direction)) return response.json({ answer: 'Please say whether stock is coming in or going out. Nothing was changed.' });
      const product = matches[0];
      const reason = task.direction === 'in' ? 'receipt' : (['sale', 'damage', 'transfer', 'adjustment', 'other'].includes(task.reason) ? task.reason : 'other');
      if (task.direction === 'out' && task.quantity > product.quantity) {
        return response.json({ answer: `Only ${product.quantity} ${product.unit} of ${product.name} are available, so I cannot prepare that stock-out. Nothing was changed.` });
      }
      const proposalId = randomBytes(24).toString('hex');
      const proposal = {
        id: proposalId, userId: request.user.id, productId: product.id,
        productName: product.name, sku: product.sku, unit: product.unit,
        movementType: task.direction, reason, quantity: task.quantity,
        previousQuantity: product.quantity,
        newQuantity: task.direction === 'in' ? product.quantity + task.quantity : product.quantity - task.quantity,
        expiresAt: Date.now() + PROPOSAL_LIFETIME_MS,
      };
      for (const [id, pending] of pendingStockProposals) if (pending.expiresAt <= Date.now()) pendingStockProposals.delete(id);
      pendingStockProposals.set(proposalId, proposal);
      return response.json({
        answer: 'I prepared this stock change for review. The database has not been changed. Confirm only if the product, quantity, direction, and reason below are correct.',
        proposal: {
          id: proposal.id, productName: proposal.productName, sku: proposal.sku, unit: proposal.unit,
          movementType: proposal.movementType, reason: proposal.reason, quantity: proposal.quantity,
          previousQuantity: proposal.previousQuantity, newQuantity: proposal.newQuantity,
          expiresAt: new Date(proposal.expiresAt).toISOString(),
        },
      });
    }
    return response.json({ answer: resolveInventoryQuestion(plan, request.user) });
  } catch (error) {
    console.error('InventraIQ assistant request failed:', error.name || 'Error');
    if (provider === 'ollama') return response.status(502).json({ error: `Could not reach Ollama. Start Ollama and make sure ${model} is installed. Your inventory was not changed.` });
    return response.status(502).json({ error: 'The AI service could not answer just now. Your inventory was not changed; please try again.' });
  }
});

app.post('/api/assistant/proposals/:id/confirm', requireAuth, (request, response) => {
  const proposal = pendingStockProposals.get(request.params.id);
  if (!proposal || proposal.userId !== request.user.id) return response.status(404).json({ error: 'This proposal is unavailable. Ask the assistant to prepare it again.' });
  if (proposal.expiresAt <= Date.now()) {
    pendingStockProposals.delete(proposal.id);
    return response.status(410).json({ error: 'This proposal expired. Ask the assistant to prepare it again.' });
  }
  const productStatement = db.prepare('SELECT quantity FROM products WHERE id = ?');
  productStatement.bind([proposal.productId]);
  const current = productStatement.step() ? productStatement.getAsObject().quantity : null;
  productStatement.free();
  if (current === null || current !== proposal.previousQuantity) {
    pendingStockProposals.delete(proposal.id);
    return response.status(409).json({ error: 'This item’s stock changed after the proposal was prepared. Nothing was changed by this confirmation; please ask for a fresh proposal.' });
  }
  if (proposal.movementType === 'out' && proposal.quantity > current) {
    pendingStockProposals.delete(proposal.id);
    return response.status(409).json({ error: 'There is not enough stock now. Nothing was changed; please ask for a fresh proposal.' });
  }
  try {
    db.run('BEGIN TRANSACTION');
    db.run('UPDATE products SET quantity = ? WHERE id = ?', [proposal.newQuantity, proposal.productId]);
    db.run(`INSERT INTO stock_movements (product_id, movement_type, reason, quantity, previous_quantity, new_quantity, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [proposal.productId, proposal.movementType, proposal.reason, proposal.quantity, current, proposal.newQuantity, 'AI-assisted movement confirmed by user', request.user.id, new Date().toISOString()]);
    db.run('COMMIT');
    saveDatabase();
    pendingStockProposals.delete(proposal.id);
    return response.json({ ok: true, productName: proposal.productName, previousQuantity: current, newQuantity: proposal.newQuantity });
  } catch (error) {
    db.run('ROLLBACK');
    console.error('Could not apply confirmed assistant proposal:', error.name || 'Error');
    return response.status(500).json({ error: 'The proposal could not be saved. No stock change was applied.' });
  }
});

app.post('/api/assistant/proposals/:id/cancel', requireAuth, (request, response) => {
  const proposal = pendingStockProposals.get(request.params.id);
  if (!proposal || proposal.userId !== request.user.id) return response.status(404).json({ error: 'This proposal is unavailable.' });
  pendingStockProposals.delete(proposal.id);
  return response.json({ ok: true, cancelled: true });
});

const port = Number(process.env.API_PORT || 3001);
app.listen(port, '127.0.0.1', () => console.log(`InventraIQ API ready at http://127.0.0.1:${port}`));
