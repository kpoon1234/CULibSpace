import type { FloorPlanTable, TableStatus } from './types';

/** "4 seats", "1 seat". */
export function seatsLabel(seats: number): string {
  return `${seats} ${seats === 1 ? 'seat' : 'seats'}`;
}

/** Short amenity summary for a table, e.g. "4 seats · 2 plugs · TV". */
export function amenitySummary(
  table: Pick<FloorPlanTable, 'seats' | 'plugCap' | 'hasTvScreen'>
): string {
  const parts = [seatsLabel(table.seats)];
  if (table.plugCap && table.plugCap > 0) {
    parts.push(`${table.plugCap} ${table.plugCap === 1 ? 'plug' : 'plugs'}`);
  }
  if (table.hasTvScreen) parts.push('TV screen');
  return parts.join(' · ');
}

/** One-line availability sentence for a zone header / summary. */
export function availabilityLine(counts: Record<TableStatus, number>, total: number): string {
  const open = counts.Available;
  return `${open} of ${total} ${open === 1 ? 'table' : 'tables'} open`;
}

export function statusVerb(status: TableStatus, isLocked: boolean): string {
  if (status === 'Reserved' && isLocked) return 'On hold — someone is booking this now';
  switch (status) {
    case 'Available':
      return 'Open — you can reserve this table';
    case 'Reserved':
      return 'Reserved for an upcoming booking';
    case 'Occupied':
      return 'In use right now';
    case 'Closed':
      return 'Closed — out of service';
  }
}
