# Order Management System - Assignment Submission

## Overview

A full-stack order management system that migrates messy restaurant order data into a clean schema with cursor-based pagination and an interactive UI.

## Tech Stack

**Backend:** Bun + Elysia + SQLite + Zod  
**Frontend:** TanStack Start + React + Tailwind + TanStack Table

---

## Backend Setup

```bash
cd backend
bun install
bun run migrate  # Normalize messy data into clean schema
bun run seed     # Load sample data
bun run dev      # Server runs on http://localhost:3000
```

API Endpoints
Method Endpoint Description
GET /api/orders?cursor=&limit=20 List orders (cursor pagination)
GET /api/orders/:id Get single order
POST /api/orders Create order
PUT /api/orders/:id Update order
DELETE /api/orders/:id Delete order

Database Schema (4 tables)
orders - Core order data (normalized)
order_items - Line items
order_metadata - Preserves all original messy data (no data loss)
audit_log - Track changes
