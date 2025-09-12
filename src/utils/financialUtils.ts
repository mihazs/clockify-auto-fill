import dayjs from 'dayjs';

export interface MonthlyFinancialInfo {
  currentMonth: {
    year: number;
    month: number;
    name: string;
  };
  expectedWorkHours: number;
  expectedRemuneration: number;
  hoursWorkedSoFar: number;
  remunerationSoFar: number;
  projectedRemuneration: number;
  workingDaysTotal: number;
  workingDaysPassed: number;
  workingDaysRemaining: number;
  averageHoursPerDay: number;
  isMonthComplete: boolean;
}

/**
 * Calculate expected working hours for the current month based on business days
 * @param hoursPerDay Expected hours per working day (default 8)
 * @param excludeWeekends Whether to exclude weekends (default true)
 * @returns Expected working hours for the current month
 */
export function calculateExpectedWorkHoursThisMonth(
  hoursPerDay: number = 8,
  excludeWeekends: boolean = true
): {
  total: number;
  workingDays: number;
  daysPassed: number;
  daysRemaining: number;
} {
  const now = dayjs();
  const startOfMonth = now.startOf('month');
  const endOfMonth = now.endOf('month');
  
  let workingDays = 0;
  let daysPassed = 0;
  
  // Count working days in the month
  let current = startOfMonth;
  while (current.isSame(endOfMonth, 'month')) {
    const isWeekend = excludeWeekends && (current.day() === 0 || current.day() === 6);
    
    if (!isWeekend) {
      workingDays++;
      
      // Count days that have already passed (including today if it's past working hours)
      if (current.isBefore(now, 'day') || 
          (current.isSame(now, 'day') && now.hour() >= 18)) {
        daysPassed++;
      }
    }
    
    current = current.add(1, 'day');
  }
  
  const daysRemaining = workingDays - daysPassed;
  
  return {
    total: workingDays * hoursPerDay,
    workingDays,
    daysPassed,
    daysRemaining
  };
}

/**
 * Calculate financial information for the current month
 * @param hourlyRate Hourly rate for calculations
 * @param hoursWorkedThisMonth Hours worked so far this month
 * @param hoursPerDay Expected hours per working day
 * @returns Complete financial breakdown
 */
export function calculateMonthlyFinancialInfo(
  hourlyRate: number,
  hoursWorkedThisMonth: number,
  hoursPerDay: number = 8
): MonthlyFinancialInfo {
  const now = dayjs();
  const workHours = calculateExpectedWorkHoursThisMonth(hoursPerDay);
  
  const expectedRemuneration = workHours.total * hourlyRate;
  const remunerationSoFar = hoursWorkedThisMonth * hourlyRate;
  
  // Project total remuneration based on current pace
  let projectedRemuneration = expectedRemuneration;
  if (workHours.daysPassed > 0) {
    const currentPaceHoursPerDay = hoursWorkedThisMonth / workHours.daysPassed;
    projectedRemuneration = (currentPaceHoursPerDay * workHours.workingDays) * hourlyRate;
  }
  
  return {
    currentMonth: {
      year: now.year(),
      month: now.month() + 1, // dayjs months are 0-indexed
      name: now.format('MMMM YYYY')
    },
    expectedWorkHours: workHours.total,
    expectedRemuneration,
    hoursWorkedSoFar: hoursWorkedThisMonth,
    remunerationSoFar,
    projectedRemuneration,
    workingDaysTotal: workHours.workingDays,
    workingDaysPassed: workHours.daysPassed,
    workingDaysRemaining: workHours.daysRemaining,
    averageHoursPerDay: workHours.daysPassed > 0 ? hoursWorkedThisMonth / workHours.daysPassed : 0,
    isMonthComplete: workHours.daysRemaining === 0
  };
}

/**
 * Format currency amount
 * @param amount Amount to format
 * @param currency Currency symbol (default '$')
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = '$'): string {
  return `${currency}${amount.toFixed(2)}`;
}

/**
 * Format hours with proper singular/plural
 * @param hours Number of hours
 * @returns Formatted hours string
 */
export function formatHours(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  
  if (minutes === 0) {
    return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
  } else {
    return `${wholeHours}h ${minutes}m`;
  }
}