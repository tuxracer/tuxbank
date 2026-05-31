import { groupBy } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { StorageError, type StorageErrorCode } from "./types";
import { getConnection } from "./connection";
import {
  DELETE_OVERRIDES_SQL,
  INSERT_OVERRIDE_SQL,
  UPSERT_CATEGORY_SQL,
  UPSERT_EVENT_SQL,
} from "./consts";
import {
  categoryToRow,
  eventToColumns,
  overrideToColumns,
  rowToCategory,
  rowToEvent,
  rowToOverride,
} from "./mappers";

export * from "./consts";
export * from "./types";
export { onConnectionStatus } from "./connection";

const toStorageError = (
  error: unknown,
  code: StorageErrorCode,
): StorageError =>
  error instanceof StorageError ? error : new StorageError(code, error);

const LEGACY_CATEGORY_BY_ID = new Map(PRESET_CATEGORIES.map((c) => [c.id, c]));

/** Build the category records implied by the categoryIds already on events. */
export const seedCategoriesFromEvents = (
  events: CalendarEvent[],
): Category[] => {
  const byId = new Map<string, Category>();
  for (const event of events) {
    if (byId.has(event.categoryId)) continue;
    const legacy = LEGACY_CATEGORY_BY_ID.get(event.categoryId);
    byId.set(
      event.categoryId,
      legacy ?? { id: event.categoryId, name: event.categoryId, color: "cyan" },
    );
  }
  return [...byId.values()];
};

export const getAllEvents = async (): Promise<CalendarEvent[]> => {
  try {
    const conn = await getConnection();
    const [eventRows, overrideRows] = await Promise.all([
      conn.selectAll("SELECT * FROM events"),
      conn.selectAll("SELECT * FROM event_overrides"),
    ]);
    const overridesByEvent = groupBy(overrideRows, (r) => String(r.event_id));
    return eventRows
      .map((row) =>
        rowToEvent(
          row,
          (overridesByEvent[String(row.id)] ?? []).map(rowToOverride),
        ),
      )
      .filter((event): event is CalendarEvent => event !== null);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const putEvent = async (event: CalendarEvent): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.tx([
      { sql: UPSERT_EVENT_SQL, bind: eventToColumns(event) },
      { sql: DELETE_OVERRIDES_SQL, bind: [event.id] },
      ...event.overrides.map((override) => ({
        sql: INSERT_OVERRIDE_SQL,
        bind: overrideToColumns(event.id, override),
      })),
    ]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run("DELETE FROM events WHERE id = ?", [id]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const conn = await getConnection();
    const rows = await conn.selectAll("SELECT * FROM categories");
    return rows
      .map(rowToCategory)
      .filter((category): category is Category => category !== null);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const putCategory = async (category: Category): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run(UPSERT_CATEGORY_SQL, categoryToRow(category));
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run("DELETE FROM categories WHERE id = ?", [id]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};
