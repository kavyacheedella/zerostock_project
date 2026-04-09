// server.js
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const { initDB } = require("./db/init");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// sql.js initialises asynchronously, so we boot DB first then register routes
initDB().then(db => {

  // ══════════════════════════════════════════════════════════
  //  ASSIGNMENT A  –  Search API
  // ══════════════════════════════════════════════════════════

  /**
   * GET /search
   * Params: q, category, minPrice, maxPrice
   * All optional – no filters returns everything.
   */
  app.get("/search", (req, res) => {
    const { q, category, minPrice, maxPrice } = req.query;

    // Validate price inputs
    const min = minPrice !== undefined && minPrice !== "" ? parseFloat(minPrice) : null;
    const max = maxPrice !== undefined && maxPrice !== "" ? parseFloat(maxPrice) : null;

    if (min !== null && isNaN(min))
      return res.status(400).json({ error: "minPrice must be a valid number." });
    if (max !== null && isNaN(max))
      return res.status(400).json({ error: "maxPrice must be a valid number." });
    if (min !== null && max !== null && min > max)
      return res.status(400).json({ error: "minPrice cannot be greater than maxPrice." });

    // Build query dynamically
    let sql = `
      SELECT i.id, i.product_name, i.category, i.quantity, i.price,
             s.name AS supplier_name, s.city AS supplier_city
      FROM inventory i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (q && q.trim() !== "") {
      // LIKE with LOWER() for case-insensitive match (sql.js doesn't support COLLATE NOCASE in all builds)
      sql += " AND LOWER(i.product_name) LIKE LOWER(?)";
      params.push(`%${q.trim()}%`);
    }
    if (category && category.trim() !== "") {
      sql += " AND LOWER(i.category) = LOWER(?)";
      params.push(category.trim());
    }
    if (min !== null) {
      sql += " AND i.price >= ?";
      params.push(min);
    }
    if (max !== null) {
      sql += " AND i.price <= ?";
      params.push(max);
    }

    sql += " ORDER BY LOWER(i.product_name)";

    const results = db.query(sql, params);
    res.json({ count: results.length, results });
  });

  // ══════════════════════════════════════════════════════════
  //  ASSIGNMENT B  –  Database APIs
  // ══════════════════════════════════════════════════════════

  // POST /supplier
  app.post("/supplier", (req, res) => {
    const { name, city } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "")
      return res.status(400).json({ error: "Supplier name is required." });
    if (!city || typeof city !== "string" || city.trim() === "")
      return res.status(400).json({ error: "Supplier city is required." });

    const result = db.run(
      "INSERT INTO suppliers (name, city) VALUES (?, ?)",
      [name.trim(), city.trim()]
    );

    res.status(201).json({
      message: "Supplier created successfully.",
      supplier: { id: result.lastInsertRowid, name: name.trim(), city: city.trim() },
    });
  });

  // POST /inventory
  app.post("/inventory", (req, res) => {
    const { supplier_id, product_name, category, quantity, price } = req.body;

    if (!supplier_id)
      return res.status(400).json({ error: "supplier_id is required." });
    if (!product_name || product_name.trim() === "")
      return res.status(400).json({ error: "product_name is required." });
    if (quantity === undefined || quantity === null)
      return res.status(400).json({ error: "quantity is required." });
    if (parseInt(quantity) < 0)
      return res.status(400).json({ error: "quantity must be >= 0." });
    if (price === undefined || price === null)
      return res.status(400).json({ error: "price is required." });
    if (parseFloat(price) <= 0)
      return res.status(400).json({ error: "price must be > 0." });

    // Verify supplier exists
    const supplier = db.get("SELECT id FROM suppliers WHERE id = ?", [supplier_id]);
    if (!supplier)
      return res.status(404).json({ error: `Supplier with id ${supplier_id} not found.` });

    const result = db.run(
      "INSERT INTO inventory (supplier_id, product_name, category, quantity, price) VALUES (?,?,?,?,?)",
      [supplier_id, product_name.trim(), (category || "General").trim(), parseInt(quantity), parseFloat(price)]
    );

    res.status(201).json({
      message: "Inventory item created successfully.",
      item: {
        id: result.lastInsertRowid,
        supplier_id,
        product_name: product_name.trim(),
        category: (category || "General").trim(),
        quantity: parseInt(quantity),
        price: parseFloat(price),
      },
    });
  });

  // GET /inventory
  // Groups by supplier, sorted by total value (qty × price) DESC
  app.get("/inventory", (req, res) => {
    // Get all suppliers that have inventory
    const suppliers = db.query(`
      SELECT s.id, s.name, s.city,
             SUM(i.quantity * i.price) AS total_value
      FROM suppliers s
      JOIN inventory i ON i.supplier_id = s.id
      GROUP BY s.id
      ORDER BY total_value DESC
    `);

    // For each supplier, fetch their items
    const data = suppliers.map(s => {
      const items = db.query(
        "SELECT id, product_name, category, quantity, price FROM inventory WHERE supplier_id = ? ORDER BY product_name",
        [s.id]
      );
      return {
        supplier_id:   s.id,
        supplier_name: s.name,
        supplier_city: s.city,
        total_value:   s.total_value,
        items,
      };
    });

    res.json({ supplier_count: data.length, data });
  });

  // GET /suppliers  (for UI dropdown)
  app.get("/suppliers", (req, res) => {
    const rows = db.query("SELECT * FROM suppliers ORDER BY name");
    res.json(rows);
  });

  // ── Start server ──────────────────────────────────────────
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`🚀 Zeerostock running → http://localhost:${PORT}`)
  );

}).catch(err => {
  console.error("❌ Failed to initialise database:", err);
  process.exit(1);
});
