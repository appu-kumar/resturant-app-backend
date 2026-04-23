import { Database } from "bun:sqlite";

export const db = new Database("database/orders.db");

db.run(`PRAGMA journal_mode = WAL`);
db.run(`PRAGMA foreign_keys = ON`);

db.run(`CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Unknown',
  phone TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS waiters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Unknown',
  phone TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS normalized_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_order_id TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  waiter_id INTEGER REFERENCES waiters(id),
  table_number TEXT,
  total_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  order_date TEXT,
  raw_food_items TEXT,
  raw_metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES normalized_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1
)`);

const alreadyMigrated = (db.query(
  `SELECT COUNT(*) as c FROM normalized_orders`
).get() as { c: number }).c > 0;

if (!alreadyMigrated) {
  console.log("Running migration...");

  function normalizeStatus(s: string | null): string {
    const v = (s ?? "").trim().toLowerCase();
    if (v === "1" || v === "active") return "active";
    if (v === "completed") return "completed";
    if (v === "cancelled" || v === "canceled") return "cancelled";
    return "active";
  }

  function parsePrice(s: string | null): number | null {
    if (!s || s.trim() === "") return null;
    const cleaned = s.replace(/[$]/g, "").replace(",", ".").trim();
    const val = parseFloat(cleaned);
    return isNaN(val) ? null : Math.round(val * 100);
  }

  function parseDate(s: string | null): string | null {
    if (!s || s.trim() === "") return null;
    const v = s.trim();
    if (/^\d{13}$/.test(v)) return new Date(parseInt(v)).toISOString();
    const slash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slash) return new Date(`${slash[3]}-${slash[1]}-${slash[2]}`).toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function cleanName(s: string | null): string {
    const v = (s ?? "").trim().replace(/\s+/g, " ");
    if (!v || v === "?" || v.toLowerCase() === "unknown") return "Unknown";
    return v;
  }

  function cleanPhone(s: string | null): string | null {
    const v = (s ?? "").trim();
    if (!v || ["n/a", "unknown", "na"].includes(v.toLowerCase())) return null;
    return v;
  }

  function parseFoodItems(s: string | null): { name: string; quantity: number }[] {
    if (!s || s.trim() === "") return [];
    const v = s.trim();
    if (v.startsWith("[")) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          return parsed.flatMap((item: any) => {
            if (typeof item === "string") return [parseItemText(item)];
            if (Array.isArray(item)) return [{ name: String(item[0]), quantity: Number(item[1] ?? 1) }];
            if (item?.sku) return [{ name: item.sku, quantity: Number(item.qty ?? 1) }];
            return [];
          });
        }
      } catch {}
    }
    if (v.startsWith("{")) {
      try {
        const parsed = JSON.parse(v);
        if (parsed.items) return parsed.items.map((i: any) => ({ name: i.sku ?? "Unknown", quantity: Number(i.qty ?? 1) }));
      } catch {}
    }
    let parts: string[];
    if (v.includes("|")) parts = v.split("|");
    else if (v.includes(";")) parts = v.split(";");
    else if (v.includes("\n")) parts = v.split("\n");
    else parts = v.split(",");
    return parts.map((p) => p.trim()).filter(Boolean).map(parseItemText);
  }

  function parseItemText(s: string): { name: string; quantity: number } {
    s = s.trim();
    const a = s.match(/^qty\s+(\d+)x?\s+(.+)$/i);
    if (a) return { name: a[2].trim(), quantity: parseInt(a[1]) };
    const b = s.match(/^(\d+)\s*x\s+(.+)$/i);
    if (b) return { name: b[2].trim(), quantity: parseInt(b[1]) };
    const c = s.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
    if (c) return { name: c[1].trim(), quantity: parseInt(c[2]) };
    return { name: s, quantity: 1 };
  }

  function getOrCreate(table: string, name: string, phone: string | null): number {
    const clean = cleanName(name);
    const ex = db.query(`SELECT id FROM ${table} WHERE name = ?`).get(clean) as { id: number } | null;
    if (ex) return ex.id;
    return (db.query(`INSERT INTO ${table} (name, phone) VALUES (?, ?) RETURNING id`).get(clean, phone) as { id: number }).id;
  }

  const rawRows = db.query(`SELECT * FROM orders`).all() as any[];

  for (const row of rawRows) {
    const customerId = getOrCreate("customers", row.customer_name, cleanPhone(row.customer_phone));
    const waiterId = getOrCreate("waiters", row.waiter_name, cleanPhone(row.waiter_phone));

    const orderRow = db.query(`
      INSERT INTO normalized_orders
        (raw_order_id, customer_id, waiter_id, table_number,
         total_cents, status, order_date, raw_food_items, raw_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).get(
      (row.order_id ?? "").trim(),
      customerId, waiterId,
      (row.table_number ?? "").trim() || null,
      parsePrice(row.price),
      normalizeStatus(row.status),
      parseDate(row.order_date),
      row.food_items,
      row.metadata
    ) as { id: number };

    for (const item of parseFoodItems(row.food_items)) {
      db.run(`INSERT INTO order_items (order_id, name, quantity) VALUES (?, ?, ?)`,
        [orderRow.id, item.name, item.quantity]);
    }
  }

  console.log(`Migration done! ${rawRows.length} orders migrated.`);
}