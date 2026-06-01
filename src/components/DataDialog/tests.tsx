import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageError } from "@/lib/storage";
import DataDialog from "./index";

const base = {
  open: true,
  currentEventCount: 3,
  currentCategoryCount: 2,
  storageAvailable: true,
  onExport: vi.fn().mockResolvedValue(undefined),
  onPreviewImport: vi
    .fn()
    .mockResolvedValue({ events: 5, categories: 4, schemaVersion: 1 }),
  onCommitImport: vi.fn().mockResolvedValue(undefined),
  onOpenChange: vi.fn(),
};

const fileInput = (): HTMLElement =>
  screen.getByLabelText(/import database file/i);

describe("DataDialog", () => {
  it("triggers export when the export button is clicked", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<DataDialog {...base} onExport={onExport} />);
    await userEvent.click(
      screen.getByRole("button", { name: /export database/i }),
    );
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("validates a chosen file and shows the confirmation with counts", async () => {
    render(<DataDialog {...base} />);
    const file = new File([new Uint8Array([1, 2, 3])], "backup.sqlite3");
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(base.onPreviewImport).toHaveBeenCalledWith(file);
    expect(
      await screen.findByText(/replace all current data/i),
    ).toBeInTheDocument();
    // current counts and backup counts both shown
    expect(screen.getAllByText(/3 events/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/5 events/i)).toBeInTheDocument();
  });

  it("commits the import after the user confirms", async () => {
    const onCommitImport = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <DataDialog
        {...base}
        onCommitImport={onCommitImport}
        onOpenChange={onOpenChange}
      />,
    );
    const file = new File([new Uint8Array([1, 2, 3])], "backup.sqlite3");
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await userEvent.click(
      await screen.findByRole("button", { name: /replace data/i }),
    );
    expect(onCommitImport).toHaveBeenCalledWith(file);
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a clear error for an invalid backup and does not confirm", async () => {
    const onPreviewImport = vi
      .fn()
      .mockRejectedValue(new StorageError("IMPORT_INVALID"));
    render(<DataDialog {...base} onPreviewImport={onPreviewImport} />);
    const file = new File([new Uint8Array([9])], "bad.txt");
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(
      await screen.findByText(/isn't a valid tuxbank backup/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /replace data/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a context-neutral error when export fails", async () => {
    const onExport = vi
      .fn()
      .mockRejectedValue(new StorageError("EXPORT_FAILED"));
    render(<DataDialog {...base} onExport={onExport} />);
    await userEvent.click(
      screen.getByRole("button", { name: /export database/i }),
    );
    expect(
      await screen.findByText(/something went wrong\. please try again\./i),
    ).toBeInTheDocument();
  });

  it("disables both actions when storage is unavailable", () => {
    render(<DataDialog {...base} storageAvailable={false} />);
    expect(
      screen.getByRole("button", { name: /export database/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /import database/i }),
    ).toBeDisabled();
  });
});
