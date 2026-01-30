import React, { useState, useEffect, useRef } from 'react';
import { createRequest } from '../services/firebase';
import { Priority, CENTRAL_HOSPITAL_LOCATION, REMOTE_LOCATIONS } from '../types';
import { Pill, AlertTriangle, Send, MapPin, CheckCircle2, Loader2, Crosshair } from 'lucide-react';

// Leaflet type declaration
declare global {
  interface Window {
    L: any;
  }
}

export const RequestForm: React.FC = () => {
  const [priority, setPriority] = useState<Priority>('Normal');
  const [medicines, setMedicines] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Location State
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number}>(REMOTE_LOCATIONS['PHC-Village-A']);
  const [locationName, setLocationName] = useState<string>('Custom Map Location');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // --- MAP INITIALIZATION ---
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    let timeoutId: any;

    const initMap = () => {
        if (!mapContainerRef.current) return;
        if (mapInstanceRef.current) return;

        if (!window.L) {
            timeoutId = setTimeout(initMap, 100);
            return;
        }

        const L = window.L;
        // Start view around the Central Hub to show context
        const map = L.map(mapContainerRef.current, {
            center: [CENTRAL_HOSPITAL_LOCATION.lat, CENTRAL_HOSPITAL_LOCATION.lng], 
            zoom: 12,
            zoomControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20
        }).addTo(map);

        // 1. Add Central Hub Marker (START LOCATION)
        const hubIcon = L.divIcon({
            html: `<div class="flex flex-col items-center"><div class="w-4 h-4 bg-blue-500 rounded-sm border-2 border-white shadow-lg"></div><div class="text-[10px] text-blue-400 font-bold mt-1 bg-slate-900/80 px-1 rounded">HUB</div></div>`,
            className: 'bg-transparent',
            iconSize: [40, 40],
            iconAnchor: [20, 10]
        });
        L.marker([CENTRAL_HOSPITAL_LOCATION.lat, CENTRAL_HOSPITAL_LOCATION.lng], { icon: hubIcon }).addTo(map);

        // 2. Add Draggable Destination Marker (END LOCATION)
        const destIcon = L.divIcon({
            html: `<div class="relative w-8 h-8 -mt-8 -ml-4">
                     <svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 text-emerald-500 filter drop-shadow-lg animate-bounce">
                       <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                     </svg>
                   </div>`,
            className: 'bg-transparent',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        const marker = L.marker([selectedLocation.lat, selectedLocation.lng], { 
            icon: destIcon, 
            draggable: true 
        }).addTo(map);

        // Update state on drag
        marker.on('dragend', (event: any) => {
            const position = event.target.getLatLng();
            setSelectedLocation({ lat: position.lat, lng: position.lng });
            setLocationName(`Custom Location (${position.lat.toFixed(3)}, ${position.lng.toFixed(3)})`);
        });

        // Update state on map click
        map.on('click', (e: any) => {
            marker.setLatLng(e.latlng);
            setSelectedLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
            setLocationName(`Custom Location (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`);
        });

        // Add pre-defined PHC markers for quick selection
        Object.entries(REMOTE_LOCATIONS).forEach(([key, loc]) => {
             const phcIcon = L.divIcon({
                html: `<div class="w-3 h-3 bg-slate-500 rounded-full border border-white/50 hover:bg-white transition-colors cursor-pointer"></div>`,
                className: 'bg-transparent',
                iconSize: [12, 12]
             });
             const phcMarker = L.marker([loc.lat, loc.lng], { icon: phcIcon }).addTo(map);
             phcMarker.on('click', () => {
                 marker.setLatLng([loc.lat, loc.lng]);
                 setSelectedLocation({ lat: loc.lat, lng: loc.lng });
                 setLocationName(key);
             });
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
    };

    initMap();

    return () => {
        clearTimeout(timeoutId);
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setLoading(true);

    const medArray = medicines.split(',').map(m => m.trim()).filter(m => m);

    if (medArray.length === 0) {
      alert("Please enter medicines");
      setLoading(false);
      return;
    }

    try {
      await createRequest({
        hospitalId: `PHC-${Math.floor(Math.random() * 1000)}`,
        hospitalName: locationName,
        location: selectedLocation, // Using map-selected coordinates
        medicines: medArray,
        priority,
        status: 'pending',
        timestamp: Date.now(),
      });

      setSuccess(true);
      setMedicines('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Submission failed", error);
      alert("Failed to submit request. Check database rules.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      
      {/* LEFT: MAP PICKER */}
      <div className="flex-1 relative min-h-[400px] lg:min-h-0 bg-slate-900">
         <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>
         <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl max-w-xs">
            <h3 className="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                <Crosshair className="w-4 h-4" /> Select Delivery Point
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
                Click on the map or drag the pin to set the destination coordinates for the drone delivery.
                <br/>
                <span className="text-blue-400 font-mono mt-1 block">Start: Central Hub (Fixed)</span>
            </p>
         </div>
         <div className="absolute bottom-4 left-4 z-10 font-mono text-xs bg-black/50 text-white px-2 py-1 rounded border border-white/10">
            LAT: {selectedLocation.lat.toFixed(5)} | LNG: {selectedLocation.lng.toFixed(5)}
         </div>
      </div>

      {/* RIGHT: FORM */}
      <div className="w-full lg:w-[450px] bg-slate-800 border-l border-slate-700 overflow-y-auto z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-700 bg-slate-900/50">
           <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Pill className="text-emerald-500" />
              New Medicine Request
           </h2>
           <p className="text-slate-400 text-xs mt-1">Submit Emergency Delivery Order</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" /> Delivery Location
            </label>
            <div className="bg-slate-900 p-3 rounded border border-slate-700 text-sm text-slate-200 font-mono">
                {locationName}
            </div>
            <div className="text-[10px] text-slate-500">
                Coordinates selected from map panel.
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Priority Level
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPriority('Normal')}
                className={`p-3 rounded border flex items-center justify-center gap-2 transition-all text-sm font-bold ${
                  priority === 'Normal' 
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                STANDARD
              </button>
              <button
                type="button"
                onClick={() => setPriority('Emergency')}
                className={`p-3 rounded border flex items-center justify-center gap-2 transition-all text-sm font-bold ${
                  priority === 'Emergency' 
                    ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                EMERGENCY
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Required Medicines</label>
            <textarea
              value={medicines}
              onChange={(e) => setMedicines(e.target.value)}
              placeholder="e.g. 2x O- Blood Bags, 5x Insulin Pens..."
              className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-slate-100 h-32 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none placeholder-slate-600 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 rounded font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
              success
                ? 'bg-green-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-500/25'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Transmitting...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-5 h-5" /> Request Sent
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Send Request
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};