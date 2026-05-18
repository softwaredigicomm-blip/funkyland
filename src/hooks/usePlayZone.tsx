
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  PlayEntry, 
  BookingEvent, 
  Member, 
  Invoice, 
  Expense, 
  PlayPlan,
  PlanType,
  GSTSlab,
  SocksConfig,
  BusinessProfile,
  ServiceCategory,
  ServiceItem,
  CatalogueCategory,
  CatalogueDesign,
  StaffMember
} from '../types';
import { PLANS } from '../constants';

interface PlayZoneContextType {
  entries: PlayEntry[];
  members: Member[];
  events: BookingEvent[];
  invoices: Invoice[];
  expenses: Expense[];
  walkInV1: any[];
  walkInV2: any[];
  plans: PlayPlan[];
  categories: ServiceCategory[];
  services: ServiceItem[];
  socksConfig: SocksConfig;
  businessProfile: BusinessProfile;
  staff: StaffMember[];
  currentUser: StaffMember | null;
  isAuthenticated: boolean;
  catalogueCategories: CatalogueCategory[];
  catalogueDesigns: CatalogueDesign[];
  socksTypes: any[];
  isAdmin: boolean;
  dbError: string | null;
  isSyncing: boolean;
  addEntry: (entry: Omit<PlayEntry, 'id' | 'startTime' | 'status'>) => void;
  completeEntry: (id: string, overtimeAmount?: number) => void;
  addMember: (member: Omit<Member, 'id'>) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  deleteMember: (id: string) => void;
  addEvent: (event: Omit<BookingEvent, 'id'>) => void;
  updateEvent: (id: string, updates: Partial<BookingEvent>) => void;
  deleteEvent: (id: string) => void;
  updateEventStatus: (id: string, status: BookingEvent['status']) => void;
  addInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber'>) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addPlan: (plan: PlayPlan) => void;
  updatePlan: (id: string, plan: Partial<PlayPlan>) => void;
  deletePlan: (id: string) => void;
  addCategory: (name: string) => void;
  updateCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  addService: (service: Omit<ServiceItem, 'id'>) => void;
  updateService: (id: string, updates: Partial<ServiceItem>) => void;
  deleteService: (id: string) => void;
  updateSocksConfig: (config: SocksConfig) => void;
  addSocksType: (type: any) => Promise<void>;
  updateSocksType: (id: number, updates: any) => Promise<void>;
  deleteSocksType: (id: number) => Promise<void>;
  updateBusinessProfile: (profile: BusinessProfile) => void;
  addStaff: (member: Omit<StaffMember, 'joinedDate'>) => void;
  updateStaff: (id: string, updates: Partial<StaffMember>) => void;
  deleteStaff: (id: string) => void;
  login: (id: string, password?: string) => boolean;
  logout: () => void;
  addCatalogueCategory: (name: string) => void;
  updateCatalogueCategory: (id: string, name: string) => void;
  deleteCatalogueCategory: (id: string) => void;
  addCatalogueDesign: (design: Omit<CatalogueDesign, 'id'>) => void;
  updateCatalogueDesign: (id: string, updates: Partial<CatalogueDesign>) => void;
  deleteCatalogueDesign: (id: string) => void;
  importBulkData: (data: any) => void;
  exportAllData: () => any;
  exportToCSV: (data: any[], fileName: string) => void;
  refreshData: () => Promise<void>;
}

const PlayZoneContext = createContext<PlayZoneContextType | undefined>(undefined);

