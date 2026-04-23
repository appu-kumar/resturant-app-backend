import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

mkdirSync("database", { recursive: true });

const db = new Database("database/orders.db");

db.run(`DROP TABLE IF EXISTS orders`);

db.run(`CREATE TABLE orders (
  id   TEXT,
  customer TEXT,
  items TEXT,
  total TEXT,
  status TEXT,
  created_at TEXT
)`);

const rows = [
  ["1", "Alice",     "Burger x2, Fries",   "12.50",  "completed",  "2024-01-15"],
  ["2", "बॉब",       "Pizza",              "8.99",   "PENDING",    "15-01-2024"],
  ["3", "",          "Salad, Water",        "5.00",   "pending",    ""],
  ["4", "Carlos",    "Tacos x3",            null,     "cancelled",  "2024/01/16"],
  ["5", "Diana 😊",  "Sushi",              "22.00",  "Completed",  "2024-01-16T10:30:00"],
  ["6", "N/A",       "Pasta",              "10.00",  "COMPLETED",  "2024-01-17"],
  ["7", "Maria",     "Burger, Coke",        "9.50",   "Pending",    "17-01-2024"],
  ["8", null,        "Ice Cream",           "3.50",   "cancelled",  "2024-01-18"],
];

const insert = db.prepare(
  `INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)`
);

for (const row of rows) {
  insert.run(...(row as [string, string, string, string, string, string]));
}

console.log("✅ Seeded orders table with messy data");
db.close();