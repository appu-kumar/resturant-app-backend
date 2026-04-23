import Elysia from "elysia";
import { z } from "zod";
import { db } from "../db";

const OrderShape = z.object({
  id: z.number(),
  raw_order_id: z.string(),
  customer: z.string(),
  waiter: z.string(),
  table_number: z.string().nullable(),
  items: z.string().nullable(),
  total: z.number().nullable(),
  status: z.string(),
  order_date: z.string().nullable(),
});

const CreateBody = z.object({
  customer: z.string().min(1),
  waiter: z.string().min(1),
  table_number: z.string().optional(),
  items: z.string().optional(),
  total: z.number().nonnegative().optional(),
  status: z.enum(["active", "completed", "cancelled"]).default("active"),
});

const UpdateBody = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  total: z.number().nonnegative().optional(),
  items: z.string().optional(),
});

const SELECT = `
  SELECT o.id, o.raw_order_id, c.name AS customer, w.name AS waiter,
         o.table_number, o.raw_food_items, o.total_cents, o.status, o.order_date
  FROM normalized_orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  LEFT JOIN waiters w ON o.waiter_id = w.id
`;

function rowToOrder(row: any) {
  return OrderShape.parse({
    id: row.id,
    raw_order_id: row.raw_order_id,
    customer: row.customer ?? "Unknown",
    waiter: row.waiter ?? "Unknown",
    table_number: row.table_number,
    items: row.raw_food_items,
    total: row.total_cents != null ? row.total_cents / 100 : null,
    status: row.status,
    order_date: row.order_date,
  });
}

export const ordersRouter = new Elysia({ prefix: "/orders" })

  .get("/", ({ query }) => {
    const limit = Math.min(Number(query.limit ?? 10), 100);
    const cursor = query.cursor ? Number(query.cursor) : null;
    const rows = db.query(`${SELECT}
      WHERE (? IS NULL OR o.id > ?)
      ORDER BY o.id ASC LIMIT ?
    `).all(cursor, cursor, limit + 1) as any[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(rowToOrder);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  })

  .get("/:id", ({ params, set }) => {
    const row = db.query(`${SELECT} WHERE o.id = ?`).get(params.id) as any;
    if (!row) { set.status = 404; return { error: "Not found" }; }
    return rowToOrder(row);
  })

  .post("/", ({ body, set }) => {
    const p = CreateBody.safeParse(body);
    if (!p.success) { set.status = 400; return { error: p.error.flatten() }; }
    const d = p.data;
    function getOrCreate(table: string, name: string): number {
      const ex = db.query(`SELECT id FROM ${table} WHERE name = ?`).get(name) as any;
      if (ex) return ex.id;
      return (db.query(`INSERT INTO ${table} (name) VALUES (?) RETURNING id`).get(name) as any).id;
    }
    const cId = getOrCreate("customers", d.customer);
    const wId = getOrCreate("waiters", d.waiter);
    const row = db.query(`
      INSERT INTO normalized_orders
        (raw_order_id, customer_id, waiter_id, table_number, total_cents, status, raw_food_items, order_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).get(
      `ORD-NEW-${Date.now()}`, cId, wId,
      d.table_number ?? null,
      d.total != null ? Math.round(d.total * 100) : null,
      d.status, d.items ?? null, new Date().toISOString()
    ) as any;
    set.status = 201;
    return rowToOrder(db.query(`${SELECT} WHERE o.id = ?`).get(row.id) as any);
  })

  .put("/:id", ({ params, body, set }) => {
    const ex = db.query(`SELECT id FROM normalized_orders WHERE id = ?`).get(params.id);
    if (!ex) { set.status = 404; return { error: "Not found" }; }
    const p = UpdateBody.safeParse(body);
    if (!p.success) { set.status = 400; return { error: p.error.flatten() }; }
    const d = p.data;
    if (d.status) db.run(`UPDATE normalized_orders SET status = ? WHERE id = ?`, [d.status, params.id]);
    if (d.total != null) db.run(`UPDATE normalized_orders SET total_cents = ? WHERE id = ?`, [Math.round(d.total * 100), params.id]);
    if (d.items != null) db.run(`UPDATE normalized_orders SET raw_food_items = ? WHERE id = ?`, [d.items, params.id]);
    return rowToOrder(db.query(`${SELECT} WHERE o.id = ?`).get(params.id) as any);
  })

  .delete("/:id", ({ params, set }) => {
    const ex = db.query(`SELECT id FROM normalized_orders WHERE id = ?`).get(params.id);
    if (!ex) { set.status = 404; return { error: "Not found" }; }
    db.run(`DELETE FROM normalized_orders WHERE id = ?`, [params.id]);
    return { success: true, deleted: Number(params.id) };
  });