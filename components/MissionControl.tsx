import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CENTRAL_HOSPITAL_LOCATION, MedicineRequest, DroneTelemetry, DroneState, SystemHealth } from '../types';
import { subscribeToRequests, updateRequestStatus } from '../services/firebase';
import { 
  Map as MapIcon, Target, Battery, Signal, Power, Shield, 
  Play, Pause, RotateCcw, Activity, Settings, Save, Upload, 
  Download, AlertTriangle, CheckCircle2, XCircle, 
  ArrowUp, ArrowDown, Wind, Compass, Menu, Terminal, Layers
} from 'lucide-react';

// Leaflet type declaration
declare global {
  interface Window {
    L: any;
  }
}

// --- GCS CONSTANTS ---
const SIM_SPEED_MULT = 4; 
const DEFAULT_ALT = 100;
const WP_RADIUS = 15; // meters
const RTL_ALT = 50;

// MAVLink-style Commands
enum MavCmd {
  NAV_TAKEOFF = 'NAV_TAKEOFF',
  NAV_WAYPOINT = 'NAV_WAYPOINT',
  NAV_LOITER_TIME = 'NAV_LOITER',
  NAV_RETURN_TO_LAUNCH = 'NAV_RTL',
  NAV_LAND = 'NAV_LAND',
}

interface MissionItem {
  seq: number;
  command: MavCmd;
  p1?: number; // Delay/Time
  p2?: number; // Radius
  p3?: number; // Reserved
  p4?: number; // Yaw
  lat: number;
  lng: number;
  alt: number;
}

interface LogMessage {
  id: number;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  text: string;
}

// Flight Modes
type FlightMode = 'STABILIZE' | 'LOITER' | 'AUTO' | 'RTL' | 'GUIDED' | 'LAND';

