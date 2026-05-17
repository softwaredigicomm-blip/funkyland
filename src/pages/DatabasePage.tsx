import React, { useState } from 'react';
import { Database, Play, Trash2, Save, FileText, Code2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlayZone } from '../hooks/usePlayZone';
import { cn } from '../lib/utils';

export default function DatabasePage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { isAdmin } = usePlayZone();

  const [dbStatus, setDbStatus] = useState<{ connected: boolean, mode: string, checking: boolean, error?: string } | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [initMessage, setInitMessage] = useState<{ success: boolean, text: string } | null>(null);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/db-status');
      const data = await res.json();
      setDbStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const retryConnection = async () => {
    setLoading(true);
    try {
      await fetch('/api/db-status/retry', { method: 'POST' });
      // Poll a few times
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const res = await fetch('/api/db-status');
        const data = await res.json();
        setDbStatus(data);
        if (data.connected || !data.checking || attempts > 10) {
          clearInterval(interval);
          setLoading(false);
        }
      }, 1000);
    } catch (e) {
      setLoading(false);
    }
  };

  const initDatabase = async () => {
    if (!window.confirm('This will attempt to create all necessary tables. Are you sure?')) return;
    setInitLoading(true);
    setInitMessage(null);
    try {
      const res = await fetch('/api/init-db', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setInitMessage({ success: true, text: 'Database initialized successfully!' });
        await checkStatus();
      } else {
        throw new Error(data.error || 'Initialization failed');
      }
    } catch (err) {
      setInitMessage({ success: false, text: (err as Error).message });
    } finally {
      setInitLoading(false);
    }
  };

  React.useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!isAdmin) return <div className="p-20 text-center">Unauthorized</div>;

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sql-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Query failed');
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const commonQueries = [
    { name: 'View All Tables', query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" },
    { name: 'Recent Billings', query: "SELECT * FROM billings ORDER BY created_at DESC LIMIT 10" },
    { name: 'Active Sessions', query: "SELECT customer_name, plan_id, created_at FROM billings WHERE created_at > NOW() - interval '1 day'" },
    { name: 'Member Count', query: "SELECT count(*) FROM members" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight italic">SQL Terminal 💻</h1>
          <p className="text-slate-500 font-medium">Direct database access & maintenance</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <div className={cn(
              "px-4 py-2 rounded-full flex items-center gap-2 text-xs font-black uppercase tracking-widest border transition-all",
              dbStatus?.connected 
                ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
                : "bg-red-50 border-red-100 text-red-600"
            )}>
              <div className={cn("w-2 h-2 rounded-full", dbStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-red-500")}></div>
              {dbStatus?.connected ? "Database Connected" : "Mock Mode (Disconnected)"}
            </div>
            {dbStatus?.error && !dbStatus.connected && (
              <div className="flex flex-col items-end mt-2">
                <span className="text-[9px] font-black text-red-500 uppercase tracking-tight">{dbStatus.error}</span>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] text-right leading-tight">
                  <span className="font-bold text-slate-600">Tip:</span> Use the <span className="text-indigo-500 font-bold">URI</span> from Supabase Settings {">"} Database. 
                  <br />
                  <span className="text-amber-600 font-bold">Important:</span> Replace port <span className="underline">5432</span> with <span className="underline font-black">6543</span> (Pooler).
                </p>
              </div>
            )}
          </div>
          
          <button
            onClick={retryConnection}
            disabled={loading || dbStatus?.connected}
            className="px-6 py-2 bg-indigo-50 border border-indigo-100 text-indigo-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-100 transition-all disabled:opacity-50"
          >
            {dbStatus?.checking ? "Checking..." : "Retry Connection"}
          </button>
          
          <button
            onClick={initDatabase}
            disabled={initLoading || !dbStatus?.connected}
            className="px-6 py-2 bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50"
          >
            {initLoading ? "Initializing..." : "Init Tables"}
          </button>
        </div>
      </header>

      {initMessage && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center justify-between gap-4",
          initMessage.success ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        )}>
          <div className="flex items-center gap-3">
             {initMessage.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
             <p className="text-xs font-bold">{initMessage.text}</p>
          </div>
          <button onClick={() => setInitMessage(null)} className="text-[10px] font-black uppercase">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quick Queries</h3>
            <div className="space-y-2">
              {commonQueries.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(q.query)}
                  className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-bold text-slate-600"
                >
                  {q.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 text-amber-800 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Warning</span>
            </div>
            <p className="text-[10px] leading-relaxed font-bold">
              Executing raw SQL queries can permanently modify or delete data. Use with extreme caution.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-10">
               <Database size={120} className="text-white" />
             </div>
             
             <textarea
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               placeholder="-- Write your SQL query here... e.g. SELECT * FROM members"
               className="w-full h-64 bg-transparent text-emerald-400 font-mono text-sm outline-none resize-none placeholder:text-slate-700 relative z-10"
             />
             
             <div className="flex justify-end mt-4">
               <button
                 onClick={runQuery}
                 disabled={loading || !query}
                 className="flex items-center gap-2 px-8 py-3 bg-white text-slate-900 font-black rounded-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
               >
                 {loading ? "Running..." : "Execute Query"}
                 <Play size={16} />
               </button>
             </div>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-red-50 p-6 rounded-[2rem] border border-red-100 text-red-600 flex items-start gap-4"
              >
                <div className="p-2 bg-white rounded-xl shadow-sm"><AlertTriangle size={20} /></div>
                <div>
                  <h4 className="font-black uppercase text-xs tracking-widest mb-1">Execution Error</h4>
                  <p className="text-sm font-mono">{error}</p>
                </div>
              </motion.div>
            )}

            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 size={16} /></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Query Executed Successfully</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    {Array.isArray(result) ? `${result.length} rows returned` : 'Command completed'}
                  </span>
                </div>
                
                <div className="overflow-x-auto max-h-96">
                  {Array.isArray(result) && result.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {Object.keys(result[0]).map(key => (
                            <th key={key} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {result.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="px-6 py-4 text-xs font-medium text-slate-600 max-w-xs truncate">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-12 text-center text-slate-400 italic">
                       No data returned or query update successful.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
