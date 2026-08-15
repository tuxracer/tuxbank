/**
 * Response constraint handed to the on-device model so it can only emit the
 * QuickAddModelOutput shape. Stays inside the conservative subset of JSON
 * Schema the Prompt API supports: no nullable unions, so "" means "none" for
 * endsOn and category.
 */
export const QUICK_ADD_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "amount",
    "direction",
    "date",
    "repeat",
    "interval",
    "endsOn",
    "category",
  ],
  properties: {
    title: { type: "string" },
    amount: { type: "number" },
    direction: { enum: ["deposit", "withdrawal"] },
    date: { type: "string" },
    repeat: { enum: ["none", "daily", "weekly", "monthly", "yearly"] },
    interval: { type: "integer", minimum: 1 },
    endsOn: { type: "string" },
    category: { type: "string" },
  },
} as const;
