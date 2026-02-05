# 🚁 Multi-Drone Mission Planner - Quick Start Guide

## System Overview

Your multi-drone mission planner now supports **5 simultaneous drones** with full manual control and real-time tracking.

## 🎯 Key Features Implemented

### 1. Manual Control (No Auto-Start) ✅
- Drones **DO NOT** automatically start when dispatched
- Pilot must manually:
  1. Select the drone
  2. Click "ARM MOTORS"
  3. Click "AUTO MISSION"
- This gives you full control over mission timing

### 2. 5-Drone Fleet ✅
```
Drone 1 (Emerald) - Available
Drone 2 (Blue)    - Available  
Drone 3 (Amber)   - Available
Drone 4 (Pink)    - Available
Drone 5 (Violet)  - Available
```

### 3. Delivery Notifications ✅
When a drone reaches the PHC:
```
🚁 DRONE 1: MEDICINES DELIVERED TO PHC SUCCESSFULLY
📦 DELIVERY COMPLETE - DRONE REACHED PHC DESTINATION
```

### 4. Waypoint Editing ✅
You can now modify drone routes using:
```typescript
updateDroneRoute(droneId, newRoute)
```

## 📋 How to Use

### Step 1: Request Medicine
1. Go to **"Request Form"** tab
2. Select hospital location
3. Choose medicines needed
4. Set priority (Normal/Emergency)
5. Click **"Submit Request"**

### Step 2: Dispatch Drone
1. Go to **"Dispatch Dashboard"** tab
2. See pending requests in the right panel
3. Click **"DISPATCH"** on any request
4. System assigns an available drone
5. Route is automatically generated

### Step 3: Start Mission (Manual)
1. Go to **"Drone View"** tab
2. Select the dispatched drone from the fleet list
3. Click **"ARM MOTORS"** button
4. Click **"AUTO MISSION"** button
5. Drone will start flying!

### Step 4: Monitor Progress
- Watch drone on map (colored marker)
- See telemetry in bottom panel:
  - Altitude
  - Speed
  - Battery
  - Distance to home
- Check MAVLink console for status updates

### Step 5: Mission Complete
- Drone automatically lands at PHC
- Delivery notification appears
- Status updates to "COMPLETED"
- Drone returns to idle state

## 🎮 Control Panel

### Available Commands
- **ARM MOTORS**: Enable motors (required before flight)
- **DISARM MOTORS**: Disable motors (only on ground)
- **AUTO MISSION**: Start autonomous mission
- **LOITER (HOLD)**: Hover at current position
- **RTL**: Return to launch point
- **LAND NOW**: Emergency landing

### Safety Features
- Cannot disarm while airborne
- Cannot start AUTO without arming first
- Cannot start AUTO without a mission
- Battery monitoring with warnings

## 📊 Dashboard Information

### Central Command (Dispatch Dashboard)
**Left Panel Shows:**
- Hub location (draggable marker)
- Drone fleet status
  - Green = IDLE (available)
  - Blue = RUNNING (active)
  - Yellow = DISPATCHED (assigned)

**Right Panel Shows:**
- Pending requests (orange)
- Active missions (green, with drone name)
- Completed tasks (blue)

### Mission Planner View
**Shows:**
- All active missions
- Waypoint count per drone
- Mission status

### Drone View
**Shows:**
- HUD (Heads-Up Display) for selected drone
- Artificial horizon
- Speed and altitude tapes
- Compass
- Flight controls
- Real-time telemetry

## 🔧 Advanced Features

### Editing Waypoints
See `examples/waypointEditingExamples.ts` for code examples:
- Add waypoints to route
- Change destination mid-flight
- Modify flight altitude
- Emergency landing procedures

### Multiple Simultaneous Missions
1. Dispatch up to 5 tasks
2. Each gets a different drone
3. Go to Drone View
4. Select and start each drone
5. All fly simultaneously
6. Switch between drones to monitor

### Emergency Procedures
**If something goes wrong:**
1. Select the drone
2. Click **"RTL"** (Return to Launch)
   - OR -
3. Click **"LAND NOW"** (Emergency landing)

## 📈 Status Indicators

### Request Status
- **Pending**: Waiting for dispatch
- **Dispatched**: Drone assigned, waiting for pilot
- **Active**: Mission in progress
- **Completed**: Delivered successfully

### Drone Status
- **IDLE**: Available for new missions
- **DISPATCHED**: Assigned but not started
- **RUNNING**: Active mission in progress
- **COMPLETED**: Mission finished

### Flight Modes
- **STABILIZE**: Manual control (default)
- **AUTO**: Following waypoints
- **LOITER**: Hovering in place
- **RTL**: Returning to home
- **LAND**: Landing procedure

## 🎨 Visual Guide

### Map Legend
- **Blue Diamond**: Central Hub (draggable)
- **Colored Drone Icons**: Active drones
  - Emerald, Blue, Amber, Pink, Violet
- **Dashed Lines**: Planned routes
- **Solid Lines**: Active routes (selected drone)
- **Numbered Circles**: Waypoints
  - Blue = TAKEOFF
  - Yellow = WAYPOINT
  - Red = LAND

### Color Coding
- **Green/Emerald**: Normal operations
- **Blue**: Information/Active
- **Yellow/Amber**: Warnings/Pending
- **Red**: Critical/Emergency
- **Orange**: Attention needed

## 💡 Tips & Best Practices

1. **Always check drone status** before dispatching
2. **Monitor battery levels** during flight
3. **Use RTL** if battery gets low
4. **Select drone before arming** to avoid confusion
5. **Watch the console** for important messages
6. **Don't dispatch more than 5 tasks** at once

## 🐛 Troubleshooting

**Drone won't start?**
- Make sure you selected the correct drone
- Check if motors are armed
- Verify AUTO mode is selected
- Ensure mission is loaded

**Can't dispatch task?**
- Check if drones are available
- All 5 drones might be busy
- Wait for a drone to complete its mission

**Drone not moving?**
- Verify it's armed
- Check flight mode is AUTO
- Look for error messages in console

**Task not completing?**
- Wait for drone to land completely
- Check altitude is below 0.5m
- Verify drone reached destination

## 📞 System Information

**Drone Fleet**: 5 drones
**Max Simultaneous Missions**: 5
**Default Altitude**: 100m
**Cruise Speed**: 15 m/s (54 km/h)
**Waypoint Radius**: 15m
**RTL Altitude**: 50m

---

## 🎉 You're Ready to Fly!

The system is fully operational. Start by creating a request, dispatching a drone, and manually starting your first mission!

**Happy Flying! 🚁**
