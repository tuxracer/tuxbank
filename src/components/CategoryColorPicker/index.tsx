import { catColorVar, PALETTE } from "@/utils/categoryColor";
import { CategoryDot } from "@/components/CategoryDot";

import type { CategoryColorPickerProps } from "./types";

export * from "./types";

export const CategoryColorPicker = ({
  value,
  onChange,
  label,
}: CategoryColorPickerProps) => (
  <div className="flex items-center gap-2">
    {label && (
      <span className="cy-mono text-[10px] uppercase text-[color:var(--cy-muted)]">
        {label}
      </span>
    )}
    {PALETTE.map((color) => (
      <button
        key={color}
        type="button"
        title={color}
        onClick={() => onChange(color)}
        className="rounded-full p-0.5"
        style={{
          outline: value === color ? `2px solid ${catColorVar(color)}` : "none",
        }}
      >
        <CategoryDot color={color} />
      </button>
    ))}
  </div>
);
