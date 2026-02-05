import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Drone, DroneStatus, MedicineRequest, CENTRAL_HOSPITAL_LOCATION, Location, MissionItem, MavCmd, DroneTelemetry, DroneState } from '../types';

interface DroneContextType {
    drones: Map<string, Drone>;
    selectedDroneId: string | null;
    setSelectedDroneId: (id: string | null) => void;
    getAvailableDrone: () => Drone | null;
    assignTaskToDrone: (droneId: string, task: MedicineRequest, route: MissionItem[]) => void;
    updateDroneStatus: (droneId: string, status: DroneStatus) => void;
    updateDroneLocation: (droneId: string, location: Location) => void;
    updateDroneTelemetry: (droneId: string, telemetry: Partial<DroneTelemetry>) => void;
    updateDroneRoute: (droneId: string, route: MissionItem[]) => void;
    completeDroneTask: (droneId: string) => void;
    getDroneByTaskId: (taskId: string) => Drone | null;
}

const DroneContext = createContext<DroneContextType | undefined>(undefined);

// Predefined drone colors for visual distinction
const DRONE_COLORS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ec4899', // pink
    '#8b5cf6', // violet
    '#06b6d4', // cyan
];

// Initialize default drones
const createInitialDrones = (): Map<string, Drone> => {
    const drones = new Map<string, Drone>();

    for (let i = 0; i < 5; i++) {
        const droneId = `DRONE-${i + 1}`;
        const drone: Drone = {
            id: droneId,
            name: `Drone ${i + 1}`,
            status: 'idle',
            currentLocation: { ...CENTRAL_HOSPITAL_LOCATION },
            assignedTaskId: null,
            assignedRoute: null,
            homeLocation: { ...CENTRAL_HOSPITAL_LOCATION },
            color: DRONE_COLORS[i],
            telemetry: {
                latitude: CENTRAL_HOSPITAL_LOCATION.lat,
                longitude: CENTRAL_HOSPITAL_LOCATION.lng,
                altitude: 0,
                speed: 0,
                verticalSpeed: 0,
                battery: 100,
                bearing: 0,
                distanceTraveled: 0,
                distanceRemaining: 0,
                status: DroneState.IDLE,
                connectionStrength: 100,
                satellites: 14,
                flightTime: 0,
            },
        };
        drones.set(droneId, drone);
    }

    return drones;
};

export const DroneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [drones, setDrones] = useState<Map<string, Drone>>(createInitialDrones());
    const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

    // Get first available (idle) drone
    const getAvailableDrone = useCallback((): Drone | null => {
        for (const drone of drones.values()) {
            if (drone.status === 'idle') {
                return drone;
            }
        }
        return null;
    }, [drones]);

    // Assign a task and route to a specific drone
    const assignTaskToDrone = useCallback((droneId: string, task: MedicineRequest, route: MissionItem[]) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    status: 'dispatched',
                    assignedTaskId: task.id,
                    assignedRoute: route,
                });
            }
            return newDrones;
        });
    }, []);

    // Update drone status
    const updateDroneStatus = useCallback((droneId: string, status: DroneStatus) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    status,
                });
            }
            return newDrones;
        });
    }, []);

    // Update drone location
    const updateDroneLocation = useCallback((droneId: string, location: Location) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    currentLocation: location,
                });
            }
            return newDrones;
        });
    }, []);

    // Update drone telemetry
    const updateDroneTelemetry = useCallback((droneId: string, telemetry: Partial<DroneTelemetry>) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    telemetry: {
                        ...drone.telemetry,
                        ...telemetry,
                    },
                });
            }
            return newDrones;
        });
    }, []);

    // Update drone route (waypoints)
    const updateDroneRoute = useCallback((droneId: string, route: MissionItem[]) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    assignedRoute: route,
                });
            }
            return newDrones;
        });
    }, []);

    // Complete a drone's task and reset to idle
    const completeDroneTask = useCallback((droneId: string) => {
        setDrones(prev => {
            const newDrones = new Map(prev);
            const drone = newDrones.get(droneId);
            if (drone) {
                newDrones.set(droneId, {
                    ...drone,
                    status: 'idle',
                    assignedTaskId: null,
                    assignedRoute: null,
                    currentLocation: drone.homeLocation,
                });
            }
            return newDrones;
        });
    }, []);

    // Get drone by assigned task ID
    const getDroneByTaskId = useCallback((taskId: string): Drone | null => {
        for (const drone of drones.values()) {
            if (drone.assignedTaskId === taskId) {
                return drone;
            }
        }
        return null;
    }, [drones]);

    const value: DroneContextType = {
        drones,
        selectedDroneId,
        setSelectedDroneId,
        getAvailableDrone,
        assignTaskToDrone,
        updateDroneStatus,
        updateDroneLocation,
        updateDroneTelemetry,
        updateDroneRoute,
        completeDroneTask,
        getDroneByTaskId,
    };

    return <DroneContext.Provider value={value}>{children}</DroneContext.Provider>;
};

export const useDrones = () => {
    const context = useContext(DroneContext);
    if (context === undefined) {
        throw new Error('useDrones must be used within a DroneProvider');
    }
    return context;
};
