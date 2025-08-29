import { BusinessDayService } from '../src/utils/businessDay';
import { HolidayService } from '../src/services/holiday';

jest.mock('../src/services/holiday');

const MockHolidayService = HolidayService as jest.MockedClass<typeof HolidayService>;

describe('BusinessDayService', () => {
  let businessDayService: BusinessDayService;
  let mockHolidayService: jest.Mocked<HolidayService>;

  beforeEach(() => {
    mockHolidayService = new MockHolidayService() as jest.Mocked<HolidayService>;
    businessDayService = new BusinessDayService();
    (businessDayService as any).holidayService = mockHolidayService;
  });

  describe('isBusinessDay', () => {
    it('should return true for weekdays that are not holidays', () => {
      mockHolidayService.isHoliday.mockReturnValue(false);
      
      expect(businessDayService.isBusinessDay('2025-01-06')).toBe(true); // Monday
    });

    it('should return false for weekends', () => {
      mockHolidayService.isHoliday.mockReturnValue(false);
      
      expect(businessDayService.isBusinessDay('2025-01-04')).toBe(false); // Saturday
      expect(businessDayService.isBusinessDay('2025-01-05')).toBe(false); // Sunday
    });

    it('should return false for holidays', () => {
      mockHolidayService.isHoliday.mockReturnValue(true);
      
      expect(businessDayService.isBusinessDay('2025-01-06')).toBe(false); // Monday holiday
    });
  });

  describe('getSkipReason', () => {
    it('should return "Weekend" for weekends', () => {
      mockHolidayService.getHolidayName.mockReturnValue(null);
      
      expect(businessDayService.getSkipReason('2025-01-04')).toBe('Weekend');
      expect(businessDayService.getSkipReason('2025-01-05')).toBe('Weekend');
    });

    it('should return holiday name for holidays', () => {
      mockHolidayService.getHolidayName.mockReturnValue('New Year\'s Day');
      
      expect(businessDayService.getSkipReason('2025-01-01')).toBe('Holiday: New Year\'s Day');
    });

    it('should return null for business days', () => {
      mockHolidayService.getHolidayName.mockReturnValue(null);
      
      expect(businessDayService.getSkipReason('2025-01-06')).toBe(null);
    });
  });

  describe('shouldSkipDate', () => {
    it('should return skip false for business days', () => {
      mockHolidayService.getHolidayName.mockReturnValue(null);
      
      const result = businessDayService.shouldSkipDate('2025-01-06');
      
      expect(result).toEqual({ skip: false });
    });

    it('should return skip true with reason for weekends', () => {
      mockHolidayService.getHolidayName.mockReturnValue(null);
      
      const result = businessDayService.shouldSkipDate('2025-01-04');
      
      expect(result).toEqual({ skip: true, reason: 'Weekend' });
    });

    it('should return skip true with reason for holidays', () => {
      mockHolidayService.getHolidayName.mockReturnValue('Christmas Day');
      
      const result = businessDayService.shouldSkipDate('2025-12-25');
      
      expect(result).toEqual({ skip: true, reason: 'Holiday: Christmas Day' });
    });
  });
});