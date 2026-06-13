import type { CategoryColor } from "@/types";

export type CategoryColorPickerProps = {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  label?: string;
};