export const MissionControl: React.FC<{ viewMode: 'planner' | 'drone' }> = ({ viewMode }) => {
  // --- STATE: SYSTEMS ---
  const [flightMode, setFlightMode] = useState<FlightMode>('STABILIZE');
  const [armed, setArmed] = useState(false);
  const [gpsFix, setGpsFix] = useState<'NO_FIX' | '2D_FIX' | '3D_FIX'>('NO_FIX');
  const [satellites, setSatellites] = useState(0);
  const [hdop, setHdop] = useState(99.9);
  
  // --- STATE: MISSION ---
  const [missionItems, setMissionItems] = useState<MissionItem[]>([]);
  const [activeWpIndex, setActiveWpIndex] = useState(-1);
  const [activeRequest, setActiveRequest] = useState<MedicineRequest | null>(null);
  const [homeLocation, setHomeLocation] = useState(CENTRAL_HOSPITAL_LOCATION);

  // --- STATE: LOGS & UI ---
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [preflightChecks, setPreflightChecks] = useState({
    accel: false, gyro: false, mag: false, rc: false, battery: false
  });
  const [checklistOpen, setChecklistOpen] = useState(false);

  // --- REFS (Physics & Map) ---
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const droneMarkerRef = useRef<any>(null);
  const missionLayerRef = useRef<any>(null);
  
  const physics = useRef({
    lat: CENTRAL_HOSPITAL_LOCATION.lat,
    lng: CENTRAL_HOSPITAL_LOCATION.lng,
    alt: 0,
    heading: 0,
    speed: 0,
    vSpeed: 0,
    roll: 0,
    pitch: 0,
    battery_v: 25.2,
    battery_rem: 100,
    wind_dir: 45,
    wind_spd: 5,
    lastTick: Date.now()
  });

  const requestRef = useRef<number>(0);

  // --- HELPERS ---
  const addLog = (text: string, severity: LogMessage['severity'] = 'INFO') => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      severity,
      text
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]); // Keep last 50
  };

  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;

  const getDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  // --- INIT SYSTEMS ---
  useEffect(() => {
    // Simulate boot sequence
    addLog("SYSTEM BOOT INITIATED...", "INFO");
    setTimeout(() => { addLog("MAVLINK CONNECTED (SYSID: 1)", "INFO"); }, 1000);
    setTimeout(() => { 
      setGpsFix('3D_FIX'); 
      setSatellites(14); 
      setHdop(0.8);
      addLog("GPS 3D LOCK ACQUIRED", "INFO"); 
    }, 3000);
  }, []);

  // --- MAP SETUP ---
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    if (!window.L) { setTimeout(() => {}, 500); return; } // Simple retry wait
    const L = window.L;

    const map = L.map(mapContainerRef.current, {
      center: [CENTRAL_HOSPITAL_LOCATION.lat, CENTRAL_HOSPITAL_LOCATION.lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    
    // Grid Overlay
    L.GridLayer.Grid = L.GridLayer.extend({
      createTile: function (coords: any) {
        var tile = document.createElement('div');
        tile.style.outline = '1px solid rgba(16, 185, 129, 0.1)';
        tile.innerHTML = coords.x % 2 === 0 && coords.y % 2 === 0 ? `<div style="color:rgba(16,185,129,0.3);font-size:8px;padding:2px;">${coords.x},${coords.y}</div>` : '';
        return tile;
      }
    });
    new L.GridLayer.Grid().addTo(map);

    // Drone Marker
    const droneIcon = L.divIcon({
      html: `<div id="drone-icon" class="relative w-10 h-10 transition-transform duration-100 ease-linear">
              <svg viewBox="0 0 24 24" fill="none" class="w-full h-full filter drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]">
                  <path d="M12 2L15 9L12 12L9 9Z" fill="#10b981"></path>
                  <path d="M2 12L22 12" stroke="#10b981" stroke-width="1" stroke-opacity="0.5"></path>
                  <path d="M12 2L12 22" stroke="#10b981" stroke-width="1" stroke-opacity="0.5"></path>
                  <circle cx="12" cy="12" r="8" stroke="#10b981" stroke-width="1" stroke-dasharray="2 2" opacity="0.5"></circle>
              </svg>
            </div>`,
      className: 'bg-transparent',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    droneMarkerRef.current = L.marker([CENTRAL_HOSPITAL_LOCATION.lat, CENTRAL_HOSPITAL_LOCATION.lng], { icon: droneIcon, zIndexOffset: 1000 }).addTo(map);
    missionLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
  }, []);

  // --- MISSION SYNC FROM FIREBASE ---
  useEffect(() => {
    const unsubscribe = subscribeToRequests((requests) => {
      // Find new dispatched mission
      const dispatched = requests.find(r => r.status === 'dispatched');
      
      // Safety: Ignore if we already have this mission active, or if it's completed
      if (dispatched && dispatched.id !== activeRequest?.id && dispatched.status !== 'completed') {
        addLog(`MISSION RECEIVED: ${dispatched.hospitalName.toUpperCase()}`, "INFO");
        setActiveRequest(dispatched);
        updateRequestStatus(dispatched.id, 'active');

        // Parse Mission
        const start = dispatched.origin || CENTRAL_HOSPITAL_LOCATION;
        setHomeLocation(start);
        physics.current.lat = start.lat;
        physics.current.lng = start.lng;

        const newItems: MissionItem[] = [
          { seq: 1, command: MavCmd.NAV_TAKEOFF, lat: start.lat, lng: start.lng, alt: DEFAULT_ALT },
          { seq: 2, command: MavCmd.NAV_WAYPOINT, lat: (start.lat + dispatched.location.lat)/2, lng: (start.lng + dispatched.location.lng)/2, alt: DEFAULT_ALT },
          { seq: 3, command: MavCmd.NAV_WAYPOINT, lat: dispatched.location.lat, lng: dispatched.location.lng, alt: DEFAULT_ALT },
          { seq: 4, command: MavCmd.NAV_LOITER_TIME, lat: dispatched.location.lat, lng: dispatched.location.lng, alt: dispatched.location.lat, p1: 5 }, // 5s wait
          { seq: 5, command: MavCmd.NAV_LAND, lat: dispatched.location.lat, lng: dispatched.location.lng, alt: 0 },
        ];
        setMissionItems(newItems);
        drawMissionOnMap(newItems);
      }
    });
    return () => unsubscribe();
  }, [activeRequest]);

  // --- MAP DRAWING ---
  const drawMissionOnMap = (items: MissionItem[]) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    missionLayerRef.current.clearLayers();

    const points = items.map(i => [i.lat, i.lng]);
    
    // Path Line
    L.polyline(points, { color: '#fbbf24', weight: 2, dashArray: '5, 5', opacity: 0.8 }).addTo(missionLayerRef.current);

    // Waypoints
    items.forEach((item) => {
      const color = item.command === MavCmd.NAV_LAND ? '#ef4444' : item.command === MavCmd.NAV_TAKEOFF ? '#3b82f6' : '#fbbf24';
      const icon = L.divIcon({
        html: `<div class="flex flex-col items-center">
                <div class="w-4 h-4 rounded-full border border-black shadow-sm flex items-center justify-center text-[8px] font-bold text-black" style="background:${color}">${item.seq}</div>
                <div class="text-[8px] font-bold text-${color === '#fbbf24' ? 'yellow-400' : 'white'} bg-black/70 px-1 rounded mt-0.5">${item.command.replace('NAV_', '')}</div>
               </div>`,
        className: 'bg-transparent',
        iconSize: [40, 40],
        iconAnchor: [20, 8]
      });
      L.marker([item.lat, item.lng], { icon }).addTo(missionLayerRef.current);
    });

    // Fit Bounds
    if (points.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  };

  // --- PHYSICS LOOP ---
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const dt = Math.min((now - physics.current.lastTick) / 1000, 0.1);
      physics.current.lastTick = now;

      // 1. Logic based on Flight Mode
      let targetLat = physics.current.lat;
      let targetLng = physics.current.lng;
      let targetAlt = physics.current.alt;
      let targetHead = physics.current.heading;

      if (armed) {
        // Battery Drain
        physics.current.battery_rem -= (flightMode === 'STABILIZE' ? 0.01 : 0.05) * dt;
        physics.current.battery_v = 22.0 + (physics.current.battery_rem / 100) * 3.2;

        if (flightMode === 'AUTO' && missionItems.length > 0) {
           // Mission Logic
           const nextWP = missionItems[activeWpIndex === -1 ? 0 : activeWpIndex];
           
           if (nextWP) {
             if (activeWpIndex === -1) setActiveWpIndex(0); // Start
             
             targetLat = nextWP.lat;
             targetLng = nextWP.lng;
             targetAlt = nextWP.alt;

             const dist = getDist(physics.current.lat, physics.current.lng, targetLat, targetLng);
             
             // Waypoint Reached Logic
             if (dist < WP_RADIUS && Math.abs(physics.current.alt - targetAlt) < 2) {
                // Execute Command Logic
                if (nextWP.command === MavCmd.NAV_LAND) {
                   targetAlt = 0;
                   if (physics.current.alt < 0.5) {
                     setArmed(false);
                     setFlightMode('STABILIZE');
                     addLog("MISSION COMPLETED", "INFO");
                     setActiveWpIndex(-1);
                     if (activeRequest) {
                       updateRequestStatus(activeRequest.id, 'completed');
                       setActiveRequest(null);
                     }
                   }
                } else {
                   // Move to next WP
                   if (activeWpIndex < missionItems.length - 1) {
                      setActiveWpIndex(prev => prev + 1);
                      addLog(`REACHED WP ${nextWP.seq}. PROCEEDING TO WP ${nextWP.seq + 1}`, "INFO");
                   }
                }
             }
           }
        } else if (flightMode === 'RTL') {
           targetLat = homeLocation.lat;
           targetLng = homeLocation.lng;
           targetAlt = Math.max(physics.current.alt, RTL_ALT); // Climb to RTL alt
           const distHome = getDist(physics.current.lat, physics.current.lng, targetLat, targetLng);
           
           if (distHome < 5) {
             setFlightMode('LAND');
           }
        } else if (flightMode === 'LAND') {
           targetAlt = 0;
           if (physics.current.alt < 0.2) setArmed(false);
        }
      }

      // 2. Physics / Movement
      if (armed) {
         // Vertical
         const vErr = targetAlt - physics.current.alt;
         const vSpdTarget = Math.max(-3, Math.min(5, vErr)); // Clamp -3m/s to +5m/s
         physics.current.vSpeed += (vSpdTarget - physics.current.vSpeed) * 2 * dt; // Simple inertia
         physics.current.alt += physics.current.vSpeed * dt * SIM_SPEED_MULT;

         // Horizontal
         let groundSpeed = 0;
         if (['AUTO', 'RTL', 'GUIDED'].includes(flightMode)) {
            groundSpeed = 15; // 15 m/s cruise
            const bearing = getBearing(physics.current.lat, physics.current.lng, targetLat, targetLng);
            
            // Turn Logic
            let angleDiff = bearing - physics.current.heading;
            while (angleDiff > 180) angleDiff -= 360;
            while (angleDiff < -180) angleDiff += 360;
            
            const turnRate = 30; // deg/s
            if (Math.abs(angleDiff) > 1) {
               physics.current.heading += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate * dt * SIM_SPEED_MULT);
               physics.current.heading = (physics.current.heading + 360) % 360;
               // Simulated Roll
               physics.current.roll = Math.sign(angleDiff) * -15; 
            } else {
               physics.current.roll = 0;
            }
            targetHead = physics.current.heading;
         } else {
            physics.current.roll = 0;
         }

         // Wind Effect
         // ... simplified

         // Move Lat/Lng
         const moveDist = groundSpeed * dt * SIM_SPEED_MULT;
         if (moveDist > 0) {
            const latRad = toRad(physics.current.lat);
            const lngRad = toRad(physics.current.lng);
            const headRad = toRad(physics.current.heading);
            const angularDist = moveDist / 6371e3;

            const newLat = Math.asin(Math.sin(latRad)*Math.cos(angularDist) + Math.cos(latRad)*Math.sin(angularDist)*Math.cos(headRad));
            const newLng = lngRad + Math.atan2(Math.sin(headRad)*Math.sin(angularDist)*Math.cos(latRad), Math.cos(angularDist)-Math.sin(latRad)*Math.sin(newLat));
            
            physics.current.lat = toDeg(newLat);
            physics.current.lng = toDeg(newLng);
            physics.current.speed = groundSpeed * 3.6; // kph
         }
      }

      // 3. UI Updates (Throttle)
      if (droneMarkerRef.current) {
        droneMarkerRef.current.setLatLng([physics.current.lat, physics.current.lng]);
        const icon = droneMarkerRef.current.getElement().querySelector('#drone-icon');
        if (icon) icon.style.transform = `rotate(${physics.current.heading}deg)`;
        
        if (flightMode !== 'STABILIZE' && viewMode === 'drone') {
          mapInstanceRef.current?.panTo([physics.current.lat, physics.current.lng], { animate: false });
        }
      }

      requestRef.current = requestAnimationFrame(tick);
    };
    requestRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestRef.current);
  }, [armed, flightMode, missionItems, activeWpIndex]);

  // --- ACTIONS ---
  const runPreflight = () => {
    setChecklistOpen(true);
    const steps = ['accel', 'gyro', 'mag', 'rc', 'battery'] as const;
    steps.forEach((step, idx) => {
       setTimeout(() => {
          setPreflightChecks(prev => ({ ...prev, [step]: true }));
       }, (idx + 1) * 800);
    });
    setTimeout(() => { 
        setChecklistOpen(false); 
        addLog("PREFLIGHT CHECKS PASSED. SYSTEM READY.", "INFO"); 
    }, 5000);
  };

  const armSystem = () => {
    if (gpsFix === 'NO_FIX') { 
        addLog("ARM FAIL: NO GPS FIX", "ERROR"); 
        return; 
    }
    
    // Auto-complete checks if not done
    if (!Object.values(preflightChecks).every(Boolean)) {
         addLog("AUTO-SEQUENCING PREFLIGHT CHECKS...", "WARNING");
         setChecklistOpen(true);
         
         const steps = ['accel', 'gyro', 'mag', 'rc', 'battery'] as const;
         let delay = 0;
         
         steps.forEach((step, i) => {
             delay += 600; // Total 3000ms for 5 steps
             setTimeout(() => {
                 setPreflightChecks(prev => ({ ...prev, [step]: true }));
             }, delay);
         });

         setTimeout(() => {
             setChecklistOpen(false);
             setArmed(true);
             addLog("PREFLIGHT COMPLETE. MOTORS ARMED.", "WARNING");
         }, 3200);
         return;
    }
    
    setArmed(true);
    addLog("MOTORS ARMED. CAUTION.", "WARNING");
  };

  const disarmSystem = () => {
    if (physics.current.alt > 2) { addLog("DISARM REJECTED: VEHICLE AIRBORNE", "CRITICAL"); return; }
    setArmed(false);
    setFlightMode('STABILIZE');
    addLog("MOTORS DISARMED", "INFO");
  };

  const setMode = (mode: FlightMode) => {
    if (mode === 'AUTO' && missionItems.length === 0) { addLog("AUTO FAIL: NO MISSION", "ERROR"); return; }
    if (mode === 'AUTO' && !armed) { addLog("AUTO FAIL: ARM FIRST", "ERROR"); return; }
    setFlightMode(mode);
    addLog(`MODE CHANGED: ${mode}`, "INFO");
  };

  // --- RENDERERS ---
  const renderHUD = () => (
    <div className="absolute top-4 left-4 z-20 w-64 pointer-events-none">
       {/* Primary Flight Display (PFD) */}
       <div className="bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative h-48 mb-2 backdrop-blur">
          {/* Artificial Horizon */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
             <div className="w-96 h-96 bg-gradient-to-b from-sky-600 to-amber-700 transition-transform duration-75" 
                  style={{ transform: `rotate(${-physics.current.roll}deg) translateY(${physics.current.pitch * 2}px)` }}>
                  <div className="w-full h-0.5 bg-white/50 absolute top-1/2"></div>
             </div>
          </div>
          {/* Fixed Reticle */}
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-32 h-1 bg-transparent border-t-2 border-l-2 border-r-2 border-yellow-400 h-2"></div>
             <div className="w-2 h-2 bg-yellow-400 rounded-full absolute"></div>
          </div>
          
          {/* Speed Tape */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-black/40 border-r border-white/20 flex flex-col items-end justify-center py-2 pr-1 overflow-hidden">
             {[20, 10, 0].map(val => (
                <div key={val} className="text-[10px] text-white font-mono h-6 border-r border-white/50 pr-1 w-full text-right leading-none relative" 
                     style={{ top: `${(physics.current.speed - val) * 2}px` }}>{val}</div>
             ))}
             <div className="absolute top-1/2 right-0 w-3 h-0 border-y-[5px] border-r-[8px] border-y-transparent border-r-yellow-400"></div>
             <div className="absolute top-2 left-1 text-[10px] font-bold text-sky-400">SPD</div>
          </div>

          {/* Alt Tape */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-black/40 border-l border-white/20 flex flex-col items-start justify-center py-2 pl-1 overflow-hidden">
             {[100, 50, 0].map(val => (
                <div key={val} className="text-[10px] text-white font-mono h-8 border-l border-white/50 pl-1 w-full leading-none relative" 
                     style={{ top: `${(physics.current.alt - val) * 2}px` }}>{val}</div>
             ))}
             <div className="absolute top-1/2 left-0 w-3 h-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-yellow-400"></div>
             <div className="absolute top-2 right-1 text-[10px] font-bold text-emerald-400">ALT</div>
          </div>
       </div>

       {/* Compass Strip */}
       <div className="bg-slate-900/90 border border-slate-700 rounded h-8 mb-2 flex items-center justify-center relative overflow-hidden">
          <div className="flex gap-8 transition-transform duration-75" style={{ transform: `translateX(${-physics.current.heading * 2}px)` }}>
             {Array.from({length: 36}).map((_, i) => (
                <div key={i} className="w-8 flex-shrink-0 text-center border-l border-slate-700 text-[10px] font-mono text-slate-400">
                  {i * 10 === 0 ? 'N' : i * 10 === 90 ? 'E' : i * 10 === 180 ? 'S' : i * 10 === 270 ? 'W' : i * 10}
                </div>
             ))}
          </div>
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"></div>
       </div>
    </div>
  );

  const renderTopBar = () => (
    <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-3 text-xs font-mono select-none">
       <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-emerald-500">
             <Activity className="w-4 h-4" />
             <span className="font-bold">MAVLINK: SYS 1</span>
          </div>
          <div className={`flex items-center gap-2 ${flightMode === 'STABILIZE' ? 'text-yellow-500' : 'text-emerald-500'}`}>
             <Target className="w-4 h-4" />
             <span className="font-bold">MODE: {flightMode}</span>
          </div>
          <div className={`px-2 py-0.5 rounded font-bold ${armed ? 'bg-red-900/50 text-red-500 border border-red-900' : 'bg-green-900/50 text-green-500 border border-green-900'}`}>
             {armed ? 'ARMED' : 'DISARMED'}
          </div>
       </div>

       <div className="flex items-center gap-6 text-slate-400">
          <div className={`flex items-center gap-1 ${gpsFix === '3D_FIX' ? 'text-white' : 'text-red-500'}`}>
             <Signal className="w-3 h-3" />
             <span>GPS: {gpsFix} ({satellites}) HDOP: {hdop}</span>
          </div>
          <div className="flex items-center gap-1">
             <Battery className="w-3 h-3" />
             <span className={physics.current.battery_rem < 30 ? 'text-red-500' : 'text-white'}>{physics.current.battery_v.toFixed(1)}V ({physics.current.battery_rem.toFixed(0)}%)</span>
          </div>
       </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
       {renderTopBar()}

       <div className="flex-1 flex relative">
          {/* LEFT: HUD & Quick Actions (Drone Mode Only) */}
          {viewMode === 'drone' && renderHUD()}
          
          {/* MAIN MAP AREA */}
          <div className="flex-1 relative bg-black">
             <div ref={mapContainerRef} className="absolute inset-0 z-0" />
             
             {/* Map Overlays */}
             <div className="absolute bottom-1 left-1 text-[10px] font-mono text-slate-500 bg-black/50 px-1 pointer-events-none">
                {physics.current.lat.toFixed(7)}, {physics.current.lng.toFixed(7)}
             </div>
          </div>

          {/* RIGHT SIDEBAR: Planner / Operations */}
          <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-30 shadow-xl">
             
             {/* --- PLANNER VIEW SIDEBAR --- */}
             {viewMode === 'planner' && (
               <>
                 <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-bold text-sm flex items-center gap-2"><MapIcon className="w-4 h-4 text-blue-400"/> FLIGHT PLAN</h3>
                    <div className="flex gap-1">
                      <button className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded" title="Read"><Download className="w-3 h-3"/></button>
                      <button className="p-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white" title="Write" onClick={() => addLog("MISSION UPLOADED SUCCESSFULLY", "INFO")}><Upload className="w-3 h-3"/></button>
                    </div>
                 </div>
                 
                 {/* Waypoint Table */}
                 <div className="flex-1 overflow-y-auto font-mono text-xs">
                    <table className="w-full text-left border-collapse">
                       <thead className="bg-slate-800 text-slate-500 sticky top-0">
                          <tr>
                             <th className="p-2 w-8">#</th>
                             <th className="p-2">COMMAND</th>
                             <th className="p-2 w-16">ALT</th>
                             <th className="p-2 w-16">PARAM</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800">
                          {missionItems.map((wp, i) => (
                             <tr key={i} className={`hover:bg-slate-800 cursor-pointer ${activeWpIndex === i ? 'bg-emerald-900/20 text-emerald-400' : ''}`}>
                                <td className="p-2 text-slate-500">{wp.seq}</td>
                                <td className="p-2 font-bold text-yellow-500">{wp.command.replace('NAV_', '')}</td>
                                <td className="p-2 text-emerald-400">{wp.alt}m</td>
                                <td className="p-2">{wp.p1 ? `T:${wp.p1}` : '-'}</td>
                             </tr>
                          ))}
                          {missionItems.length === 0 && (
                             <tr><td colSpan={4} className="p-8 text-center text-slate-600 italic">No Mission Data</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>

                 {/* Stats Footer */}
                 <div className="p-3 bg-slate-950 border-t border-slate-800 text-[10px] grid grid-cols-2 gap-2 text-slate-400">
                    <div>WAYPOINTS: <span className="text-white">{missionItems.length}</span></div>
                    <div>DISTANCE: <span className="text-white">{(missionItems.length * 0.4).toFixed(1)} km</span></div>
                    <div>HOME: <span className="text-emerald-500">{homeLocation.lat.toFixed(5)}, {homeLocation.lng.toFixed(5)}</span></div>
                 </div>
               </>
             )}

             {/* --- DRONE/OPS VIEW SIDEBAR --- */}
             {viewMode === 'drone' && (
               <>
                 {/* Checklist Panel (Conditional) */}
                 {checklistOpen && (
                    <div className="absolute inset-0 bg-slate-900/95 z-50 flex flex-col p-6 animate-in slide-in-from-right">
                       <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500"/> PRE-ARM CHECKS</h3>
                       <div className="space-y-3 flex-1">
                          {Object.entries(preflightChecks).map(([key, passed]) => (
                             <div key={key} className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                                <span className="uppercase font-bold text-sm text-slate-300">{key} CALIBRATION</span>
                                {passed ? <span className="text-emerald-500 font-bold text-xs">PASSED</span> : <span className="text-yellow-500 text-xs animate-pulse">CHECKING...</span>}
                             </div>
                          ))}
                       </div>
                       <button onClick={() => setChecklistOpen(false)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded font-bold text-sm">HIDE CHECKLIST</button>
                    </div>
                 )}

                 <div className="p-3 bg-slate-800 border-b border-slate-700 font-bold text-sm text-center text-slate-300">
                    FLIGHT ACTIONS
                 </div>
                 
                 <div className="p-4 grid grid-cols-2 gap-3 flex-1 content-start">
                    <button onClick={armed ? disarmSystem : armSystem} 
                            className={`col-span-2 py-4 rounded font-bold text-sm border flex flex-col items-center gap-1 transition-all ${armed ? 'bg-red-900/20 border-red-500 text-red-500 hover:bg-red-900/40' : 'bg-emerald-900/20 border-emerald-500 text-emerald-500 hover:bg-emerald-900/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'}`}>
                       <Power className="w-6 h-6"/> {armed ? 'DISARM MOTORS' : 'ARM MOTORS'}
                    </button>

                    <button onClick={() => setMode('AUTO')} disabled={!armed} className="p-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded text-xs font-bold disabled:opacity-50 text-blue-400">
                       <Play className="w-5 h-5 mx-auto mb-1"/> AUTO MISSION
                    </button>
                    <button onClick={() => setMode('LOITER')} disabled={!armed} className="p-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded text-xs font-bold disabled:opacity-50 text-yellow-400">
                       <Pause className="w-5 h-5 mx-auto mb-1"/> LOITER (HOLD)
                    </button>
                    <button onClick={() => setMode('RTL')} disabled={!armed} className="p-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded text-xs font-bold disabled:opacity-50 text-orange-400">
                       <RotateCcw className="w-5 h-5 mx-auto mb-1"/> RTL
                    </button>
                    <button onClick={() => setMode('LAND')} disabled={!armed} className="p-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded text-xs font-bold disabled:opacity-50 text-red-400">
                       <ArrowDown className="w-5 h-5 mx-auto mb-1"/> LAND NOW
                    </button>

                    <div className="col-span-2 mt-4 pt-4 border-t border-slate-800">
                       <button onClick={runPreflight} className="w-full py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded text-xs text-slate-400">
                          RUN PRE-FLIGHT DIAGNOSTIC
                       </button>
                    </div>
                 </div>

                 {/* Active Telemetry Box */}
                 <div className="p-4 bg-black/40 border-t border-slate-800 font-mono text-xs space-y-2">
                    <div className="flex justify-between text-slate-400"><span>ALT (REL)</span> <span className="text-white text-lg">{physics.current.alt.toFixed(1)}m</span></div>
                    <div className="flex justify-between text-slate-400"><span>AIRSPEED</span> <span className="text-white text-lg">{(physics.current.speed).toFixed(1)} m/s</span></div>
                    <div className="flex justify-between text-slate-400"><span>DIST HOME</span> <span className="text-white">{getDist(physics.current.lat, physics.current.lng, homeLocation.lat, homeLocation.lng).toFixed(0)}m</span></div>
                 </div>
               </>
             )}
          </div>
       </div>

       {/* BOTTOM: MAVLink Console */}
       <div className="h-32 bg-slate-950 border-t border-slate-800 flex flex-col font-mono text-xs">
          <div className="bg-slate-900 px-2 py-1 text-slate-500 text-[10px] font-bold border-b border-slate-800 flex justify-between">
             <span>MAVLINK CONSOLE OUTPUT</span>
             <span className="text-emerald-500">LINK QUALITY: 100%</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
             {logs.map((log) => (
               <div key={log.id} className="flex gap-2">
                  <span className="text-slate-600">[{log.timestamp}]</span>
                  <span className={`${log.severity === 'ERROR' || log.severity === 'CRITICAL' ? 'text-red-500' : log.severity === 'WARNING' ? 'text-yellow-500' : 'text-emerald-500'}`}>
                     {log.severity}
                  </span>
                  <span className="text-slate-300">{log.text}</span>
               </div>
             ))}
          </div>
       </div>
    </div>
  );
};