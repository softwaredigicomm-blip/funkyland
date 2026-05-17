
import { 
  StaffMember, 
  PlayPlan, 
  ServiceCategory, 
  Member, 
  BookingEvent, 
  Invoice, 
  Expense, 
  BusinessProfile, 
  CatalogueDesign,
  StaffRole,
  GSTSlab,
  PlanType
} from '../src/types';

export const mockStore = {
  businessProfile: {
    name: 'FunkyLand',
    subName: 'Indoor Kids Play Area',
    unitName: '(A unit of Sudershan Business Solutions)',
    address: '2nd Floor, Plot 17, Sector-6, Channi Himmat, Jammu, J&K',
    gstNo: '01AF1FS7527R1ZD',
    mobile: '9596913030, 9796220727',
    email: 'funky@funky-land.com',
    logo: '🎡',
    accountingYearStart: '01-04',
    gracePeriodMinutes: 10,
    overtimeRatePerMinute: 2,
    socksSmallPrice: 40,
    socksMediumPrice: 50,
    socksGstSlab: 5
  },
  staff: [
    { id: 'admin', name: 'Administrator', role: 'admin' as StaffRole, phone: '9999999999', password: '12345', status: 'active' as const, joinedDate: new Date().toISOString() }
  ],
  categories: [
    { id: 1, name: 'Decoration', type: 'service' },
    { id: 2, name: 'Food & Beverage', type: 'service' },
    { id: 3, name: 'Photography', type: 'service' }
  ],
  plans: [
    // Weekday Plans
    { id: 'wd-30', title: 'Weekday - 30 Min (Kids < 3y)', validationTimeMin: 30, validationDays: 0, price: 300, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'wd-1h', title: 'Weekday - 1 Hour', validationTimeMin: 60, validationDays: 0, price: 450, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'wd-1.5h', title: 'Weekday - 1.5 Hour', validationTimeMin: 90, validationDays: 0, price: 550, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'wd-2h', title: 'Weekday - 2 Hour (+Coke/Fries)', validationTimeMin: 120, validationDays: 0, price: 700, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'wd-3h', title: 'Weekday - 3 Hour (+Coke/Fries)', validationTimeMin: 180, validationDays: 0, price: 900, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },

    // Weekend Plans
    { id: 'we-30', title: 'Weekend - 30 Min (Kids < 3y)', validationTimeMin: 30, validationDays: 0, price: 400, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'we-1h', title: 'Weekend - 1 Hour', validationTimeMin: 60, validationDays: 0, price: 550, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'we-1.5h', title: 'Weekend - 1.5 Hour', validationTimeMin: 90, validationDays: 0, price: 650, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'we-2h', title: 'Weekend - 2 Hour (+Coke/Fries)', validationTimeMin: 120, validationDays: 0, price: 800, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },
    { id: 'we-3h', title: 'Weekend - 3 Hour (+Coke/Fries)', validationTimeMin: 180, validationDays: 0, price: 1000, gstSlab: 18 as GSTSlab, type: 'hourly' as PlanType },

    // Superstar Packages (Monthly)
    { id: 'ss-wd', title: 'Superstar Weekdays (Mon-Thu)', validationTimeMin: 120, validationDays: 30, price: 3900, gstSlab: 18 as GSTSlab, type: 'monthly' as PlanType, description: '2 Hours session (11am-8pm)' },
    { id: 'ss-we', title: 'Superstar Weekends (Fri-Sun/Hols)', validationTimeMin: 120, validationDays: 30, price: 3900, gstSlab: 18 as GSTSlab, type: 'monthly' as PlanType, description: '2 Hours session (11am-8pm)' },
    { id: 'ss-any', title: 'Superstar Any Day Any Time', validationTimeMin: 120, validationDays: 30, price: 4900, gstSlab: 18 as GSTSlab, type: 'monthly' as PlanType, description: '2 Hours session (11am-8pm)' },
  ],
  members: [] as any[],
  services: [] as any[],
  catalogue: [] as any[],
  billings: [] as any[],
  events: [] as any[],
  expenses: [] as any[],
  walkInCustomers: [] as any[],
  walkInMembers: [] as any[],
  entries: [] as any[],
  socksTypes: [
    { id: 1, name: 'Small Socks', price: '40', gstSlab: 5 },
    { id: 2, name: 'Medium Socks', price: '50', gstSlab: 5 }
  ]
};
