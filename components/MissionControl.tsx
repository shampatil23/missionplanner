import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CENTRAL_HOSPITAL_LOCATION, MedicineRequest, DroneState, MissionItem, MavCmd } from '../types';
import { subscribeToRequests, updateRequestStatus } from '../services/firebase';
import { useDrones } from '../contexts/DroneContext';
import {
   Map as MapIcon, Target, Battery, Signal, Power, Shield,
   Play, Pause, RotateCcw, Activity, Settings, Save, Upload,
   Download, AlertTriangle, CheckCircle2, XCircle,
   ArrowUp, ArrowDown, Wind, Compass, Menu, Terminal, Layers,
   ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCw, RotateCcw as RotateCcwIcon, Home, Anchor
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

interface LogMessage {
   id: number;
   timestamp: string;
   severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
   text: string;
}


// Flight Modes
type FlightMode = 'STABILIZE' | 'LOITER' | 'AUTO' | 'RTL' | 'GUIDED' | 'LAND';

// Per-Drone Physics State
interface DronePhysics {
   lat: number;
   lng: number;
   alt: number;
   heading: number;
   speed: number;
   vSpeed: number;
   roll: number;
   pitch: number;
   battery_v: number;
   battery_rem: number;
   wind_dir: number;
   wind_spd: number;
   lastTick: number;
   armed: boolean;
   flightMode: FlightMode;
   activeWpIndex: number;
   homeLocation: { lat: number; lng: number };
   deliveryWaitTime: number; // Timer for waiting at delivery location
   isReturningHome: boolean; // Flag to track if drone is in RTL phase
}

export const MissionControl: React.FC<{ viewMode: 'planner' | 'drone' }> = ({ viewMode }) => {
   // --- STATE: SYSTEMS ---
   const [gpsFix, setGpsFix] = useState<'NO_FIX' | '2D_FIX' | '3D_FIX'>('NO_FIX');
   const [satellites, setSatellites] = useState(0);
   const [hdop, setHdop] = useState(99.9);
   const [activeControls, setActiveControls] = useState<Record<string, boolean>>({});
   const [mapReady, setMapReady] = useState(false);

   // --- DRONE CONTEXT ---
   const { drones, selectedDroneId, setSelectedDroneId, updateDroneStatus, updateDroneTelemetry, updateDroneRoute, completeDroneTask } = useDrones();

   // --- STATE: LOGS & UI ---
   const [logs, setLogs] = useState<LogMessage[]>([]);
   const [preflightChecks, setPreflightChecks] = useState({
      accel: false, gyro: false, mag: false, rc: false, battery: false
   });
   const [checklistOpen, setChecklistOpen] = useState(false);

   // --- REFS (Physics & Map) ---
   const mapContainerRef = useRef<HTMLDivElement>(null);
   const mapInstanceRef = useRef<any>(null);
   const droneMarkersRef = useRef<Map<string, any>>(new Map()); // Map of droneId -> marker
   const routeLayersRef = useRef<Map<string, any>>(new Map()); // Map of droneId -> route layer

   // Multi-drone physics - one physics state per drone
   const dronePhysicsRef = useRef<Map<string, DronePhysics>>(new Map());

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
      const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
      setTimeout(() => { addLog("MAVLINK CONNECTED (MULTI-DRONE SYSTEM)", "INFO"); }, 1000);
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

      if (!window.L) { setTimeout(() => { }, 500); return; } // Simple retry wait
      const L = window.L;

      const map = L.map(mapContainerRef.current, {
         center: [CENTRAL_HOSPITAL_LOCATION.lat, CENTRAL_HOSPITAL_LOCATION.lng],
         zoom: 13,
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

      mapInstanceRef.current = map;
      setMapReady(true);
   }, []);

   // --- INITIALIZE DRONE PHYSICS ---
   useEffect(() => {
      // Initialize physics for each drone
      drones.forEach((drone, droneId) => {
         if (!dronePhysicsRef.current.has(droneId)) {
            dronePhysicsRef.current.set(droneId, {
               lat: drone.homeLocation.lat,
               lng: drone.homeLocation.lng,
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
               lastTick: Date.now(),
               armed: false,
               flightMode: 'STABILIZE',
               activeWpIndex: -1,
               homeLocation: { ...drone.homeLocation },
               deliveryWaitTime: 0,
               isReturningHome: false
            });
         }
      });
   }, [drones]);

   // --- CREATE/UPDATE DRONE MARKERS ---
   useEffect(() => {
      if (!mapReady || !mapInstanceRef.current || !window.L) return;
      const L = window.L;
      const map = mapInstanceRef.current;

      // Create or update markers for each drone
      drones.forEach((drone, droneId) => {
         const physics = dronePhysicsRef.current.get(droneId);
         if (!physics) return;

         let marker = droneMarkersRef.current.get(droneId);

         if (!marker) {
            // Create new marker
            const droneIcon = L.divIcon({
               html: `<div id="drone-icon-${droneId}" class="relative w-10 h-10 transition-transform duration-100 ease-linear">
                     <svg viewBox="0 0 24 24" fill="none" class="w-full h-full filter drop-shadow-[0_0_5px_${drone.color}80]">
                        <path d="M12 2L15 9L12 12L9 9Z" fill="${drone.color}"></path>
                        <path d="M2 12L22 12" stroke="${drone.color}" stroke-width="1" stroke-opacity="0.5"></path>
                        <path d="M12 2L12 22" stroke="${drone.color}" stroke-width="1" stroke-opacity="0.5"></path>
                        <circle cx="12" cy="12" r="8" stroke="${drone.color}" stroke-width="1" stroke-dasharray="2 2" opacity="0.5"></circle>
                     </svg>
                     <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap bg-black/70 px-1 rounded" style="color:${drone.color}">${drone.name}</div>
                  </div>`,
               className: 'bg-transparent',
               iconSize: [40, 40],
               iconAnchor: [20, 20]
            });

            marker = L.marker([physics.lat, physics.lng], { icon: droneIcon, zIndexOffset: 1000 }).addTo(map);
            droneMarkersRef.current.set(droneId, marker);
         } else {
            // Update existing marker position
            marker.setLatLng([physics.lat, physics.lng]);
         }
      });

      // Remove markers for drones that no longer exist
      droneMarkersRef.current.forEach((marker, droneId) => {
         if (!drones.has(droneId)) {
            marker.remove();
            droneMarkersRef.current.delete(droneId);
         }
      });
   }, [drones, mapReady]);

   // --- DRAW ROUTES FOR ACTIVE DRONES ---
   const drawDroneRoute = useCallback((droneId: string, route: MissionItem[], color: string) => {
      if (!mapInstanceRef.current || !window.L || route.length === 0) return;
      const L = window.L;

      // Clear existing route for this drone
      const existingLayer = routeLayersRef.current.get(droneId);
      if (existingLayer) {
         existingLayer.clearLayers();
      }

      const layerGroup = L.layerGroup().addTo(mapInstanceRef.current);
      const points = route.map(i => [i.lat, i.lng]);

      // Path Line
      const isSelected = droneId === selectedDroneId;
      L.polyline(points, {
         color: color,
         weight: isSelected ? 3 : 2,
         dashArray: isSelected ? '' : '5, 5',
         opacity: isSelected ? 1 : 0.5
      }).addTo(layerGroup);

      // Waypoints
      route.forEach((item, index) => {
         const wpColor = item.command === MavCmd.NAV_LAND ? '#ef4444' : item.command === MavCmd.NAV_TAKEOFF ? '#3b82f6' : color;
         const icon = L.divIcon({
            html: `<div class="flex flex-col items-center">
                 <div class="w-4 h-4 rounded-full border border-black shadow-sm flex items-center justify-center text-[8px] font-bold text-black" style="background:${wpColor}">${item.seq}</div>
                 <div class="text-[8px] font-bold text-white bg-black/70 px-1 rounded mt-0.5">${item.command.replace('NAV_', '')}</div>
               </div>`,
            className: 'bg-transparent',
            iconSize: [40, 40],
            iconAnchor: [20, 8]
         });

         // Make waypoints draggable
         const marker = L.marker([item.lat, item.lng], {
            icon,
            draggable: true
         }).addTo(layerGroup);

         // Handle Drag End - Update Route
         marker.on('dragend', (e: any) => {
            const newLatLng = e.target.getLatLng();
            const updatedRoute = [...route];
            updatedRoute[index] = {
               ...item,
               lat: newLatLng.lat,
               lng: newLatLng.lng
            };
            updateDroneRoute(droneId, updatedRoute);
         });
      });

      routeLayersRef.current.set(droneId, layerGroup);
   }, [selectedDroneId, updateDroneRoute]);

   // --- UPDATE ROUTES WHEN DRONES CHANGE ---
   useEffect(() => {
      if (!mapReady) return;

      drones.forEach((drone, droneId) => {
         if (drone.assignedRoute && drone.assignedRoute.length > 0) {
            drawDroneRoute(droneId, drone.assignedRoute, drone.color);
         } else {
            // Clear route if no longer assigned
            const existingLayer = routeLayersRef.current.get(droneId);
            if (existingLayer) {
               existingLayer.clearLayers();
               routeLayersRef.current.delete(droneId);
            }
         }
      });
   }, [drones, mapReady, drawDroneRoute]);

   // --- PHYSICS LOOP (ALL DRONES) ---
   useEffect(() => {
      const tick = () => {
         const now = Date.now();

         // Update physics for ALL drones
         drones.forEach((drone, droneId) => {
            const physics = dronePhysicsRef.current.get(droneId);
            if (!physics || !drone.assignedRoute) return;

            const dt = Math.min((now - physics.lastTick) / 1000, 0.1);
            physics.lastTick = now;

            let targetLat = physics.lat;
            let targetLng = physics.lng;
            let targetAlt = physics.alt;

            if (physics.armed) {
               // Battery Drain
               physics.battery_rem -= (physics.flightMode === 'STABILIZE' ? 0.01 : 0.05) * dt;
               physics.battery_v = 22.0 + (physics.battery_rem / 100) * 3.2;

               if (physics.flightMode === 'AUTO' && drone.assignedRoute.length > 0) {
                  if (physics.activeWpIndex === -1) {
                     physics.activeWpIndex = 0;
                     updateDroneStatus(droneId, 'running');
                     addLog(`${drone.name.toUpperCase()}: MISSION STARTED`, "INFO");
                  }

                  const nextWP = drone.assignedRoute[physics.activeWpIndex];
                  if (nextWP) {
                     targetLat = nextWP.lat;
                     targetLng = nextWP.lng;
                     targetAlt = nextWP.alt;

                     const dist = getDist(physics.lat, physics.lng, targetLat, targetLng);
                     if (dist < WP_RADIUS && Math.abs(physics.alt - targetAlt) < 2) {
                        if (nextWP.command === MavCmd.NAV_LAND) {
                           targetAlt = 0;
                           if (physics.alt < 0.5) {
                              if (!physics.isReturningHome && physics.deliveryWaitTime === 0) {
                                 if (drone.assignedTaskId) {
                                    updateRequestStatus(drone.assignedTaskId, 'completed');
                                 }
                                 physics.deliveryWaitTime = dt;
                              } else if (!physics.isReturningHome && physics.deliveryWaitTime < 3) {
                                 physics.deliveryWaitTime += dt;
                              } else if (!physics.isReturningHome && physics.deliveryWaitTime >= 3) {
                                 physics.isReturningHome = true;
                                 physics.armed = true;
                                 physics.flightMode = 'RTL';
                                 addLog(`🏠 ${drone.name}: INITIATING RTL`, "INFO");
                              }
                           }
                        } else {
                           if (physics.activeWpIndex < drone.assignedRoute.length - 1) {
                              physics.activeWpIndex += 1;
                           }
                        }
                     }
                  }
               } else if (physics.flightMode === 'RTL') {
                  targetLat = physics.homeLocation.lat;
                  targetLng = physics.homeLocation.lng;
                  targetAlt = Math.max(physics.alt, RTL_ALT);
                  if (getDist(physics.lat, physics.lng, targetLat, targetLng) < 5) {
                     physics.flightMode = 'LAND';
                  }
               } else if (physics.flightMode === 'LAND') {
                  targetAlt = 0;
                  if (physics.alt < 0.5) {
                     physics.armed = false;
                     physics.flightMode = 'STABILIZE';
                     if (physics.isReturningHome) {
                        physics.isReturningHome = false;
                        physics.deliveryWaitTime = 0;
                        physics.activeWpIndex = -1;
                        completeDroneTask(droneId);
                     }
                  }
               }
            }

            // 2. Physics / Movement
            if (physics.armed) {
               // Vertical
               const vErr = targetAlt - physics.alt;
               const vSpdTarget = Math.max(-3, Math.min(5, vErr));
               physics.vSpeed += (vSpdTarget - physics.vSpeed) * 2 * dt;
               physics.alt += physics.vSpeed * dt * SIM_SPEED_MULT;

               // Horizontal (Auto Modes)
               let groundSpeed = 0;
               if (['AUTO', 'RTL', 'GUIDED', 'LAND'].includes(physics.flightMode)) {
                  groundSpeed = 15;
                  const bearing = getBearing(physics.lat, physics.lng, targetLat, targetLng);
                  let angleDiff = bearing - physics.heading;
                  while (angleDiff > 180) angleDiff -= 360;
                  while (angleDiff < -180) angleDiff += 360;

                  const turnRate = 30;
                  if (Math.abs(angleDiff) > 1) {
                     physics.heading += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate * dt * SIM_SPEED_MULT);
                     physics.heading = (physics.heading + 360) % 360;
                     physics.roll = Math.sign(angleDiff) * -15;
                  } else {
                     physics.roll = 0;
                  }

                  const moveDist = groundSpeed * dt * SIM_SPEED_MULT;
                  if (moveDist > 0) {
                     const latRad = toRad(physics.lat);
                     const lngRad = toRad(physics.lng);
                     const headRad = toRad(physics.heading);
                     const angularDist = moveDist / 6371e3;
                     const newLat = Math.asin(Math.sin(latRad) * Math.cos(angularDist) + Math.cos(latRad) * Math.sin(angularDist) * Math.cos(headRad));
                     const newLng = lngRad + Math.atan2(Math.sin(headRad) * Math.sin(angularDist) * Math.cos(latRad), Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLat));
                     physics.lat = toDeg(newLat);
                     physics.lng = toDeg(newLng);
                     physics.speed = groundSpeed * 3.6;
                  }
               }
            }

            // 3. Update telemetry (Basic)
            updateDroneTelemetry(droneId, {
               latitude: physics.lat,
               longitude: physics.lng,
               altitude: physics.alt,
               speed: physics.speed,
               verticalSpeed: physics.vSpeed,
               battery: physics.battery_rem,
               bearing: physics.heading,
               status: physics.armed ? DroneState.ENROUTE : DroneState.IDLE,
            });

            // 4. MANUAL CONTROL SYSTEM (Properly Nested)
            if (physics.armed && droneId === selectedDroneId) {
               const MOVE_SPEED = 0.00018 * dt * SIM_SPEED_MULT;
               const ALT_SPEED = 20 * dt * SIM_SPEED_MULT;
               const YAW_SPEED = 75 * dt * SIM_SPEED_MULT;
               let movedManually = false;

               // Mode Override
               if (Object.values(activeControls).some(v => v)) {
                  if (physics.flightMode !== 'GUIDED' && (physics.flightMode === 'AUTO' || physics.flightMode === 'RTL' || physics.flightMode === 'STABILIZE')) {
                     physics.flightMode = 'GUIDED';
                     physics.isReturningHome = false;
                     addLog("MANUAL CONTROL ACTIVE", "WARNING");
                  }
               }

               // Throttle / Yaw (WASD)
               if (activeControls['up']) { physics.alt += ALT_SPEED; movedManually = true; }
               if (activeControls['down']) { physics.alt = Math.max(0, physics.alt - ALT_SPEED); movedManually = true; }
               if (activeControls['turnLeft']) { physics.heading = (physics.heading - YAW_SPEED + 360) % 360; movedManually = true; }
               if (activeControls['turnRight']) { physics.heading = (physics.heading + YAW_SPEED) % 360; movedManually = true; }

               // Pitch / Roll (Arrows)
               if (activeControls['forward'] || activeControls['backward'] || activeControls['left'] || activeControls['right']) {
                  let dx = 0, dy = 0;
                  if (activeControls['forward']) { dx += Math.cos(toRad(physics.heading)); dy += Math.sin(toRad(physics.heading)); physics.pitch = 15; }
                  else if (activeControls['backward']) { dx -= Math.cos(toRad(physics.heading)); dy -= Math.sin(toRad(physics.heading)); physics.pitch = -15; }
                  else { physics.pitch *= 0.8; }

                  if (activeControls['left']) { dx += Math.cos(toRad(physics.heading - 90)); dy += Math.sin(toRad(physics.heading - 90)); physics.roll = -15; }
                  else if (activeControls['right']) { dx += Math.cos(toRad(physics.heading + 90)); dy += Math.sin(toRad(physics.heading + 90)); physics.roll = 15; }
                  else { physics.roll *= 0.8; }

                  physics.lat += MOVE_SPEED * dx;
                  physics.lng += MOVE_SPEED * dy;
                  movedManually = true;
               } else {
                  physics.pitch *= 0.6;
                  physics.roll *= 0.6;
               }

               if (movedManually) {
                  physics.speed = 45; // Fixed speed indicator for manual
                  updateDroneTelemetry(drone.id, {
                     latitude: physics.lat,
                     longitude: physics.lng,
                     altitude: physics.alt,
                     bearing: physics.heading,
                     status: DroneState.ENROUTE
                  });
               }
            }

            // 5. Update marker
            const marker = droneMarkersRef.current.get(droneId);
            if (marker) {
               marker.setLatLng([physics.lat, physics.lng]);
               const icon = marker.getElement()?.querySelector(`#drone-icon-${droneId}`);
               if (icon) (icon as HTMLElement).style.transform = `rotate(${physics.heading}deg)`;
               if (droneId === selectedDroneId && physics.flightMode !== 'STABILIZE' && viewMode === 'drone') {
                  mapInstanceRef.current?.panTo([physics.lat, physics.lng], { animate: false });
               }
            }
         });

         requestRef.current = requestAnimationFrame(tick);
      };
      requestRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(requestRef.current);
   }, [drones, selectedDroneId, viewMode, updateDroneTelemetry, updateDroneStatus, completeDroneTask, activeControls]);

   // --- KEYBOARD LISTENERS ---
   useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
         const keyMap: Record<string, string> = {
            'w': 'up', 'W': 'up',
            's': 'down', 'S': 'down',
            'a': 'turnLeft', 'A': 'turnLeft',
            'd': 'turnRight', 'D': 'turnRight',
            'ArrowUp': 'forward',
            'ArrowDown': 'backward',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            ' ': 'up', 'Shift': 'down'
         };

         if (keyMap[e.key]) {
            e.preventDefault();
            setActiveControls(prev => ({ ...prev, [keyMap[e.key]]: true }));
         }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
         const keyMap: Record<string, string> = {
            'w': 'up', 'W': 'up',
            's': 'down', 'S': 'down',
            'a': 'turnLeft', 'A': 'turnLeft',
            'd': 'turnRight', 'D': 'turnRight',
            'ArrowUp': 'forward',
            'ArrowDown': 'backward',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            ' ': 'up', 'Shift': 'down'
         };

         if (keyMap[e.key]) {
            setActiveControls(prev => ({ ...prev, [keyMap[e.key]]: false }));
         }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
         window.removeEventListener('keydown', handleKeyDown);
         window.removeEventListener('keyup', handleKeyUp);
      };
   }, []);

   // --- ACTIONS (for selected drone only) ---
   const getSelectedDrone = () => {
      if (!selectedDroneId) return null;
      return drones.get(selectedDroneId);
   };

   const getSelectedPhysics = () => {
      if (!selectedDroneId) return null;
      return dronePhysicsRef.current.get(selectedDroneId);
   };

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
      const drone = getSelectedDrone();
      const physics = getSelectedPhysics();
      if (!drone || !physics) {
         addLog("ARM FAIL: NO DRONE SELECTED", "ERROR");
         return;
      }

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
            delay += 600;
            setTimeout(() => {
               setPreflightChecks(prev => ({ ...prev, [step]: true }));
            }, delay);
         });

         setTimeout(() => {
            setChecklistOpen(false);
            physics.armed = true;
            addLog(`${drone.name.toUpperCase()}: MOTORS ARMED`, "WARNING");
         }, 3200);
         return;
      }

      physics.armed = true;
      addLog(`${drone.name.toUpperCase()}: MOTORS ARMED. CAUTION.`, "WARNING");
   };

   const disarmSystem = () => {
      const drone = getSelectedDrone();
      const physics = getSelectedPhysics();
      if (!drone || !physics) return;

      if (physics.alt > 2) { addLog("DISARM REJECTED: VEHICLE AIRBORNE", "CRITICAL"); return; }
      physics.armed = false;
      physics.flightMode = 'STABILIZE';
      addLog(`${drone.name.toUpperCase()}: MOTORS DISARMED`, "INFO");
   };

   const setMode = (mode: FlightMode) => {
      const drone = getSelectedDrone();
      const physics = getSelectedPhysics();
      if (!drone || !physics) return;

      if (mode === 'AUTO' && (!drone.assignedRoute || drone.assignedRoute.length === 0)) {
         addLog("AUTO FAIL: NO MISSION", "ERROR");
         return;
      }
      if (mode === 'AUTO' && !physics.armed) { addLog("AUTO FAIL: ARM FIRST", "ERROR"); return; }

      physics.flightMode = mode;

      // Stop RTL if mode changed manually
      if (physics.flightMode !== 'RTL') {
         physics.isReturningHome = false;
         physics.deliveryWaitTime = 0;
      }

      addLog(`${drone.name.toUpperCase()}: MODE CHANGED: ${mode}`, "INFO");
   };

   // --- MANUAL CONTROL ---
   const handleManualControl = (action: string, active: boolean) => {
      setActiveControls(prev => ({ ...prev, [action]: active }));

      // Initial override check
      if (active) {
         const physics = getSelectedPhysics();
         if (physics && (physics.flightMode === 'AUTO' || physics.flightMode === 'RTL')) {
            physics.flightMode = 'GUIDED';
            physics.isReturningHome = false;
            addLog("MANUAL OVERRIDE: SWITCHING TO GUIDED", "WARNING");
         }
      }
   };

   // --- RENDERERS ---
   const renderHUD = () => {
      const physics = getSelectedPhysics();
      if (!physics) return null;

      return (
         <div className="absolute top-4 left-4 z-20 w-64 pointer-events-none">
            {/* Primary Flight Display (PFD) */}
            <div className="bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative h-48 mb-2 backdrop-blur">
               {/* Artificial Horizon */}
               <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                  <div className="w-96 h-96 bg-gradient-to-b from-sky-600 to-amber-700 transition-transform duration-75"
                     style={{ transform: `rotate(${-physics.roll}deg) translateY(${physics.pitch * 2}px)` }}>
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
                        style={{ top: `${(physics.speed / 3.6 - val) * 2}px` }}>{val}</div>
                  ))}
                  <div className="absolute top-1/2 right-0 w-3 h-0 border-y-[5px] border-r-[8px] border-y-transparent border-r-yellow-400"></div>
                  <div className="absolute top-2 left-1 text-[10px] font-bold text-sky-400">SPD</div>
               </div>

               {/* Alt Tape */}
               <div className="absolute right-0 top-0 bottom-0 w-12 bg-black/40 border-l border-white/20 flex flex-col items-start justify-center py-2 pl-1 overflow-hidden">
                  {[100, 50, 0].map(val => (
                     <div key={val} className="text-[10px] text-white font-mono h-8 border-l border-white/50 pl-1 w-full leading-none relative"
                        style={{ top: `${(physics.alt - val) * 2}px` }}>{val}</div>
                  ))}
                  <div className="absolute top-1/2 left-0 w-3 h-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-yellow-400"></div>
                  <div className="absolute top-2 right-1 text-[10px] font-bold text-emerald-400">ALT</div>
               </div>
            </div>

            {/* Compass Strip */}
            <div className="bg-slate-900/90 border border-slate-700 rounded h-8 mb-2 flex items-center justify-center relative overflow-hidden">
               <div className="flex gap-8 transition-transform duration-75" style={{ transform: `translateX(${-physics.heading * 2}px)` }}>
                  {Array.from({ length: 36 }).map((_, i) => (
                     <div key={i} className="w-8 flex-shrink-0 text-center border-l border-slate-700 text-[10px] font-mono text-slate-400">
                        {i * 10 === 0 ? 'N' : i * 10 === 90 ? 'E' : i * 10 === 180 ? 'S' : i * 10 === 270 ? 'W' : i * 10}
                     </div>
                  ))}
               </div>
               <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"></div>
            </div>
         </div>
      );
   };

   const renderTopBar = () => {
      const drone = getSelectedDrone();
      const physics = getSelectedPhysics();

      return (
         <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-3 text-xs font-mono select-none">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2 text-emerald-500">
                  <Activity className="w-4 h-4" />
                  <span className="font-bold">MULTI-DRONE GCS</span>
               </div>
               {drone && physics && (
                  <>
                     <div className="flex items-center gap-2 text-blue-400">
                        <Target className="w-4 h-4" />
                        <span className="font-bold">{drone.name.toUpperCase()}</span>
                     </div>
                     <div className={`flex items-center gap-2 ${physics.flightMode === 'STABILIZE' ? 'text-yellow-500' : 'text-emerald-500'}`}>
                        <span className="font-bold">MODE: {physics.flightMode}</span>
                     </div>
                     <div className={`px-2 py-0.5 rounded font-bold ${physics.armed ? 'bg-red-900/50 text-red-500 border border-red-900' : 'bg-green-900/50 text-green-500 border border-green-900'}`}>
                        {physics.armed ? 'ARMED' : 'DISARMED'}
                     </div>
                  </>
               )}
            </div>

            <div className="flex items-center gap-6 text-slate-400">
               <div className={`flex items-center gap-1 ${gpsFix === '3D_FIX' ? 'text-white' : 'text-red-500'}`}>
                  <Signal className="w-3 h-3" />
                  <span>GPS: {gpsFix} ({satellites}) HDOP: {hdop}</span>
               </div>
               {physics && (
                  <div className="flex items-center gap-1">
                     <Battery className="w-3 h-3" />
                     <span className={physics.battery_rem < 30 ? 'text-red-500' : 'text-white'}>{physics.battery_v.toFixed(1)}V ({physics.battery_rem.toFixed(0)}%)</span>
                  </div>
               )}
            </div>
         </div>
      );
   };

   const renderDroneList = () => {
      return (
         <div className="p-3 bg-slate-800 border-b border-slate-700">
            <h3 className="text-xs font-bold text-slate-400 mb-2">DRONE FLEET</h3>
            <div className="space-y-1">
               {Array.from(drones.values()).map(drone => {
                  const isSelected = drone.id === selectedDroneId;
                  const physics = dronePhysicsRef.current.get(drone.id);
                  return (
                     <button
                        key={drone.id}
                        onClick={() => setSelectedDroneId(drone.id)}
                        className={`w-full p-2 rounded text-left text-xs transition-all ${isSelected
                           ? 'bg-blue-900/40 border border-blue-500/50 text-white'
                           : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
                           }`}
                     >
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: drone.color }}></div>
                              <span className="font-bold">{drone.name}</span>
                           </div>
                           <span className={`text-[10px] font-bold ${drone.status === 'idle' ? 'text-green-400' :
                              drone.status === 'running' ? 'text-blue-400' :
                                 'text-yellow-400'
                              }`}>
                              {drone.status.toUpperCase()}
                           </span>
                        </div>
                        {physics && physics.armed && (
                           <div className="mt-1 text-[10px] text-slate-400">
                              ALT: {physics.alt.toFixed(0)}m | SPD: {physics.speed.toFixed(0)} km/h | BAT: {physics.battery_rem.toFixed(0)}%
                           </div>
                        )}
                     </button>
                  );
               })}
            </div>
         </div>
      );
   };

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
                  {getSelectedPhysics() ? `${getSelectedPhysics()!.lat.toFixed(7)}, ${getSelectedPhysics()!.lng.toFixed(7)}` : 'No drone selected'}
               </div>
            </div>

            {/* RIGHT SIDEBAR: Planner / Operations */}
            <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-30 shadow-xl">

               {/* --- PLANNER VIEW SIDEBAR --- */}
               {viewMode === 'planner' && (
                  <>
                     <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="font-bold text-sm flex items-center gap-2"><MapIcon className="w-4 h-4 text-blue-400" /> MISSION OVERVIEW</h3>
                     </div>

                     {renderDroneList()}

                     {/* Mission Summary */}
                     <div className="flex-1 overflow-y-auto p-3">
                        <h3 className="text-xs font-bold text-slate-400 mb-2">ACTIVE MISSIONS</h3>
                        {Array.from(drones.values()).filter(d => d.assignedRoute).map(drone => (
                           <div key={drone.id} className="mb-3 p-3 bg-slate-800 rounded border border-slate-700">
                              <div className="flex items-center gap-2 mb-2">
                                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: drone.color }}></div>
                                 <span className="font-bold text-sm text-white">{drone.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                 WAYPOINTS: {drone.assignedRoute?.length || 0}
                              </div>
                              <div className="text-[10px] text-emerald-400 mt-1">
                                 STATUS: {drone.status.toUpperCase()}
                              </div>
                           </div>
                        ))}
                        {Array.from(drones.values()).filter(d => d.assignedRoute).length === 0 && (
                           <div className="text-center text-slate-600 text-sm py-8">No active missions</div>
                        )}
                     </div>
                  </>
               )}

               {/* --- DRONE/OPS VIEW SIDEBAR --- */}
               {viewMode === 'drone' && (
                  <>
                     {/* Checklist Panel (Conditional) */}
                     {checklistOpen && (
                        <div className="absolute inset-0 bg-slate-900/95 z-50 flex flex-col p-6 animate-in slide-in-from-right">
                           <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> PRE-ARM CHECKS</h3>
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

                     {renderDroneList()}

                     <div className="p-3 bg-slate-800/80 backdrop-blur-md border-b border-slate-700/50 font-bold text-[11px] uppercase tracking-widest text-center text-blue-400">
                        Mission Payload & Flight Operations
                     </div>

                     <div className="p-4 flex flex-col gap-5 flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-slate-900/50 to-slate-950/50">

                        {/* SYSTEM STATUS PANEL */}
                        <div className="space-y-2">
                           <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Critical Systems</div>
                           <div className="grid grid-cols-2 gap-3">
                              <button onClick={getSelectedPhysics()?.armed ? disarmSystem : armSystem}
                                 disabled={!selectedDroneId}
                                 className={`py-4 rounded-xl font-bold text-xs border-2 shadow-lg transition-all duration-300 disabled:opacity-30 flex flex-col items-center justify-center gap-2 group ${getSelectedPhysics()?.armed
                                    ? 'bg-red-500/10 border-red-500 text-red-500 shadow-red-500/20'
                                    : 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-emerald-500/20 hover:scale-[1.02]'}`}>
                                 <Power className={`w-6 h-6 transition-transform group-hover:rotate-12 ${getSelectedPhysics()?.armed ? 'animate-pulse' : ''}`} />
                                 <span className="tracking-widest">{getSelectedPhysics()?.armed ? 'FORCE STOP' : 'POWER ON'}</span>
                              </button>

                              <button onClick={() => setMode('LAND')}
                                 disabled={!selectedDroneId || !getSelectedPhysics()?.armed}
                                 className="py-4 bg-amber-500/10 border-2 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500 rounded-xl text-xs font-bold disabled:opacity-30 text-amber-500 flex flex-col items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/10 group">
                                 <ArrowDown className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                                 <span className="tracking-widest">LAND NOW</span>
                              </button>
                           </div>
                        </div>

                        {/* MODE SELECTION */}
                        <div className="space-y-2">
                           <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Flight Protocol</div>
                           <div className="grid grid-cols-3 gap-2 bg-slate-950/50 p-2 rounded-xl border border-slate-800/50 backdrop-blur-xl">
                              {(['LOITER', 'AUTO', 'RTL'] as const).map(m => (
                                 <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    disabled={!selectedDroneId}
                                    className={`py-2.5 rounded-lg text-[10px] font-black transition-all duration-300 border ${getSelectedPhysics()?.flightMode === m
                                       ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] translate-z-1'
                                       : 'bg-slate-900/80 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                                       }`}>
                                    {m}
                                 </button>
                              ))}
                           </div>
                        </div>

                        {/* JOYSTICKS CONTAINER */}
                        <div className="flex justify-between items-center gap-4 py-2 px-1">
                           {/* LEFT STICK (Throttle / Yaw) */}
                           <div className="flex flex-col items-center gap-2">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">Primary Lift</span>
                              <div className="w-32 h-32 rounded-3xl bg-slate-950 border-2 border-slate-800 relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden">
                                 <div className="absolute inset-0 opacity-20 pointer-events-none">
                                    <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-500"></div>
                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-blue-500"></div>
                                    <div className="absolute inset-0 border-[10px] border-slate-800 rounded-2xl"></div>
                                 </div>

                                 {/* Directional Glows */}
                                 {activeControls['up'] && <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-blue-500/20 to-transparent"></div>}
                                 {activeControls['down'] && <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-blue-500/20 to-transparent"></div>}
                                 {activeControls['turnLeft'] && <div className="absolute left-0 inset-y-0 w-12 bg-gradient-to-r from-blue-500/20 to-transparent"></div>}
                                 {activeControls['turnRight'] && <div className="absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-blue-500/20 to-transparent"></div>}

                                 {/* Virtual Stick Handle */}
                                 <div
                                    className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-2xl border-2 border-slate-600/50 z-10 transition-transform duration-150 ease-out flex items-center justify-center"
                                    style={{
                                       transform: `translate(${(activeControls['turnRight'] ? 35 : 0) - (activeControls['turnLeft'] ? 35 : 0)}px, ${(activeControls['down'] ? 35 : 0) - (activeControls['up'] ? 35 : 0)}px)`
                                    }}
                                 >
                                    <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-pulse"></div>
                                 </div>
                              </div>
                           </div>

                           <div className="w-px h-24 bg-gradient-to-b from-transparent via-slate-700 to-transparent ml-2"></div>

                           {/* RIGHT STICK (Pitch / Roll) */}
                           <div className="flex flex-col items-center gap-2">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">Vector Nav</span>
                              <div className="w-32 h-32 rounded-3xl bg-slate-950 border-2 border-slate-800 relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden">
                                 <div className="absolute inset-0 opacity-20 pointer-events-none">
                                    <div className="absolute top-1/2 left-0 right-0 h-px bg-amber-500"></div>
                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-500"></div>
                                    <div className="absolute inset-0 border-[10px] border-slate-800 rounded-2xl"></div>
                                 </div>

                                 {/* Directional Glows */}
                                 {activeControls['forward'] && <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-amber-500/20 to-transparent"></div>}
                                 {activeControls['backward'] && <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-amber-500/20 to-transparent"></div>}
                                 {activeControls['left'] && <div className="absolute left-0 inset-y-0 w-12 bg-gradient-to-r from-amber-500/20 to-transparent"></div>}
                                 {activeControls['right'] && <div className="absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-amber-500/20 to-transparent"></div>}

                                 {/* Virtual Stick Handle */}
                                 <div
                                    className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-2xl border-2 border-slate-600/50 z-10 transition-transform duration-150 ease-out flex items-center justify-center"
                                    style={{
                                       transform: `translate(${(activeControls['right'] ? 35 : 0) - (activeControls['left'] ? 35 : 0)}px, ${(activeControls['backward'] ? 35 : 0) - (activeControls['forward'] ? 35 : 0)}px)`
                                    }}
                                 >
                                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-pulse"></div>
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* EXTRA ACTIONS */}
                        <div className="grid grid-cols-2 gap-3 mt-1">
                           <button onClick={runPreflight} className="py-2.5 bg-slate-800/50 border border-slate-700 hover:bg-slate-700 hover:border-blue-500/50 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition-all flex items-center justify-center gap-2 group">
                              <CheckCircle2 className="w-4 h-4 group-hover:text-blue-400" /> SYSTEMS CHECK
                           </button>
                           <button onClick={() => setMode('GUIDED')} disabled={!selectedDroneId} className="py-2.5 bg-slate-800/50 border border-slate-700 hover:bg-slate-700 hover:border-blue-500/50 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition-all flex items-center justify-center gap-2 group">
                              <Anchor className="w-4 h-4 group-hover:text-blue-400" /> MISSION PAUSE
                           </button>
                        </div>
                     </div>


                     {/* Active Telemetry Box */}
                     {getSelectedPhysics() && (
                        <div className="p-4 bg-slate-950 border-t border-slate-800">
                           <div className="bg-blue-500/5 rounded-xl border border-blue-500/10 p-3 space-y-3 shadow-inner">
                              <div className="flex items-center justify-between">
                                 <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Altitude</span>
                                    <span className="text-xl font-black text-white font-mono leading-none">{getSelectedPhysics()!.alt.toFixed(1)}<span className="text-[10px] ml-1 text-slate-400">m</span></span>
                                 </div>
                                 <div className="flex flex-col text-right">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Airspeed</span>
                                    <span className="text-xl font-black text-white font-mono leading-none">{(getSelectedPhysics()!.speed).toFixed(1)}<span className="text-[10px] ml-1 text-slate-400">km/h</span></span>
                                 </div>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                 <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300"
                                    style={{ width: `${Math.min(100, (getSelectedPhysics()!.alt / 120) * 100)}%` }}></div>
                              </div>
                              <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                                 <div className="flex items-center gap-2">
                                    <Home className="w-3 h-3 text-slate-500" />
                                    <span className="text-[9px] font-bold text-slate-500 p-0 m-0 leading-none uppercase">Range Home</span>
                                 </div>
                                 <span className="text-xs font-bold text-blue-400 font-mono">{getDist(getSelectedPhysics()!.lat, getSelectedPhysics()!.lng, getSelectedPhysics()!.homeLocation.lat, getSelectedPhysics()!.homeLocation.lng).toFixed(0)}m</span>
                              </div>
                           </div>
                        </div>
                     )}
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
      </div >
   );
};