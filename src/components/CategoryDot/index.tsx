import type { CategoryColor } from "@/types";
import { catColorVar } from "@/utils/categoryColor";

export const CategoryDot = ({ color }: { color: CategoryColor }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    style={{ background: catColorVar(color) }}
  />
);