export function PlayZoneProvider({ children }: { children: React.ReactNode }) {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(() => {
    try {
      const saved = localStorage.getItem('playzone_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Ensure parsed object has a role, otherwise it might be a stale token boolean
      return (parsed && typeof parsed === 'object' && 'role' in parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [entries, setEntries] = useState<PlayEntry[]>(() => {
    try {
      const saved = localStorage.getItem('funky_entries');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: any) => ({
        ...e,
        startTime: e.startTime ? new Date(e.startTime) : new Date(),
        endTime: e.endTime ? new Date(e.endTime) : undefined,
      }));
    } catch {
      return [];
    }
  });

  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const saved = localStorage.getItem('funky_members');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m: any) => ({
        ...m,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      }));
    } catch {
      return [];
    }
  });

  const [events, setEvents] = useState<BookingEvent[]>(() => {
    try {
      const saved = localStorage.getItem('funky_events');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: any) => ({
        ...e,
        date: e.date ? new Date(e.date) : new Date(),
      }));
    } catch {
      return [];
    }
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const saved = localStorage.getItem('funky_invoices');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((i: any) => ({
        ...i,
        date: i.date ? new Date(i.date) : new Date(),
      }));
    } catch {
      return [];
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem('funky_expenses');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((ex: any) => ({
        ...ex,
        date: ex.date ? new Date(ex.date) : new Date(),
      }));
    } catch {
      return [];
    }
  });

  const [walkInV1, setWalkInV1] = useState<any[]>([]);
  const [walkInV2, setWalkInV2] = useState<any[]>([]);

  const [plans, setPlans] = useState<PlayPlan[]>(() => {
    const saved = localStorage.getItem('funky_plans');
    if (!saved) return PLANS;
    return JSON.parse(saved);
  });

  const [categories, setCategories] = useState<ServiceCategory[]>(() => {
    const saved = localStorage.getItem('funky_categories');
    return saved ? JSON.parse(saved) : [
      { id: 'cat1', name: 'Decoration' },
      { id: 'cat2', name: 'Food & Beverage' },
      { id: 'cat3', name: 'Photography' }
    ];
  });

  const [services, setServices] = useState<ServiceItem[]>(() => {
    const saved = localStorage.getItem('funky_services');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [socksConfig, setSocksConfig] = useState<SocksConfig>({
    smallPrice: 40,
    mediumPrice: 50,
    gstSlab: 5
  });

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(() => {
    return {
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
    };
  });

  const [catalogueCategories, setCatalogueCategories] = useState<CatalogueCategory[]>(() => {
    const saved = localStorage.getItem('funky_catalogue_categories');
    return saved ? JSON.parse(saved) : [{ id: 'ccat1', name: 'Birthday Decor' }, { id: 'ccat2', name: 'Party Themes' }];
  });

  const [catalogueDesigns, setCatalogueDesigns] = useState<CatalogueDesign[]>([]);
  const [socksTypes, setSocksTypes] = useState<any[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>(() => {
    try {
      const saved = localStorage.getItem('funky_staff');
      if (!saved) return [{ id: 'admin', full_name: 'Administrator', role: 'admin', phone: '9999999999', password: '12345', status: 'active', joinedDate: new Date().toISOString() } as StaffMember];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [{ id: 'admin', full_name: 'Administrator', role: 'admin', phone: '9999999999', password: '12345', status: 'active', joinedDate: new Date().toISOString() } as StaffMember];
    } catch {
      return [{ id: 'admin', full_name: 'Administrator', role: 'admin', phone: '9999999999', password: '12345', status: 'active', joinedDate: new Date().toISOString() } as StaffMember];
    }
  });

  const isAdmin = currentUser?.role === 'admin';
  const isAuthenticated = !!currentUser;

  // Persistence
  useEffect(() => {
    localStorage.setItem('playzone_user', JSON.stringify(currentUser));
  }, [currentUser]);

  const fetchData = React.useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Check server health first
      const healthRes = await fetch('/api/db-status').catch(() => null);
      if (!healthRes) {
        setDbError('Server is currently offline or starting up...');
        setIsSyncing(false);
        return;
      }
      
      const contentType = healthRes.headers.get("content-type");
      if (!healthRes.ok || !contentType || !contentType.includes("application/json")) {
        const text = await healthRes.text().catch(() => 'No body');
        console.warn(`[Sync] Invalid health response. Status: ${healthRes.status}, Content-Type: ${contentType}, Body: ${text.substring(0, 100)}...`);
        setDbError('Server is recovering or returning invalid data. Retrying...');
        setIsSyncing(false);
        return;
      }

      const healthData = await healthRes.json();
      
      if (!healthData.connected) {
        const errorMsg = healthData.error || 'Failed to connect to database.';
        setDbError(`Operating in DEMO MODE: ${errorMsg}`);
      } else {
        setDbError(null);
      }

      const endpoints = [
        'business-profile',
        'staff',
        'categories',
        'plans',
        'members',
        'services',
        'catalogue',
        'billings',
        'events',
        'expenses',
        'walk-in-v1',
        'walk-in-v2',
        'socks-types',
        'entries'
      ];
      
      const results = await Promise.all(endpoints.map(async (e) => {
        try {
          const res = await fetch(`/api/${e}`);
          const contentType = res.headers.get("content-type");
          if (!res.ok || !contentType || !contentType.includes("application/json")) {
            return null;
          }
          return await res.json();
        } catch (err) {
          console.warn(`[Sync] Failed to fetch endpoint: ${e}`, err);
          return null;
        }
      }));
      
      if (results[0] && typeof results[0] === 'object' && !Array.isArray(results[0])) {
        if (results[0].name) {
          // Merge while preserving logo if it's missing in response (unlikely but safe)
          setBusinessProfile(prev => {
            const next = { ...prev, ...results[0] };
            // If the incoming result is from a confirmed sync and logo is present, use it.
            // If it's empty but we have a temp logo, don't overwrite yet? 
            // Better to trust the server but merge properly.
            return next;
          });
          
          // Also set socks config from profile if present
          if (results[0].socksSmallPrice !== undefined && results[0].socksSmallPrice !== null) {
            setSocksConfig({
              smallPrice: parseFloat(results[0].socksSmallPrice) || 40,
              mediumPrice: parseFloat(results[0].socksMediumPrice) || 50,
              gstSlab: (parseInt(results[0].socksGstSlab) || 5) as GSTSlab
            });
          }
        }
      }
      if (Array.isArray(results[1])) setStaff(results[1]);
      if (Array.isArray(results[2])) {
        const cats = results[2];
        if (cats.length > 0 || healthData.connected) {
          setCategories(cats.filter((c: any) => c.type === 'service'));
          setCatalogueCategories(cats.filter((c: any) => c.type === 'catalogue'));
        }
      }
      if (Array.isArray(results[3])) {
        const mappedPlans = results[3].filter(p => p && typeof p === 'object').map((p: any) => ({
          ...p,
          title: p.title || (p as any).name || '',
          price: parseFloat(p.price || 0) || 0,
          validationTimeMin: parseInt(p.validationTimeMin || (p as any).durationMinutes || 60) || 60,
          validationDays: parseInt(p.validationDays || (p as any).validityDays || 0) || 0,
          gstSlab: (parseInt(p.gstSlab) || 18) as GSTSlab
        }));
        // Update plans state if we have data or if we are confirmed connected to DB (to allow empty lists)
        if (mappedPlans.length > 0 || healthData.connected) {
          setPlans(mappedPlans);
        }
      }
      if (Array.isArray(results[4])) setMembers(results[4]);
      if (Array.isArray(results[5])) setServices(results[5]);
      if (Array.isArray(results[6])) setCatalogueDesigns(results[6]);
      if (Array.isArray(results[7])) {
        const mappedInvoices: Invoice[] = results[7].filter(b => b && typeof b === 'object').map((b: any) => ({
          id: b.id?.toString() || Math.random().toString(),
          invoiceNumber: b.invoiceNumber || `INV-${b.id}`,
          date: b.createdAt ? new Date(b.createdAt) : new Date(),
          customerName: b.customerName || 'Walk-in',
          mobileNumber: b.mobileNumber || b.mobileNo || '',
          items: Array.isArray(b.items) ? b.items : [],
          totalBaseAmount: parseFloat(b.subtotal || 0) || 0,
          totalGST: parseFloat(b.totalGst || 0) || 0,
          totalAmount: parseFloat(b.payable || 0) || 0,
          paymentMode: b.paymentMode?.toLowerCase() === 'cash' ? 'cash' : (b.paymentMode?.toLowerCase() === 'upi' ? 'upi' : 'upi' as any),
          status: 'paid',
          type: 'walking'
        }));
        setInvoices(mappedInvoices);
      }
      if (Array.isArray(results[8])) {
        setEvents(results[8].map((e: any) => ({
          ...e,
          date: e.bookingDate ? new Date(e.bookingDate) : (e.date ? new Date(e.date) : new Date()),
          gstPercentage: e.gstPercent || e.gstPercentage || 18,
          advancePaid: e.advanceAmount || e.advancePaid || 0,
          selectedServices: typeof e.selectedServices === 'string' ? JSON.parse(e.selectedServices) : (e.selectedServices || [])
        })));
      }
      if (Array.isArray(results[9])) {
        setExpenses(results[9].map((e: any) => ({
          ...e,
          date: e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : new Date())
        })));
      }
      if (Array.isArray(results[10])) {
        const mappedV1 = results[10].map((v: any) => ({
          ...v,
          grandtotal: parseFloat(v.grandtotal || 0),
          subtotal: parseFloat(v.subtotal || 0),
          paybleamount: parseFloat(v.paybleamount || 0),
          discount: parseFloat(v.discount || 0),
          planamount: parseFloat(v.planamount || 0),
          totalshokescost: parseFloat(v.totalshokescost || 0),
          noofperson: parseInt(v.noofperson || 1),
          noofpare: parseInt(v.noofpare || 1)
        }));
        setWalkInV1(mappedV1);
      }
      if (Array.isArray(results[12])) {
        setSocksTypes(results[12]);
        // Also update legacy config if we have small/medium
        const small = results[12].find((s: any) => s.name?.toLowerCase().includes('small'));
        const medium = results[12].find((s: any) => s.name?.toLowerCase().includes('medium'));
        if (small || medium) {
          setSocksConfig(prev => ({
            smallPrice: small?.price ? parseFloat(small.price) : prev.smallPrice,
            mediumPrice: medium?.price ? parseFloat(medium.price) : prev.mediumPrice,
            gstSlab: small?.gstSlab ? (parseInt(small.gstSlab) as GSTSlab) : prev.gstSlab
          }));
        }
      }
      if (Array.isArray(results[13])) {
        setEntries(results[13].map((e: any) => ({
          ...e,
          startTime: e.startTime ? new Date(e.startTime) : new Date(),
          endTime: e.endTime ? new Date(e.endTime) : undefined,
        })));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'SyntaxError') {
        console.warn('[Sync] Server returned HTML/invalid JSON. This often happens during startup.');
      } else {
        console.error('Failed to fetch data from API:', err);
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    
    // 1. Initial multi-device sync: poll every 30 seconds as a broad heartbeat
    const interval = setInterval(fetchData, 30000);

    // 2. Real-time sync via Supabase (Instant)
    // We listen to all major tables and refresh when ANY change occurs
    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('[Realtime] Change detected:', payload.table);
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Subscription failed. Ensure Realtime is enabled for your tables in Supabase Dashboard.');
        }
      });

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Sync back occasionally if needed, but primary source should be DB
  // For now we still use local state for immediate UI updates, but also push to API

  // Actions
  const addEntry = React.useCallback(async (entry: Omit<PlayEntry, 'id' | 'startTime' | 'status'>) => {
    const newEntry: PlayEntry = {
      ...entry,
      id: `ENT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      startTime: new Date(),
      status: 'active',
      staffId: currentUser?.id
    };
    
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });
      const saved = await res.json();
      setEntries(prev => [saved, ...prev]);
    } catch (err) {
      console.error('Failed to add entry to server:', err);
      setEntries(prev => [newEntry, ...prev]);
    }
  }, [currentUser]);

  const completeEntry = React.useCallback(async (id: string, overtimeAmount: number = 0) => {
    const endTime = new Date();
    try {
      await fetch(`/api/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', endTime, overtimeAmount })
      });
    } catch (err) {
      console.error('Failed to complete entry on server:', err);
    }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'completed', endTime, overtimeAmount } : e));
  }, []);

  const addMember = React.useCallback(async (member: Omit<Member, 'id'>) => {
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member)
      });
      const saved = await res.json();
      setMembers(prev => [saved, ...prev]);
    } catch (err) {
      console.error('Failed to add member:', err);
      // Fallback to local state if API fails
      const fallbackMember: Member = {
        ...member,
        id: `MEM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      };
      setMembers(prev => [fallbackMember, ...prev]);
    }
  }, []);

  const updateMember = React.useCallback(async (id: string, updates: Partial<Member>) => {
    if (!isAdmin) return;
    try {
      await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    } catch (err) {
      console.error('Failed to update member:', err);
      setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    }
  }, [isAdmin]);

  const deleteMember = React.useCallback(async (id: string) => {
    if (!isAdmin) return;
    try {
      await fetch(`/api/members/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete member from API:', err);
    }
    setMembers(prev => prev.filter(m => m.id !== id));
  }, [isAdmin]);

  const addInvoice = React.useCallback((invoice: Omit<Invoice, 'id' | 'invoiceNumber'>) => {
     // Financial Year Logic
    const d = new Date();
    const [startDay, startMonth] = businessProfile.accountingYearStart.split('-').map(Number);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    let fyStartYear = (m > startMonth || (m === startMonth && day >= startDay)) ? year : year - 1;
    const currentFY = `${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`;

    // Note: This relies on 'invoices' state which changes.
    // To make this stable, we'd need to use functional updates for setInvoices
    // But we also need to return the new invoice.
    // This is a common pattern in this app so I'll leave it as depends on 'invoices' for now,
    // but at least it's wrapped.
    
    const fyInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.date);
      const invM = invDate.getMonth() + 1;
      const invDay = invDate.getDate();
      const invYear = invDate.getFullYear();
      let invFyStart = (invM > startMonth || (invM === startMonth && invDay >= startDay)) ? invYear : invYear - 1;
      return `${invFyStart}-${(invFyStart + 1).toString().slice(-2)}` === currentFY;
    });

    const nextNum = fyInvoices.length + 1;
    const newInvoice: Invoice = {
      ...invoice,
      id: `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      invoiceNumber: `FL/${currentFY}/${nextNum.toString().padStart(4, '0')}`,
      staffId: currentUser?.id
    };

    // Async push to server
    const saveInvoice = async () => {
      try {
        const res = await fetch('/api/billings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: newInvoice.memberId || null,
            customerName: newInvoice.customerName,
            mobileNumber: newInvoice.mobileNumber,
            planId: newInvoice.planId,
            personCount: newInvoice.personCount,
            socksCounts: newInvoice.socksCounts,
            subtotal: newInvoice.totalBaseAmount,
            totalGst: newInvoice.totalGST,
            payable: newInvoice.totalAmount,
            paymentMode: newInvoice.paymentMode,
            items: newInvoice.items,
            handledBy: currentUser?.id,
            createdAt: newInvoice.date
          })
        });
        
        if (res.ok) {
          const saved = await res.json();
          // Update the invoice in state with the real DB ID
          const mappedSaved: Invoice = {
            ...newInvoice,
            id: saved.id.toString(),
            invoiceNumber: saved.invoiceNumber || newInvoice.invoiceNumber
          };
          setInvoices(prev => prev.map(inv => inv.id === newInvoice.id ? mappedSaved : inv));
        }
      } catch (err) {
        console.error('Failed to save invoice to server:', err);
      }
    };
    
    saveInvoice();

    setInvoices(prev => [newInvoice, ...prev]);
    return newInvoice;
  }, [invoices, businessProfile, currentUser]);

  const deleteInvoice = React.useCallback(async (id: string) => {
    try {
      await fetch(`/api/billings/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete invoice from server:', err);
    }
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  }, []);

  const updateInvoice = React.useCallback(async (id: string, updates: Partial<Invoice>) => {
    try {
      await fetch(`/api/billings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.error('Failed to update invoice on server:', err);
    }
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));
  }, []);

  const login = React.useCallback((id: string, password?: string) => {
    const found = staff.find(s => s && s.id && s.id.toLowerCase() === id.toLowerCase() && s.password === password && s.status === 'active');
    if (found) {
      setCurrentUser(found);
      localStorage.setItem('playzone_token', 'true');
      return true;
    }
    if (id.toLowerCase() === 'admin' && password === '12345') {
       const defaultAdmin: StaffMember = { id: 'admin', full_name: 'Administrator', role: 'admin', phone: '9999999999', password: '12345', status: 'active', joinedDate: new Date().toISOString() };
       setCurrentUser(defaultAdmin);
       localStorage.setItem('playzone_token', 'true');
       return true;
    }
    return false;
  }, [staff]);

  const logout = React.useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('playzone_token');
    localStorage.removeItem('playzone_user');
  }, []);

  const importBulkData = React.useCallback((data: any) => {
    if (!isAdmin) return;
    if (data.entries) setEntries(data.entries.map((e: any) => ({ ...e, startTime: new Date(e.startTime), endTime: e.endTime ? new Date(e.endTime) : undefined })));
    if (data.members) setMembers(data.members.map((m: any) => ({ ...m, createdAt: new Date(m.createdAt || m.startDate || Date.now()) })));
    if (data.events) setEvents(data.events.map((e: any) => ({ ...e, date: new Date(e.date) })));
    if (data.invoices) setInvoices(data.invoices.map((i: any) => ({ ...i, date: new Date(i.date) })));
    if (data.expenses) setExpenses(data.expenses.map((ex: any) => ({ ...ex, date: new Date(ex.date) })));
    if (data.plans) setPlans(data.plans.map((p: any) => ({
      ...p,
      title: p.title || p.name,
      validationTimeMin: p.validationTimeMin || p.durationMinutes || 60,
      validationDays: p.validationDays || p.validityDays || 0
    })));
    if (data.categories) setCategories(data.categories);
    if (data.services) setServices(data.services);
  }, [isAdmin]);

  const exportToCSV = React.useCallback((data: any[], fileName: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [headers.join(','), ...data.map(row => headers.map(f => `"${String(row[f] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
  }, []);

  const value = useMemo(() => ({
    entries, members, events, invoices, expenses, walkInV1, walkInV2, plans, categories, services, socksConfig, businessProfile, staff, currentUser, isAdmin, catalogueCategories, catalogueDesigns, socksTypes, isAuthenticated, dbError, isSyncing,
    addEntry, completeEntry, addMember, updateMember, deleteMember,
    addEvent: async (event: Omit<BookingEvent, 'id'>) => {
      if (!isAdmin) return;
      const eventData = {
        ...event,
        bookingDate: event.date,
        gstPercent: event.gstPercentage,
        advanceAmount: event.advancePaid
      };
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData)
        });
        const saved = await res.json();
        setEvents(prev => [...prev, {
          ...saved,
          date: new Date(saved.bookingDate),
          gstPercentage: saved.gstPercent,
          advancePaid: saved.advanceAmount,
          selectedServices: typeof saved.selectedServices === 'string' ? JSON.parse(saved.selectedServices) : (saved.selectedServices || [])
        }]);
      } catch (err) {
        console.error('Failed to add event:', err);
        setEvents(prev => [...prev, { ...event, id: `EVT-${Math.random().toString(36).substr(2, 9).toUpperCase()}` }]);
      }
    },
    updateEvent: async (id: string, updates: Partial<BookingEvent>) => {
      if (!isAdmin) return;
      const eventData = {
        ...updates,
        bookingDate: updates.date,
        gstPercent: updates.gstPercentage,
        advanceAmount: updates.advancePaid
      };
      try {
        await fetch(`/api/events/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData)
        });
        setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      } catch (err) {
        console.error('Failed to update event:', err);
        setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      }
    },
    deleteEvent: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/events/${id}`, { method: 'DELETE' });
        setEvents(prev => prev.filter(e => e.id !== id));
      } catch (err) {
        console.error('Failed to delete event:', err);
      }
    },
    updateEventStatus: async (id: string, status: BookingEvent['status']) => {
      try {
        await fetch(`/api/events/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
      } catch (err) {
        console.error('Failed to update event status:', err);
        setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
      }
    },
    addInvoice,
    updateInvoice: async (id: string, updates: Partial<Invoice>) => {
      if (!isAdmin) return;
      try {
        const res = await fetch(`/api/billings/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        const saved = await res.json();
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...saved } : inv));
      } catch (err) {
        console.error('Failed to update invoice:', err);
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));
      }
    },
    deleteInvoice: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/billings/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete invoice:', err);
      }
      setInvoices(prev => prev.filter(inv => inv.id !== id));
    },
    addExpense: async (expense: Omit<Expense, 'id'>) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expense)
        });
        const saved = await res.json();
        setExpenses(prev => [...prev, saved]);
      } catch (err) {
        setExpenses(prev => [...prev, { ...expense, id: `EXP-${Math.random().toString(36).substr(2, 9).toUpperCase()}` } as any]);
      }
    },
    deleteExpense: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete expense:', err);
      }
      setExpenses(prev => prev.filter(e => String(e.id) !== String(id)));
    },
    updateExpense: async (id: string, updates: Partial<Expense>) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/expenses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      } catch (err) {
        console.error('Failed to update expense:', err);
      }
    },
    addPlan: async (plan: PlayPlan) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...plan,
            price: plan.price.toString()
          })
        });
        const saved = await res.json();
        setPlans(prev => [...prev, { ...saved, price: parseFloat(saved.price) }]);
      } catch (err) {
        console.error('Failed to add plan:', err);
        setPlans(prev => [...prev, plan]);
      }
    },
    updatePlan: async (id: string, updates: Partial<PlayPlan>) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/plans/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...updates,
            price: updates.price?.toString()
          })
        });
        setPlans(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
      } catch (err) {
        console.error('Failed to update plan:', err);
        setPlans(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
      }
    },
    deletePlan: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/plans/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete plan:', err);
      }
      setPlans(prev => prev.filter(p => p.id !== id));
    },
    addCategory: async (name: string) => {
      if (!isAdmin) return;
      const newCategory = { name, type: 'service' }; // Default to service
      try {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCategory)
        });
        const saved = await res.json();
        setCategories(prev => [...prev, saved]);
      } catch (err) {
        setCategories(prev => [...prev, { id: 'CAT' + Math.random().toString(36).substr(2, 5).toUpperCase(), name } as any]);
      }
    },
    updateCategory: async (id: string, name: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      } catch (err) {
        console.error('Failed to update category:', err);
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      }
    },
    deleteCategory: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete category:', err);
      }
      setCategories(prev => prev.filter(c => c.id !== id));
    },
    addService: async (service: Omit<ServiceItem, 'id'>) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(service)
        });
        const saved = await res.json();
        setServices(prev => [...prev, saved]);
      } catch (err) {
        console.error('Failed to add service:', err);
        setServices(prev => [...prev, { ...service, id: 'SRV' + Math.random().toString(36).substr(2, 5).toUpperCase() }]);
      }
    },
    updateService: async (id: string, updates: Partial<ServiceItem>) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/services/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      } catch (err) {
        console.error('Failed to update service:', err);
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      }
    },
    deleteService: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/services/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete service:', err);
      }
      setServices(prev => prev.filter(s => s.id !== id));
    },
    updateSocksConfig: async (config: SocksConfig) => {
      if (!isAdmin) return;
      setSocksConfig(config);
      // Sync with business profile on server
      try {
        await fetch('/api/business-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socksSmallPrice: config.smallPrice,
            socksMediumPrice: config.mediumPrice,
            socksGstSlab: config.gstSlab
          })
        });
      } catch (err) {
        console.error('Failed to sync socks config:', err);
      }
    },
    updateBusinessProfile: async (profile: BusinessProfile) => {
      if (!isAdmin) return;
      setBusinessProfile(profile);
      try {
        await fetch('/api/business-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        });
      } catch (err) {
        console.error('Failed to sync business profile:', err);
      }
    },
    addStaff: async (member: Omit<StaffMember, 'joinedDate'>) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member)
        });
        const saved = await res.json();
        setStaff(prev => [...prev, saved]);
      } catch (err) {
        setStaff(prev => [...prev, { ...member, id: member.id || 'STF' + (prev.length + 1).toString().padStart(2, '0'), joinedDate: new Date().toISOString() }]);
      }
    },
    updateStaff: async (id: string, updates: Partial<StaffMember>) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/staff/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        setStaff(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      } catch (err) {
        setStaff(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      }
    },
    deleteStaff: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/staff/${id}`, { method: 'DELETE' });
        setStaff(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        setStaff(prev => prev.filter(s => s.id !== id));
      }
    },
    login,
    logout,
    addCatalogueCategory: async (name: string) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'catalogue' })
        });
        const saved = await res.json();
        setCatalogueCategories(prev => [...prev, saved]);
      } catch (err) {
        setCatalogueCategories(prev => [...prev, { id: 'CCAT' + Math.random().toString(36).substr(2, 5).toUpperCase(), name }]);
      }
    },
    updateCatalogueCategory: async (id: string, name: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        setCatalogueCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      } catch (err) {
        setCatalogueCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      }
    },
    deleteCatalogueCategory: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/categories/${id}`, { method: 'DELETE' });
        setCatalogueCategories(prev => prev.filter(c => c.id !== id));
      } catch (err) {
        setCatalogueCategories(prev => prev.filter(c => c.id !== id));
      }
    },
    addCatalogueDesign: async (design: Omit<CatalogueDesign, 'id'>) => {
      if (!isAdmin) return;
      try {
        const res = await fetch('/api/catalogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designName: design.name,
            categoryId: parseInt(design.categoryId),
            imageUrl: design.imageUrl,
            estimatePrice: design.price,
            description: design.description
          })
        });
        const saved = await res.json();
        setCatalogueDesigns(prev => [...prev, saved]);
      } catch (err) {
        setCatalogueDesigns(prev => [...prev, { ...design, id: 'DSGN' + Math.random().toString(36).substr(2, 5).toUpperCase() }]);
      }
    },
    updateCatalogueDesign: async (id: string, updates: Partial<CatalogueDesign>) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/catalogue/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designName: updates.name,
            categoryId: updates.categoryId ? parseInt(updates.categoryId) : undefined,
            imageUrl: updates.imageUrl,
            estimatePrice: updates.price,
            description: updates.description
          })
        });
        setCatalogueDesigns(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
      } catch (err) {
        setCatalogueDesigns(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
      }
    },
    deleteCatalogueDesign: async (id: string) => {
      if (!isAdmin) return;
      try {
        await fetch(`/api/catalogue/${id}`, { method: 'DELETE' });
        setCatalogueDesigns(prev => prev.filter(d => d.id !== id));
      } catch (err) {
        setCatalogueDesigns(prev => prev.filter(d => d.id !== id));
      }
    },
    importBulkData,
    exportAllData: () => ({ entries, members, events, invoices, expenses, plans, categories, services, exportDate: new Date().toISOString() }),
    exportToCSV,
    refreshData: fetchData,
    addSocksType: async (type: any) => {
      try {
        const res = await fetch('/api/socks-types', {
          method: 'POST',
          headers: { 'Content-Type' : 'application/json' },
          body: JSON.stringify(type)
        });
        const saved = await res.json();
        if (res.ok && saved && !saved.error) {
          setSocksTypes(prev => [...prev, saved]);
        }
        await fetchData();
      } catch (err) { 
        console.error('Failed to add socks type:', err);
        setSocksTypes(prev => [...prev, { ...type, id: Date.now() }]);
      }
    },
    updateSocksType: async (id: number, updates: any) => {
      try {
        const res = await fetch(`/api/socks-types/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type' : 'application/json' },
          body: JSON.stringify(updates)
        });
        if (res.ok) await fetchData();
      } catch (err) { console.error('Failed to update socks type:', err); }
    },
    deleteSocksType: async (id: number) => {
      try {
        console.log('[Socks] Requesting deletion of ID:', id);
        const res = await fetch(`/api/socks-types/${id}`, { method: 'DELETE' });
        if (res.ok) {
          console.log('[Socks] Deletion successful');
          await fetchData();
          alert('Socks type deleted successfully!');
        } else {
          const errData = await res.json();
          console.error('[Socks] Deletion failed:', errData);
          alert(`Failed to delete socks: ${errData.error || 'Unknown error'}`);
        }
      } catch (err) { 
        console.error('Failed to delete socks type:', err); 
        alert('Failed to connect to server for deletion.');
      }
    }
  }), [
    entries, members, events, invoices, expenses, walkInV1, walkInV2, plans, categories, services, socksConfig, businessProfile, staff, currentUser, isAdmin, isAuthenticated, catalogueCategories, catalogueDesigns, socksTypes, dbError, isSyncing, fetchData, addEntry, completeEntry, addMember, updateMember, deleteMember, addInvoice, importBulkData, exportToCSV
  ]);

  return <PlayZoneContext.Provider value={value}>{children}</PlayZoneContext.Provider>;
}

export function usePlayZone() {
  const context = useContext(PlayZoneContext);
  if (context === undefined) throw new Error('usePlayZone must be used within a PlayZoneProvider');
  return context;
}
