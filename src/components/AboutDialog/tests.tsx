import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AboutDialog from "./index";
import { LICENSE_URL, REPO_URL } from "./consts";

describe("AboutDialog", () => {
  it("states the license and links to it", () => {
    render(<AboutDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/free and open source/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MIT License" })).toHaveAttribute(
      "href",
      LICENSE_URL,
    );
  });

  it("links to the source repository in a new tab", () => {
    render(<AboutDialog open onOpenChange={vi.fn()} />);
    const repoLink = screen.getByRole("link", { name: REPO_URL });
    expect(repoLink).toHaveAttribute("href", REPO_URL);
    expect(repoLink).toHaveAttribute("target", "_blank");
  });

  it("renders nothing when closed", () => {
    render(<AboutDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("link", { name: REPO_URL })).toBeNull();
  });

  it("closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<AboutDialog open onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
