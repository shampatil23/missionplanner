// Example: How to Edit Waypoints for a Drone

import { useDrones } from './contexts/DroneContext';
import { MavCmd } from './types';

// In your component:
const { updateDroneRoute, drones } = useDrones();

// Example 1: Update waypoints for a specific drone
const editDroneWaypoints = (droneId: string) => {
    const newRoute = [
        {
            seq: 1,
            command: MavCmd.NAV_TAKEOFF,
            lat: 18.5204,
            lng: 73.8567,
            alt: 100
        },
        {
            seq: 2,
            command: MavCmd.NAV_WAYPOINT,
            lat: 18.5304,
            lng: 73.8767,
            alt: 100
        },
        {
            seq: 3,
            command: MavCmd.NAV_WAYPOINT,
            lat: 18.5400,
            lng: 73.8900,
            alt: 100
        },
        {
            seq: 4,
            command: MavCmd.NAV_LOITER_TIME,
            lat: 18.5400,
            lng: 73.8900,
            alt: 100,
            p1: 5  // Loiter for 5 seconds
        },
        {
            seq: 5,
            command: MavCmd.NAV_LAND,
            lat: 18.5400,
            lng: 73.8900,
            alt: 0
        }
    ];

    updateDroneRoute(droneId, newRoute);
    console.log(`Updated route for ${droneId}`);
};

// Example 2: Add a waypoint to existing route
const addWaypointToDrone = (droneId: string, newLat: number, newLng: number) => {
    const drone = drones.get(droneId);
    if (!drone || !drone.assignedRoute) return;

    const currentRoute = [...drone.assignedRoute];

    // Remove the LAND command (last waypoint)
    const landCommand = currentRoute.pop();

    // Add new waypoint
    const newWaypoint = {
        seq: currentRoute.length + 1,
        command: MavCmd.NAV_WAYPOINT,
        lat: newLat,
        lng: newLng,
        alt: 100
    };

    currentRoute.push(newWaypoint);

    // Re-add LAND command with updated sequence
    if (landCommand) {
        currentRoute.push({
            ...landCommand,
            seq: currentRoute.length + 1
        });
    }

    updateDroneRoute(droneId, currentRoute);
};

// Example 3: Change destination mid-flight
const changeDestination = (droneId: string, newLat: number, newLng: number) => {
    const drone = drones.get(droneId);
    if (!drone || !drone.assignedRoute) return;

    const currentRoute = [...drone.assignedRoute];

    // Update all waypoints after current position to new destination
    const updatedRoute = currentRoute.map((wp, index) => {
        if (index >= 2) { // Keep takeoff and first waypoint
            return {
                ...wp,
                lat: newLat,
                lng: newLng
            };
        }
        return wp;
    });

    updateDroneRoute(droneId, updatedRoute);
};

// Example 4: Insert emergency landing
const emergencyLand = (droneId: string) => {
    const drone = drones.get(droneId);
    if (!drone) return;

    // Create immediate landing route at current position
    const emergencyRoute = [
        {
            seq: 1,
            command: MavCmd.NAV_LAND,
            lat: drone.currentLocation.lat,
            lng: drone.currentLocation.lng,
            alt: 0
        }
    ];

    updateDroneRoute(droneId, emergencyRoute);
};

// Example 5: Modify altitude for all waypoints
const changeFlightAltitude = (droneId: string, newAltitude: number) => {
    const drone = drones.get(droneId);
    if (!drone || !drone.assignedRoute) return;

    const updatedRoute = drone.assignedRoute.map(wp => {
        // Don't change altitude for LAND command
        if (wp.command === MavCmd.NAV_LAND) {
            return wp;
        }
        return {
            ...wp,
            alt: newAltitude
        };
    });

    updateDroneRoute(droneId, updatedRoute);
};

export {
    editDroneWaypoints,
    addWaypointToDrone,
    changeDestination,
    emergencyLand,
    changeFlightAltitude
};
