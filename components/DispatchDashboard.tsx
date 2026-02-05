import React, { useEffect, useState, useRef } from 'react';
import { MedicineRequest, CENTRAL_HOSPITAL_LOCATION, MissionItem, MavCmd } from '../types';
import { subscribeToRequests, updateRequestStatus, requestsRef, assignDroneToRequest } from '../services/firebase';
import { update } from "firebase/database";
import { Package, Clock, MapPin, AlertCircle, PlaneTakeoff, CheckCircle, Navigation, LayoutDashboard, Crosshair } from 'lucide-react';
import { useDrones } from '../contexts/DroneContext';

// Leaflet type declaration
declare global {
  interface Window {
    L: any;
  }
}

interface RequestCardProps {
  req: MedicineRequest;
  isActive?: boolean;
  onDispatch: (id: string) => void;
  onFocus: (lat: number, lng: number) => void;
  assignedDroneName?: string;
}

const RequestCard: React.FC<RequestCardProps> = ({ req, isActive = false, onDispatch, onFocus, assignedDroneName }) => (
  <div
    onClick={() => onFocus(req.location.lat, req.location.lng)}
    className={`relative border rounded-xl p-4 mb-3 transition-all cursor-pointer group ${isActive
      ? 'bg-emerald-900/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
      : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-750'
      }`}>
    {req.priority === 'Emergency' && (
      <div className="absolute top-2 right-2">
        <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 animate-pulse">
          <AlertCircle className="w-3 h-3" /> URGENT
        </span>
      </div>
    )}

    <div className="flex justify-between items-start mb-2">
      <div>
        <h3 className="text-white font-bold text-sm group-hover:text-blue-400 transition-colors">{req.hospitalName}</h3>
        <p className="text-slate-500 text-[10px] flex items-center gap-1 mt-0.5 font-mono">
          ID: {req.id.slice(-4).toUpperCase()}
        </p>
        {assignedDroneName && (
          <p className="text-emerald-400 text-[10px] flex items-center gap-1 mt-0.5 font-mono">
            🚁 {assignedDroneName}
          </p>
        )}
      </div>
    </div>

    <div className="bg-slate-900/50 rounded p-2 mb-3 border border-slate-800">
      <p className="text-xs text-slate-300 truncate">
        {req.medicines.join(', ')}
      </p>
    </div>

    <div className="flex justify-between items-center">
      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
        <MapPin className="w-3 h-3" /> {req.location.lat.toFixed(3)}, {req.location.lng.toFixed(3)}
      </div>

      {req.status === 'pending' && (
        <button
          onClick={(e) => { e.stopPropagation(); onDispatch(req.id); }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all shadow-lg hover:shadow-blue-500/30"
        >
          <PlaneTakeoff className="w-3 h-3" /> DISPATCH
        </button>
      )}

      {(req.status === 'dispatched' || req.status === 'active') && (
        <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div>
          ACTIVE MISSION
        </span>
      )}

      {req.status === 'completed' && (
        <span className="text-blue-400 text-xs font-bold flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          DELIVERED
        </span>
      )}
    </div>
  </div>
);

// Helper to generate route for a task
const generateRouteForTask = (start: { lat: number; lng: number }, destination: { lat: number; lng: number }): MissionItem[] => {
  const DEFAULT_ALT = 100;
  return [
    { seq: 1, command: MavCmd.NAV_TAKEOFF, lat: start.lat, lng: start.lng, alt: DEFAULT_ALT },
    { seq: 2, command: MavCmd.NAV_WAYPOINT, lat: (start.lat + destination.lat) / 2, lng: (start.lng + destination.lng) / 2, alt: DEFAULT_ALT },
    { seq: 3, command: MavCmd.NAV_WAYPOINT, lat: destination.lat, lng: destination.lng, alt: DEFAULT_ALT },
    { seq: 4, command: MavCmd.NAV_LOITER_TIME, lat: destination.lat, lng: destination.lng, alt: DEFAULT_ALT, p1: 5 },
    { seq: 5, command: MavCmd.NAV_LAND, lat: destination.lat, lng: destination.lng, alt: 0 },
  ];
};

export const DispatchDashboard: React.FC = () => {
  const [requests, setRequests] = useState<MedicineRequest[]>([]);
  const [hubLocation, setHubLocation] = useState(CENTRAL_HOSPITAL_LOCATION);
  const [mapReady, setMapReady] = useState(false);

  // Multi-Drone Context
  const { drones, getAvailableDrone, assignTaskToDrone, getDroneByTaskId } = useDrones();

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const hubMarkerRef = useRef<any>(null);
  const requestMarkersRef = useRef<any[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToRequests((data) => {
      setRequests(data);
    });
    return () => unsubscribe();
  }, []);

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
      const map = L.map(mapContainerRef.current, {
        center: [hubLocation.lat, hubLocation.lng],
        zoom: 12,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
      }).addTo(map);

      // --- HUB MARKER (Draggable) ---
      const hubIcon = L.divIcon({
        html: `
              <div class="relative flex flex-col items-center justify-center">
                 <div class="w-12 h-12 rounded-full border-2 border-blue-500 bg-blue-900/50 animate-pulse absolute"></div>
                 <div class="w-4 h-4 bg-blue-500 rotate-45 border-2 border-white shadow-[0_0_20px_#3b82f6] z-10"></div>
                 <div class="mt-8 bg-black/80 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/30 whitespace-nowrap z-20">CENTRAL HUB</div>
              </div>
            `,
        className: 'bg-transparent',
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      const hubMarker = L.marker([hubLocation.lat, hubLocation.lng], {
        icon: hubIcon,
        draggable: true
      }).addTo(map);

      hubMarker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        setHubLocation({ lat, lng });
      });

      mapInstanceRef.current = map;
      hubMarkerRef.current = hubMarker;
      setMapReady(true);
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

  // --- UPDATE MARKERS ON REQUEST CHANGE ---
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Clear old markers
    requestMarkersRef.current.forEach(m => m.remove());
    requestMarkersRef.current = [];

    requests.forEach(req => {
      if (req.status === 'completed') return;

      const isEmergency = req.priority === 'Emergency';
      const color = isEmergency ? 'red' : 'emerald';

      const icon = L.divIcon({
        html: `
                <div class="relative group">
                    <div class="w-3 h-3 bg-${color}-500 rounded-full border border-white shadow-lg"></div>
                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-700 pointer-events-none">
                        ${req.hospitalName}
                    </div>
                </div>
              `,
        className: 'bg-transparent',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([req.location.lat, req.location.lng], { icon }).addTo(map);

      // Draw Line from Hub to Request if Pending or Active
      if (req.status === 'pending' || req.status === 'dispatched' || req.status === 'active') {
        const isPending = req.status === 'pending';
        const line = L.polyline([
          [hubLocation.lat, hubLocation.lng],
          [req.location.lat, req.location.lng]
        ], {
          color: isEmergency ? '#ef4444' : (isPending ? '#64748b' : '#10b981'),
          weight: isPending ? 1 : 2,
          dashArray: isPending ? '4, 4' : '',
          opacity: isPending ? 0.5 : 0.8
        }).addTo(map);
        requestMarkersRef.current.push(line);
      }

      requestMarkersRef.current.push(marker);
    });

  }, [requests, hubLocation, mapReady]);


  const handleDispatch = (id: string) => {
    // Get available drone
    const availableDrone = getAvailableDrone();

    if (!availableDrone) {
      alert('No drones available! All drones are currently assigned to tasks.');
      return;
    }

    // Find the request
    const request = requests.find(r => r.id === id);
    if (!request) return;

    // Generate route for this task
    const route = generateRouteForTask(hubLocation, request.location);

    // Assign drone to task in context
    assignTaskToDrone(availableDrone.id, request, route);

    // Update Firebase with drone assignment and status
    const reqRef = update(requestsRef, {
      [`${id}/status`]: 'dispatched',
      [`${id}/origin`]: hubLocation,
      [`${id}/droneId`]: availableDrone.id
    });
  };

  const panToLocation = (lat: number, lng: number) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 14, { animate: true });
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  // Strict filtering to ensure no completed missions appear in the active list
  const activeRequests = requests.filter(r => (r.status === 'dispatched' || r.status === 'active'));
  const completedRequests = requests.filter(r => r.status === 'completed');

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-950 overflow-hidden relative">

      {/* MAP BACKGROUND (Interactive) */}
      <div className="flex-1 relative bg-slate-900">
        <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>

        {/* Map Overlay Controls */}
        <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl max-w-sm pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
            <LayoutDashboard className="w-5 h-5 text-blue-500" />
            <h2 className="text-white font-bold text-sm">CENTRAL COMMAND</h2>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Drag the <span className="text-blue-400 font-bold">Central Hub</span> marker to set the drone launch point.
            Dispatching a drone will use the current Hub location as the starting point.
          </p>
          <div className="mt-2 text-[10px] font-mono text-slate-500 bg-black/50 p-1.5 rounded border border-slate-800 pointer-events-auto select-all">
            HUB: {hubLocation.lat.toFixed(5)}, {hubLocation.lng.toFixed(5)}
          </div>

          {/* Drone Fleet Status */}
          <div className="mt-3 pt-3 border-t border-slate-700">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2">DRONE FLEET STATUS</h3>
            <div className="space-y-1">
              {Array.from(drones.values()).map(drone => (
                <div key={drone.id} className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-300">{drone.name}</span>
                  <span className={`font-bold ${drone.status === 'idle' ? 'text-green-400' :
                    drone.status === 'running' ? 'text-blue-400' :
                      'text-yellow-400'
                    }`}>
                    {drone.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR LIST */}
      <div className="w-full md:w-96 bg-slate-900 border-l border-slate-800 z-20 flex flex-col h-[50vh] md:h-full shadow-2xl">

        {/* TABS / HEADER */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 shadow-sm z-10">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Operations Queue</h2>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-800 rounded p-2 text-center border border-slate-700">
              <div className="text-2xl font-bold text-white">{pendingRequests.length}</div>
              <div className="text-[10px] text-slate-500 uppercase">Pending</div>
            </div>
            <div className="flex-1 bg-emerald-900/20 rounded p-2 text-center border border-emerald-500/20">
              <div className="text-2xl font-bold text-emerald-400">{activeRequests.length}</div>
              <div className="text-[10px] text-emerald-500/70 uppercase">In-Flight</div>
            </div>
            <div className="flex-1 bg-blue-900/20 rounded p-2 text-center border border-blue-500/20">
              <div className="text-2xl font-bold text-blue-400">{completedRequests.length}</div>
              <div className="text-[10px] text-blue-500/70 uppercase">Done</div>
            </div>
          </div>
        </div>

        {/* SCROLLABLE LIST */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {pendingRequests.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-orange-400 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                READY FOR DISPATCH
              </h3>
              {pendingRequests.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onDispatch={handleDispatch}
                  onFocus={panToLocation}
                />
              ))}
            </div>
          )}

          {activeRequests.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                ACTIVE MISSIONS
              </h3>
              {activeRequests.map(req => {
                const assignedDrone = req.droneId ? drones.get(req.droneId) : null;
                return (
                  <RequestCard
                    key={req.id}
                    req={req}
                    isActive
                    onDispatch={handleDispatch}
                    onFocus={panToLocation}
                    assignedDroneName={assignedDrone?.name}
                  />
                );
              })}
            </div>
          )}

          {completedRequests.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                COMPLETED TASKS
              </h3>
              {completedRequests.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onDispatch={handleDispatch}
                  onFocus={panToLocation}
                />
              ))}
            </div>
          )}

          {pendingRequests.length === 0 && activeRequests.length === 0 && completedRequests.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 pb-20">
              <Navigation className="w-12 h-12 mb-2 stroke-1" />
              <p className="text-sm font-medium">No Operations Found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};