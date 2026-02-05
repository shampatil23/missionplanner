
export type Priority = 'Normal' | 'Emergency';
export type MissionStatus = 'pending' | 'dispatched' | 'active' | 'completed';

export enum DroneState {
  OFF = 'OFF',
  BOOTING = 'BOOTING',
  IDLE = 'IDLE', // Powered on, Disarmed
  ARMED = 'ARMED', // Motors spinning
  TAKEOFF = 'TAKEOFF',
  ENROUTE = 'ENROUTE',
  HOVER = 'HOVER',
  RETURNING = 'RETURNING', // RTH
  LANDING = 'LANDING',
  EMERGENCY = 'EMERGENCY'
}

// Multi-Drone Support: Drone availability status
export type DroneStatus = 'idle' | 'dispatched' | 'running' | 'completed' | 'returning';

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface MedicineRequest {
  id: string;
  hospitalId: string;
  hospitalName: string;
  location: Location;
  origin?: Location; // The starting point of the drone for this mission
  medicines: string[];
  priority: Priority;
  status: MissionStatus;
  timestamp: number;
  eta?: number; // in seconds
  batteryRequired?: number;
  droneId?: string; // Multi-Drone: Assigned drone ID
}

// Multi-Drone Support: Individual Drone Entity
export interface Drone {
  id: string;
  name: string;
  status: DroneStatus;
  currentLocation: Location;
  assignedTaskId: string | null;
  assignedRoute: MissionItem[] | null;
  telemetry: DroneTelemetry;
  homeLocation: Location;
  color: string; // For visual distinction on map
}

// Mission Item for waypoint-based navigation
export interface MissionItem {
  seq: number;
  command: MavCmd;
  p1?: number;
  p2?: number;
  p3?: number;
  p4?: number;
  lat: number;
  lng: number;
  alt: number;
}

// MAVLink-style Commands
export enum MavCmd {
  NAV_TAKEOFF = 'NAV_TAKEOFF',
  NAV_WAYPOINT = 'NAV_WAYPOINT',
  NAV_LOITER_TIME = 'NAV_LOITER',
  NAV_RETURN_TO_LAUNCH = 'NAV_RTL',
  NAV_LAND = 'NAV_LAND',
}

export interface SystemHealth {
  gps: boolean;
  imu: boolean;
  compass: boolean;
  comms: boolean;
  bms: boolean;
}

export interface DroneTelemetry {
  latitude: number;
  longitude: number;
  altitude: number; // meters
  speed: number; // km/h
  verticalSpeed: number; // m/s
  battery: number; // percentage
  bearing: number; // degrees
  distanceTraveled: number; // meters
  distanceRemaining: number; // meters
  status: DroneState;
  connectionStrength: number; // percentage
  satellites: number;
  flightTime: number; // seconds
}

export const CENTRAL_HOSPITAL_LOCATION: Location = {
  lat: 18.5204, // Example: Pune, India (Central Hub)
  lng: 73.8567,
};

// Mock locations for "Small Hospitals" near the central hub to simulate realistic distances
export const REMOTE_LOCATIONS: { [key: string]: Location } = {
  'PHC-Village-A': { lat: 18.5304, lng: 73.8767, address: 'North Valley PHC' }, // ~3km away
  'PHC-Village-B': { lat: 18.5100, lng: 73.8300, address: 'South Hill Clinic' }, // ~4km away
  'PHC-Village-C': { lat: 18.5500, lng: 73.8900, address: 'East River Center' }, // ~6km away
};
