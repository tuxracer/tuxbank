export type DateCell = {
  date: Date;
  iso: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
  /**
   * Set where the day number alone would not say which month the cell is in:
   * a fixed-week window has no month of its own, so its first cell and every
   * 1st it contains spell theirs out. Never set in the month grid.
   */
  showMonth?: boolean;
};
