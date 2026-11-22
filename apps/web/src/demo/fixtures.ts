import { currentPeriod, shiftPeriod } from '../lib/period';

export const demoPeriod = currentPeriod();

type Snapshot = {
  period: string;
  revenue: string;
  profit: string;
  earnings: string;
  expenses: string;
  trips: number;
  vehicles: number;
  categories: [string, string, string];
};

const samples: Omit<Snapshot, 'period'>[] = [
  { revenue: '184000000', profit: '113900000', earnings: '27600000', expenses: '42500000', trips: 24, vehicles: 5, categories: ['19000000', '15500000', '8000000'] },
  { revenue: '162000000', profit: '100700000', earnings: '24300000', expenses: '37000000', trips: 21, vehicles: 5, categories: ['15500000', '14500000', '7000000'] },
  { revenue: '172000000', profit: '108200000', earnings: '25800000', expenses: '38000000', trips: 22, vehicles: 5, categories: ['18000000', '13000000', '7000000'] },
  { revenue: '143000000', profit: '83550000', earnings: '21450000', expenses: '38000000', trips: 19, vehicles: 5, categories: ['16500000', '14500000', '7000000'] },
  { revenue: '155000000', profit: '100750000', earnings: '23250000', expenses: '31000000', trips: 20, vehicles: 5, categories: ['12000000', '12500000', '6500000'] },
  { revenue: '132000000', profit: '81200000', earnings: '19800000', expenses: '31000000', trips: 18, vehicles: 5, categories: ['14000000', '11000000', '6000000'] },
];

export const demoSnapshots = samples.map((sample, index) => ({
  ...sample,
  period: shiftPeriod(demoPeriod, -index),
}));

export const demoTrips = [
  { id: 'TS-1048', day: '22', vehicle: 'WP LL-4582', route: 'Kolonnawa → Kandy', amount: '8500000', status: 'Confirmed' as const },
  { id: 'TS-1047', day: '20', vehicle: 'WP LK-2190', route: 'Muthurajawela → Galle', amount: '7250000', status: 'Confirmed' as const },
  { id: 'TS-1046', day: '19', vehicle: 'CP LD-7824', route: 'Kolonnawa → Kurunegala', amount: '6400000', status: 'Confirmed' as const },
  { id: 'TS-1045', day: '18', vehicle: 'WP LL-4582', route: 'Kolonnawa → Negombo', amount: '4500000', status: 'Draft' as const },
];

export const demoVehicles = [
  { id: 'WP LL-4582', name: 'Tanker 01', model: 'Isuzu Giga', status: 'Active' as const },
  { id: 'WP LK-2190', name: 'Tanker 02', model: 'Hino 700', status: 'Active' as const },
  { id: 'CP LD-7824', name: 'Tanker 03', model: 'Isuzu Giga', status: 'Active' as const },
  { id: 'WP LM-5301', name: 'Tanker 04', model: 'UD Quon', status: 'Active' as const },
  { id: 'SP LJ-5618', name: 'Tanker 05', model: 'Hino 700', status: 'Active' as const },
];

export const demoEmployees = [
  { id: 'EMP-01', name: 'Sample Driver A', role: 'Driver', status: 'Active' as const },
  { id: 'EMP-02', name: 'Sample Conductor A', role: 'Conductor', status: 'Active' as const },
  { id: 'EMP-03', name: 'Sample Driver B', role: 'Driver', status: 'Active' as const },
  { id: 'EMP-04', name: 'Sample Conductor B', role: 'Conductor', status: 'Active' as const },
];

export const demoSalaries = [
  { id: 'EMP-01', name: 'Sample Driver A', earned: '11300000', paid: '10000000', balance: '1300000', status: 'Partial' as const },
  { id: 'EMP-02', name: 'Sample Conductor A', earned: '5600000', paid: '5600000', balance: '0', status: 'Settled' as const },
];

export const demoExpenses = [
  { id: 'EXP-0381', day: '21', vehicle: 'WP LL-4582', category: 'Maintenance', description: 'Scheduled service', amount: '4200000' },
  { id: 'EXP-0380', day: '18', vehicle: 'WP LK-2190', category: 'Repairs', description: 'Brake parts', amount: '2850000' },
  { id: 'EXP-0379', day: '17', vehicle: 'CP LD-7824', category: 'Highway bills', description: 'Highway toll', amount: '160000' },
];
