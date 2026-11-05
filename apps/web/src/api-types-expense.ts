/** Gider kalemleri ve mal sahibi ekstresi tipleri — TUR:60. */

export type ExpenseRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  district: string | null;
  ownerId: string | null;
  ownerName: string | null;
  category: string;
  categoryLabel: string;
  amountKurus: number;
  amountText: string;
  spentOn: string;
  vendor: string | null;
  note: string | null;
  status: string;
  statusLabel: string;
  createdByName: string | null;
};

export type ExpenseList = {
  count: number;
  items: ExpenseRow[];
  totalKurus: number;
  totalText: string;
  categories: Array<{ category: string; label: string }>;
  statuses: Array<{ status: string; label: string }>;
};

export type StatementOwner = { id: string; name: string; propertyCount: number };

export type StatementOwnerList = { count: number; items: StatementOwner[] };

export type StatementExpenseLine = {
  id: string;
  category: string;
  spentOn: string;
  amountKurus: number;
  amountText: string;
  vendor: string | null;
  note: string | null;
};

export type StatementPropertyLine = {
  id: string;
  title: string;
  district: string | null;
  chargedKurus: number;
  chargedText: string;
  collectedKurus: number;
  collectedText: string;
  outstandingKurus: number;
  outstandingText: string;
  expensesKurus: number;
  expensesText: string;
  feeKurus: number;
  feeText: string;
  netKurus: number;
  netText: string;
  expenseLines: StatementExpenseLine[];
};

export type Statement = {
  owner: { id: string; name: string };
  period: { from: string; to: string };
  properties: StatementPropertyLine[];
  totals: {
    chargedKurus: number;
    chargedText: string;
    collectedKurus: number;
    collectedText: string;
    outstandingKurus: number;
    outstandingText: string;
    expensesKurus: number;
    expensesText: string;
    feeKurus: number;
    feeText: string;
    netKurus: number;
    netText: string;
  };
  printedAt: string;
};
