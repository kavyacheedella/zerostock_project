// db/init.js  –  uses sql.js (pure JavaScript SQLite, no C++ compilation needed)
const path = require("path");
const fs   = require("fs");

const DB_PATH = path.join(__dirname, "zeerostock.db");

function initDB() {
  const initSqlJs = require("sql.js");

  return initSqlJs().then(SQL => {

    // Load existing DB from disk, or create fresh
    let db;
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    // Persist DB to disk after every write
    function save() {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }

    // ── Schema ──────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT    NOT NULL,
        city TEXT    NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS inventory (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id  INTEGER NOT NULL,
        product_name TEXT    NOT NULL,
        category     TEXT    NOT NULL DEFAULT 'General',
        quantity     INTEGER NOT NULL,
        price        REAL    NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_price    ON inventory(price)`);

    // ── Seed only if empty ──────────────────────────────────
    const countResult = db.exec("SELECT COUNT(*) as n FROM suppliers");
    const count = countResult[0]?.values[0][0] ?? 0;

    if (count === 0) {
      db.run("INSERT INTO suppliers (name, city) VALUES (?,?)", ["GlobalTech Surplus", "Mumbai"]);
      const s1 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      db.run("INSERT INTO suppliers (name, city) VALUES (?,?)", ["QuickStock India", "Delhi"]);
      const s2 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      db.run("INSERT INTO suppliers (name, city) VALUES (?,?)", ["SurplusHub South", "Bangalore"]);
      const s3 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      db.run("INSERT INTO suppliers (name, city) VALUES (?,?)", ["TechBridge Traders", "Chennai"]);
      const s4 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];

      const items = [
        [s1, "Laptop",              "Electronics",  25,  45000],
        [s1, "USB-C Hub",           "Electronics", 200,    850],
        [s1, "Mechanical Keyboard", "Electronics",  80,   3200],
        [s1, "Monitor 24inch FHD",  "Electronics",  18,  16500],
        [s2, "Office Chair",        "Furniture",    15,   7500],
        [s2, "Standing Desk",       "Furniture",     8,  18000],
        [s2, "Laptop Stand",        "Furniture",   120,   1200],
        [s2, "Ergonomic Mouse Pad", "Accessories", 230,    380],
        [s3, "Wireless Mouse",      "Electronics", 350,    650],
        [s3, "HDMI Cable 2m",       "Accessories", 500,    299],
        [s3, "Webcam 1080p",        "Electronics",  60,   3800],
        [s4, "Printer Ink Set",     "Accessories", 180,   1450],
        [s4, "A4 Paper Ream",       "Stationery",  400,    420],
        [s4, "Laptop Bag 15inch",   "Accessories",  95,   1800],
      ];
      for (const [sid, pname, cat, qty, price] of items) {
        db.run(
          "INSERT INTO inventory (supplier_id, product_name, category, quantity, price) VALUES (?,?,?,?,?)",
          [sid, pname, cat, qty, price]
        );
      }
      save();
      console.log("✅ Database seeded with sample data.");
    }

    // ── Thin wrapper API (mirrors better-sqlite3 interface) ─
    return {
      // SELECT → array of row objects
      query(sql, params = []) {
        const result = db.exec(sql, params);
        if (!result || result.length === 0) return [];
        const { columns, values } = result[0];
        return values.map(row => {
          const obj = {};
          columns.forEach((col, i) => (obj[col] = row[i]));
          return obj;
        });
      },

      // INSERT / UPDATE / DELETE → { lastInsertRowid }
      run(sql, params = []) {
        db.run(sql, params);
        const rowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0];
        save();
        return { lastInsertRowid: rowid };
      },

      // SELECT single row → object or undefined
      get(sql, params = []) {
        return this.query(sql, params)[0];
      },
    };
  });
}

module.exports = { initDB };
