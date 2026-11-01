import { toISODate } from "@/lib/dateGrid";

export const BACKUP_FILE_EXTENSION = ".json";

/** Today's suggested backup name, without the extension: `tuxbank-backup-YYYY-MM-DD`. */
export const defaultBackupFilename = (): string =>
  `tuxbank-backup-${toISODate(new Date())}`;

// Path separators never belong in a download name; browsers replace them
// anyway, but inconsistently across engines.
const PATH_SEPARATORS = /[\\/]/g;

/**
 * Turn what the user typed into the name the download is saved under: trim,
 * drop path separators, fall back to the default when nothing is left, and
 * add the extension unless one is already there.
 */
export const resolveBackupFilename = (input: string): string => {
  const trimmed = input.replace(PATH_SEPARATORS, "").trim();
  const base = trimmed === "" ? defaultBackupFilename() : trimmed;
  return base.toLowerCase().endsWith(BACKUP_FILE_EXTENSION)
    ? base
    : `${base}${BACKUP_FILE_EXTENSION}`;
};
