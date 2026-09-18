"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import dynamic from "next/dynamic";

// Dynamically import the map so it only loads on the client side
const Map = dynamic(() => import("@/components/Map"), { 
  ssr: false, 
  loading: () => (
    <div className="h-[400px] w-full rounded-xl bg-slate-900 animate-pulse border border-slate-800 flex items-center justify-center text-slate-500">
      Initializing spatial radar...
    </div>
  ) 
});

type Report = {
  id: string;
  created_at: string;
  raw_query: string;
  normalized_query: string;
  phone_hash?: string;
  status: "pending" | "verified" | "flagged";
  amount?: number;
  location_name?: string;
  category?: string;
  latitude?: number;
  longitude?: number;
};

export default function CommandCenter() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchReports();

    const channel = supabase
      .channel("live-reports")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        (payload) => {
          setReports((current) => [payload.new as Report, ...current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchReports() {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setReports(data);
    }
    setLoading(false);
  }

  // Calculate live stats
  const totalAmount = reports.reduce((sum, r) => sum + (r.amount || 0), 0);
  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-emerald-400">Baraza Command Center</h1>
            <p className="text-slate-400 mt-2">Real-time civilian extortion monitoring</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-slate-300">Live Intel Feed</span>
          </div>
        </header>

        {/* Live Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="text-sm text-slate-400 mb-1">Total Reports</div>
            <div className="text-3xl font-bold text-slate-200">{reports.length}</div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="text-sm text-slate-400 mb-1">Pending Verification</div>
            <div className="text-3xl font-bold text-amber-400">{pendingCount}</div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="text-sm text-slate-400 mb-1">Total Extortion Tracked (NGN)</div>
            <div className="text-3xl font-bold text-red-400">
              ₦{totalAmount.toLocaleString()}
            </div>
          </div>
        </div>


        {/* Hotspot Map */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
            <span className="text-emerald-500">◉</span> Live Activity Map
          </h2>
          <Map reports={reports} />
        </div>

        {/* Report Feed */}
        <div>
          <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
            <span className="text-emerald-500">≡</span> Intel Feed
          </h2>
        {loading ? (
          <div className="text-slate-500 animate-pulse">Loading secure feed...</div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <div key={report.id} className="p-5 border border-slate-800 rounded-xl bg-slate-900 shadow-sm flex flex-col md:flex-row gap-4 justify-between md:items-center hover:border-slate-700 transition-colors">
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(report.created_at).toLocaleTimeString()}
                    </span>
                    {report.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                        {report.category}
                      </span>
                    )}
                    {report.location_name && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        📍 {report.location_name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-1">
                    {report.normalized_query}
                  </h3>
                  <p className="text-sm text-slate-400 italic">
                    "{report.raw_query}"
                  </p>
                </div>
                
                <div className="text-right">
                  {report.amount ? (
                    <div className="text-xl font-bold text-red-400">₦{report.amount.toLocaleString()}</div>
                  ) : (
                    <div className="text-sm text-slate-500">Amount not specified</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </main>
  );
}