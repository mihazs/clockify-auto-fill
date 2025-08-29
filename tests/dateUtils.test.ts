import {
  isWeekday,
  isWeekend,
  getWeekdaysInRange,
  isLastBusinessDayOfMonth,
  getPreviousWeekdays
} from '../src/utils/dateUtils';

describe('Date Utils', () => {
  describe('isWeekday', () => {
    it('should return true for weekdays', () => {
      expect(isWeekday('2025-01-06')).toBe(true); // Monday
      expect(isWeekday('2025-01-07')).toBe(true); // Tuesday
      expect(isWeekday('2025-01-08')).toBe(true); // Wednesday
      expect(isWeekday('2025-01-09')).toBe(true); // Thursday
      expect(isWeekday('2025-01-10')).toBe(true); // Friday
    });

    it('should return false for weekends', () => {
      expect(isWeekday('2025-01-04')).toBe(false); // Saturday
      expect(isWeekday('2025-01-05')).toBe(false); // Sunday
    });
  });

  describe('isWeekend', () => {
    it('should return true for weekends', () => {
      expect(isWeekend('2025-01-04')).toBe(true); // Saturday
      expect(isWeekend('2025-01-05')).toBe(true); // Sunday
    });

    it('should return false for weekdays', () => {
      expect(isWeekend('2025-01-06')).toBe(false); // Monday
      expect(isWeekend('2025-01-10')).toBe(false); // Friday
    });
  });

  describe('getWeekdaysInRange', () => {
    it('should return only weekdays in range', () => {
      const weekdays = getWeekdaysInRange('2025-01-01', '2025-01-07');
      
      expect(weekdays).toEqual([
        '2025-01-01', // Wednesday
        '2025-01-02', // Thursday
        '2025-01-03', // Friday
        '2025-01-06', // Monday
        '2025-01-07'  // Tuesday
      ]);
    });

    it('should return empty array if no weekdays in range', () => {
      const weekdays = getWeekdaysInRange('2025-01-04', '2025-01-05'); // Saturday to Sunday
      
      expect(weekdays).toEqual([]);
    });
  });

  describe('getPreviousWeekdays', () => {
    it('should return previous weekdays', () => {
      const weekdays = getPreviousWeekdays(3, '2025-01-08'); // Wednesday
      
      expect(weekdays).toHaveLength(3);
      expect(weekdays[0]).toBe('2025-01-03'); // Friday (previous week)
      expect(weekdays[1]).toBe('2025-01-06'); // Monday
      expect(weekdays[2]).toBe('2025-01-07'); // Tuesday
    });

    it('should skip weekends when getting previous weekdays', () => {
      const weekdays = getPreviousWeekdays(2, '2025-01-06'); // Monday
      
      expect(weekdays).toHaveLength(2);
      expect(weekdays[0]).toBe('2025-01-02'); // Thursday (previous week)
      expect(weekdays[1]).toBe('2025-01-03'); // Friday (previous week)
    });
  });

  describe('isLastBusinessDayOfMonth', () => {
    it('should return true for last weekday of month', () => {
      expect(isLastBusinessDayOfMonth('2025-01-31')).toBe(true); // Friday, Jan 31
    });

    it('should return false for non-last business day', () => {
      expect(isLastBusinessDayOfMonth('2025-01-30')).toBe(false); // Thursday, Jan 30
    });

    it('should handle month ending on weekend', () => {
      expect(isLastBusinessDayOfMonth('2025-03-31')).toBe(true); // Monday, Mar 31 IS the last business day
      expect(isLastBusinessDayOfMonth('2025-03-28')).toBe(false);  // Friday, Mar 28 is NOT the last business day (Mar 31 is a Monday)
    });
  });
});