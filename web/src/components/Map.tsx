"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// We use any[] here temporarily, but in production we'd share the Report type
export default function Map({ reports }: { reports: any[] }) {
  // Center map on Nigeria by default
  const defaultCenter = [9.0820, 8.6753]; 
  
  // Helper function to parse PostGIS POINT(lng lat) string
  const getCoordinates = (loc: any): [number, number] | null => {
    if (!loc) return null;
    
    // Fallback if older mock data still uses lat/lng properties
    if (loc.latitude && loc.longitude) return [loc.latitude, loc.longitude];

    // Extract numbers from "POINT(lng lat)"
    // PostGIS format is POINT(longitude latitude)
    if (typeof loc === 'string') {
      const match = loc.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
      if (match) {
        const lng = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        // Leaflet expects [latitude, longitude]
        return [lat, lng]; 
      }
    }
    return null;
  };

  // Map the reports to include parsed coordinates
  const analyzedReports = reports.map(report => ({
    ...report,
    coords: getCoordinates(report.fuzzed_location)
  }));

  // *** TEMPORARY DEBUGGING LOG ***
  // Check your browser console to see exactly what data is arriving
  console.log("[Map Debug] Raw Reports Input:", reports);
  console.log("[Map Debug] Parsed Data:", analyzedReports);
  // *** END TEMPORARY DEBUGGING LOG ***

  // Filter out invalids so the map doesn't crash on null coordinates
  const validReports = analyzedReports.filter(report => report.coords !== null);

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
            center={report.coords as [number, number]}
            radius={8}
            pathOptions={{ 
              color: '#f87171', // Red outline
              fillColor: '#ef4444', // Red fill
              fillOpacity: 0.7 
            }}
          >
            <Popup>
              <div className="text-slate-800 font-sans">
                <div className="font-bold text-sm mb-1">{report.location_name || 'Unknown Location'}</div>
                <div className="text-xs text-red-600 font-bold mb-1">
                  Amount: {report.amount ? `₦${report.amount.toLocaleString()}` : 'Unspecified'}
                </div>
                <div className="text-xs italic text-slate-600">"{report.user_query}"</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}