# Zeerostock – Inventory Search API + Database

Full solution for **Assignment A** (Search API + UI) and **Assignment B** (Database + APIs), built with **Node.js / Express + SQLite (better-sqlite3)**.

---

## Setup & Run

```bash
npm install
npm start
# → http://localhost:3000
```

---

## Project Structure

```
zeerostock/
├── server.js          # All routes (Assignment A + B)
├── db/
│   └── init.js        # Schema creation, indexes, seed data
├── public/
│   └── index.html     # Frontend UI (search + manage tabs)
├── package.json
└── README.md
```

---

## Assignment A – Search API

### Endpoint

```
GET /search
```

### Query Parameters

| Param       | Description                        |
|-------------|-------------------------------------|
| `q`         | Product name (partial, case-insensitive) |
| `category`  | Exact category match (case-insensitive)  |
| `minPrice`  | Minimum price (inclusive)           |
| `maxPrice`  | Maximum price (inclusive)           |

**No params → returns all results.**

### Search Logic

- Uses SQL `LIKE '%term%' COLLATE NOCASE` for partial, case-insensitive name matching.
- Filters are **combined with AND** — all supplied filters must match.
- Empty `q` is ignored (not treated as an error).
- Invalid price (non-numeric) returns HTTP 400.
- `minPrice > maxPrice` returns HTTP 400.

### Example Requests

```bash
# All results
GET /search

# Partial name match
GET /search?q=lap

# Category filter
GET /search?category=Electronics

# Price range
GET /search?minPrice=500&maxPrice=5000

# Combined
GET /search?q=mouse&category=Electronics&maxPrice=2000
```

### Performance Improvement for Large Datasets

**Current:** SQLite with `LIKE '%term%'` does a full table scan for prefix-less wildcards.

**Improvement:** Use **Full-Text Search (FTS5)** — SQLite's built-in FTS engine. Create a virtual FTS table:

```sql
CREATE VIRTUAL TABLE inventory_fts USING fts5(product_name, category, content='inventory', content_rowid='id');
```

This enables `MATCH` queries with tokenized indexing, making search O(log n) instead of O(n). For even larger scale, **Elasticsearch** or **Meilisearch** would provide fuzzy matching, typo tolerance, and sub-millisecond search across millions of records.

---

## Assignment B – Database APIs

### Schema

```sql
CREATE TABLE suppliers (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE inventory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  product_name TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'General',
  quantity     INTEGER NOT NULL CHECK(quantity >= 0),
  price        REAL NOT NULL CHECK(price > 0)
);
```

**Relationship:** One supplier → many inventory items (Foreign Key enforced).

### Endpoints

#### `POST /supplier`
```json
{ "name": "TechCorp India", "city": "Hyderabad" }
```
Returns 201 with created supplier object.

#### `POST /inventory`
```json
{
  "supplier_id": 1,
  "product_name": "USB Hub",
  "category": "Electronics",
  "quantity": 50,
  "price": 1299
}
```
- Validates `supplier_id` exists.
- Validates `quantity >= 0` and `price > 0`.
- Returns 201 with created item.

#### `GET /inventory`
Returns all inventory **grouped by supplier**, **sorted by total inventory value** (`quantity × price`) descending.

```json
{
  "supplier_count": 4,
  "data": [
    {
      "supplier_id": 1,
      "supplier_name": "GlobalTech Surplus",
      "supplier_city": "Mumbai",
      "total_value": 1432500,
      "items": [...]
    }
  ]
}
```

### Why SQLite?

- **Simplicity:** Zero-config, file-based — ideal for this assignment scope.
- **ACID compliant:** Full transaction support.
- **Sufficient for:** Thousands of records with proper indexing.

For production with concurrent writes at scale, **PostgreSQL** would be the choice — better concurrency model (MVCC), more advanced indexing (GIN, BRIN), and native JSON operators.

### Indexes Created

```sql
CREATE INDEX idx_inventory_product  ON inventory(product_name COLLATE NOCASE);
CREATE INDEX idx_inventory_category ON inventory(category     COLLATE NOCASE);
CREATE INDEX idx_inventory_price    ON inventory(price);
CREATE INDEX idx_inventory_supplier ON inventory(supplier_id);
```

**Optimization Suggestion:** For the grouped inventory query (which is essentially an aggregation by supplier), a **composite index** on `(supplier_id, quantity, price)` would allow the DB engine to compute `SUM(quantity * price)` directly from the index without touching the main table rows (a "covering index" / index-only scan), significantly speeding up the `GET /inventory` query at scale.

---

## Edge Cases Handled

| Case | Handling |
|---|---|
| Empty `q` | Returns all results (no filter applied) |
| Invalid `minPrice`/`maxPrice` | HTTP 400 with error message |
| `minPrice > maxPrice` | HTTP 400 with error message |
| No matches | `count: 0`, empty results array |
| Invalid `supplier_id` in POST /inventory | HTTP 404 |
| `quantity < 0` | HTTP 400 |
| `price <= 0` | HTTP 400 |
| Missing required fields | HTTP 400 with specific field error |
