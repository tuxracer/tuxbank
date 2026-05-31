import { describe, it, expect } from "vitest";
import { createMemoryConnection } from "./memoryConnection";

describe("in-memory sqlite connection", () => {
  it("applies the schema and round-trips a category", async () => {
    const db = await createMemoryConnection();
    await db.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const rows = await db.selectAll("SELECT id,name,color FROM categories");
    expect(rows).toEqual([{ id: "c1", name: "Rent", color: "magenta" }]);
  });

  it("enforces STRICT CHECK constraints (rejects a bad direction)", async () => {
    const db = await createMemoryConnection();
    await expect(
      db.run(
        "INSERT INTO events (id,title,date,category_id,amount,direction,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        ["e1", "X", "2026-05-01", "c1", 1, "sideways", "t", "t"],
      ),
    ).rejects.toThrow();
  });

  it("cascades override deletion when the event is deleted", async () => {
    const db = await createMemoryConnection();
    await db.run(
      "INSERT INTO events (id,title,date,category_id,amount,direction,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ["e1", "X", "2026-05-01", "c1", 1, "deposit", "t", "t"],
    );
    await db.run(
      "INSERT INTO event_overrides (event_id,occurrence_date,cancelled) VALUES (?,?,?)",
      ["e1", "2026-05-08", 1],
    );
    await db.run("DELETE FROM events WHERE id = ?", ["e1"]);
    const overrides = await db.selectAll("SELECT * FROM event_overrides");
    expect(overrides).toEqual([]);
  });
});
