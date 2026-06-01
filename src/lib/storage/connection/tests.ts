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

describe("export / import (in-memory)", () => {
  it("round-trips the database via export + commitImport", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([]);
    await b.commitImport(bytes);
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([
      { id: "c1" },
    ]);
  });

  it("validateImport returns counts + schema version without changing data", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    expect(await b.validateImport(bytes)).toEqual({
      events: 0,
      categories: 1,
      schemaVersion: 1,
    });
    // unchanged
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([]);
  });

  it("rejects a non-sqlite buffer with IMPORT_INVALID", async () => {
    const a = await createMemoryConnection();
    await expect(
      a.commitImport(new Uint8Array([1, 2, 3, 4])),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
  });

  it("rejects a valid sqlite db missing our tables", async () => {
    const a = await createMemoryConnection();
    await a.run("DROP TABLE event_overrides");
    await a.run("DROP TABLE events");
    await a.run("DROP TABLE categories");
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    await expect(b.validateImport(bytes)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("rejects a db whose schema version differs", async () => {
    const a = await createMemoryConnection();
    await a.run("PRAGMA user_version = 99");
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    await expect(b.validateImport(bytes)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("does not corrupt existing data when commitImport is rejected", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "keep",
      "Keep",
      "cyan",
    ]);
    await expect(
      a.commitImport(new Uint8Array([1, 2, 3])),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
    expect(await a.selectAll("SELECT id FROM categories")).toEqual([
      { id: "keep" },
    ]);
  });
});
