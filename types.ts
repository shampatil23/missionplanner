
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
