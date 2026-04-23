import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { ordersRouter } from "./routes/orders";
import "./db";

const app = new Elysia()
  .use(cors())
  .use(ordersRouter)
  .get("/health", () => ({ status: "ok" }))
  .listen(3000);

console.log("API running at http://localhost:3000");