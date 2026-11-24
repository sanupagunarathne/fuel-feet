type MonthlyAmount = { employeeId: string; month: string; amount: string };

export function carryAdvances(earnings: MonthlyAmount[], advances: MonthlyAmount[]) {
  const earnedByMonth = new Map(earnings.map((row) => [`${row.employeeId}:${row.month}`, BigInt(row.amount)]));
  const advanceByMonth = new Map(advances.map((row) => [`${row.employeeId}:${row.month}`, BigInt(row.amount)]));
  const months = [...new Set([...earnings, ...advances].map((row) => `${row.employeeId}:${row.month}`))].sort();
  const balance = new Map<string, bigint>();
  for (const key of months) {
    const employeeId = key.slice(0, key.indexOf(':'));
    const due = (balance.get(employeeId) ?? 0n) + (advanceByMonth.get(key) ?? 0n) - (earnedByMonth.get(key) ?? 0n);
    balance.set(employeeId, due > 0n ? due : 0n);
  }
  return balance;
}
