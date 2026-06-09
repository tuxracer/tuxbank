import { encryptPayload, decryptPayload } from "@/lib/crypto";
import { sealedBoxToRow, rowToSealedBox } from "@/lib/supabase";
import type { CalendarEvent, Category } from "@/types";
import type { RemoteRow } from "./types";

export * from "./consts";
export * from "./types";

/** A remote row counts as newer only when strictly greater (so equal = skip). */
export const isRemoteNewer = (
  remoteUpdatedAt: string,
  localUpdatedAt: string | undefined,
): boolean => localUpdatedAt === undefined || remoteUpdatedAt > localUpdatedAt;

export const encryptRecord = async (
  record: CalendarEvent | Category,
  dek: Uint8Array,
): Promise<RemoteRow> => {
  const box = await encryptPayload(record, dek);
  return {
    id: record.id,
    updated_at: record.updatedAt,
    deleted: false,
    ...sealedBoxToRow(box),
  };
};

export const encryptTombstone = async (
  id: string,
  updatedAt: string,
  dek: Uint8Array,
): Promise<RemoteRow> => {
  const box = await encryptPayload({}, dek);
  return { id, updated_at: updatedAt, deleted: true, ...sealedBoxToRow(box) };
};

export const decryptRow = async (
  row: RemoteRow,
  dek: Uint8Array,
): Promise<unknown> => decryptPayload(rowToSealedBox(row), dek);
