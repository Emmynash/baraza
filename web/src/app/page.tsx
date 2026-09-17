"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

// Define the shape of our report based on our Phase 1 schema
type Report = {
  id: string;
  created_at: string;
  raw_query: string;
  normalized_query: string;
  phone_hash?: string;
  status: "pending" | "verified" | "flagged";
};

export default function CommandCenter() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchReports();

    // Set up a real-time listener for new incoming reports
    const channel = supabase
      .channel("live-reports")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        (payload) => {
          console.log("New report received!", payload.new);
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

    if (error) {
      console.error("Error fetching reports:", error);
    } else {
      setReports(data || []);
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 border-b border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-emerald-400">Baraza Command Center</h1>
            <p className="text-slate-400 mt-2">Real-time civilian extortion monitoring and verification</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-slate-300">Live System Active</span>
          </div>
        </header>

        {loading ? (
          <div className="text-slate-500 animate-pulse">Loading secure feed...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/50 text-slate-400 text-center">
            No reports logged in the system yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <div key={report.id} className="p-5 border border-slate-800 rounded-xl bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-mono text-slate-500">
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full uppercase font-bold tracking-wider ${
                    report.status === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    report.status === 'flagged' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {report.status || 'PENDING'}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-200 mb-1">
                  {report.normalized_query || "Awaiting Normalization"}
                </h3>
                <p className="text-sm text-slate-400 italic">
                  Original: "{report.raw_query}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}