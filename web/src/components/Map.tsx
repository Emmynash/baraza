"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// We use any[] here temporarily, but in production we'd share the Report type
export default function Map({ reports }: { reports: any[] }) {
  // Center map on Nigeria by default
  const defaultCenter = [9.0820, 8.6753]; 
  
  // Only plot reports that have valid coordinates
  const validReports = reports.filter(r => r.latitude && r.longitude);

  return (
    <div className="h-[400px] w-full rounded-xl overflow-hidden border border-slate-800 z-0 relative">
      <MapContainer 
        center={defaultCenter as [number, number]} 
        zoom={6} 
        className="h-full w-full"
      >
        {/* Light Mode Map Tiles from OpenStreetMap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {validReports.map((report) => (
          <CircleMarker
            key={report.id}
            center={[report.latitude, report.longitude]}
            radius={8}
            pathOptions={{ 
              color: '#f87171', // Red outline
              fillColor: '#ef4444', // Red fill
              fillOpacity: 0.7 
            }}
          >
            <Popup>
              <div className="text-slate-800 font-sans">
                <div className="font-bold text-sm mb-1">{report.location_name}</div>
                <div className="text-xs text-red-600 font-bold mb-1">
                  Amount: {report.amount ? `₦${report.amount.toLocaleString()}` : 'Unspecified'}
                </div>
                <div className="text-xs italic text-slate-600">"{report.raw_query}"</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}