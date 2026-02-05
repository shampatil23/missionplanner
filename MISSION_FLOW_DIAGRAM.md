# 🚁 Complete Drone Mission Flow

## Full Mission Cycle with Automatic RTL

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE MISSION CYCLE                        │
└─────────────────────────────────────────────────────────────────┘

1. REQUEST CREATED
   └─> User submits medicine request via Request Form
       Status: PENDING

2. DRONE DISPATCHED
   └─> Operator clicks DISPATCH on Dispatch Dashboard
       ├─> System finds available drone
       ├─> Generates route (TAKEOFF → WAYPOINT → LAND)
       ├─> Assigns task to drone
       └─> Status: DISPATCHED

3. MANUAL START (Pilot Control)
   └─> Pilot goes to Drone View
       ├─> Selects assigned drone
       ├─> Clicks ARM MOTORS
       ├─> Clicks AUTO MISSION
       └─> Status: RUNNING

4. OUTBOUND FLIGHT
   └─> Drone flies to PHC
       ├─> Follows waypoints autonomously
       ├─> Altitude: 100m
       ├─> Speed: 15 m/s (54 km/h)
       └─> Telemetry updates in real-time

5. DELIVERY LANDING ⭐ NEW
   └─> Drone lands at PHC
       ├─> Altitude drops below 0.5m
       ├─> Motors DISARM
       ├─> Delivery notification sent:
       │   ├─> "🚁 MEDICINES DELIVERED TO PHC SUCCESSFULLY"
       │   ├─> "📦 DELIVERY COMPLETE - DRONE REACHED PHC DESTINATION"
       │   └─> "⏱️ WAITING 3 SECONDS BEFORE RTL"
       ├─> Task marked COMPLETED in Firebase
       └─> Status: COMPLETED

6. WAIT PERIOD ⭐ NEW
   └─> Drone waits on ground for 3 seconds
       ├─> deliveryWaitTime: 0s → 1s → 2s → 3s
       ├─> Drone remains stationary
       └─> Preparing for RTL

7. RTL INITIATION ⭐ NEW
   └─> After 3 seconds elapsed
       ├─> Motors RE-ARM automatically
       ├─> Flight mode switches to RTL
       ├─> Notifications sent:
       │   ├─> "🏠 INITIATING RETURN TO LAUNCH"
       │   └─> "✈️ TAKING OFF FOR RTL"
       └─> Drone takes off from PHC

8. RETURN FLIGHT ⭐ NEW
   └─> Drone flies back to Central Hub
       ├─> Navigates to home coordinates
       ├─> Altitude: 50m (RTL altitude)
       ├─> Speed: 15 m/s
       └─> Autonomous navigation

9. HOME LANDING ⭐ NEW
   └─> Drone lands at Central Hub
       ├─> Altitude drops below 0.5m
       ├─> Motors DISARM
       ├─> Notification: "RTL COMPLETE - DRONE AT HOME"
       ├─> All flags reset
       └─> Status: IDLE

10. READY FOR NEXT MISSION
    └─> Drone available for new tasks
        ├─> Can be dispatched again
        ├─> Battery recharged (simulated)
        └─> Cycle repeats

┌─────────────────────────────────────────────────────────────────┐
│                      TIMELINE EXAMPLE                            │
└─────────────────────────────────────────────────────────────────┘

00:00 - Request created
00:05 - Drone dispatched
00:10 - Pilot arms and starts mission
00:15 - Drone takes off (TAKEOFF waypoint)
00:30 - Drone en route to PHC (WAYPOINT)
01:00 - Drone arrives at PHC
01:05 - Drone lands at PHC (LAND waypoint)
01:05 - ⭐ Delivery notification sent
01:05 - ⭐ 3-second wait begins
01:08 - ⭐ RTL initiated, drone takes off
01:10 - ⭐ Drone flying back to home
01:40 - ⭐ Drone arrives at home
01:45 - ⭐ Drone lands at home
01:45 - Mission complete, drone IDLE

Total Mission Time: ~1 minute 45 seconds

┌─────────────────────────────────────────────────────────────────┐
│                    DRONE STATUS CHANGES                          │
└─────────────────────────────────────────────────────────────────┘

IDLE → DISPATCHED → RUNNING → COMPLETED → IDLE
  ↑                                          ↓
  └──────────────────────────────────────────┘
           (After RTL and home landing)

┌─────────────────────────────────────────────────────────────────┐
│                   FLIGHT MODE CHANGES                            │
└─────────────────────────────────────────────────────────────────┘

STABILIZE → AUTO → STABILIZE → RTL → STABILIZE
   (Idle)   (Mission) (Delivery) (Return) (Home)

┌─────────────────────────────────────────────────────────────────┐
│                    CONSOLE LOG EXAMPLE                           │
└─────────────────────────────────────────────────────────────────┘

[18:30:00] INFO    SYSTEM BOOT INITIATED...
[18:30:01] INFO    MAVLINK CONNECTED (MULTI-DRONE SYSTEM)
[18:30:03] INFO    GPS 3D LOCK ACQUIRED
[18:30:10] WARNING DRONE 1: MOTORS ARMED
[18:30:12] INFO    DRONE 1: MISSION STARTED
[18:30:15] INFO    DRONE 1: WP 1 → WP 2
[18:30:30] INFO    DRONE 1: WP 2 → WP 3
[18:31:05] INFO    🚁 DRONE 1: MEDICINES DELIVERED TO PHC SUCCESSFULLY
[18:31:05] INFO    📦 DELIVERY COMPLETE - DRONE REACHED PHC DESTINATION
[18:31:05] INFO    ⏱️ DRONE 1: WAITING 3 SECONDS BEFORE RTL
[18:31:08] INFO    🏠 DRONE 1: INITIATING RETURN TO LAUNCH
[18:31:08] INFO    ✈️ DRONE 1: TAKING OFF FOR RTL
[18:31:45] INFO    DRONE 1: RTL COMPLETE - DRONE AT HOME

┌─────────────────────────────────────────────────────────────────┐
│                  MULTI-DRONE SCENARIO                            │
└─────────────────────────────────────────────────────────────────┘

Drone 1: PHC-A → Delivery → Wait 3s → RTL → Home
Drone 2: PHC-B → Delivery → Wait 3s → RTL → Home
Drone 3: PHC-C → Delivery → Wait 3s → RTL → Home
Drone 4: PHC-D → Delivery → Wait 3s → RTL → Home
Drone 5: PHC-E → Delivery → Wait 3s → RTL → Home

All drones operate independently and simultaneously!

┌─────────────────────────────────────────────────────────────────┐
│                    KEY FEATURES                                  │
└─────────────────────────────────────────────────────────────────┘

✅ Automatic RTL - No manual intervention needed
✅ 3-Second Wait - Realistic delivery simulation
✅ Delivery Notifications - Clear status updates
✅ Task Completion - Firebase updated correctly
✅ Independent Operation - Each drone has own cycle
✅ Backward Compatible - All existing features work
✅ Visual Tracking - Watch entire cycle on map
✅ Console Logging - Full mission visibility

┌─────────────────────────────────────────────────────────────────┐
│                   OPERATOR ACTIONS                               │
└─────────────────────────────────────────────────────────────────┘

Manual Actions Required:
1. Create request (Request Form)
2. Dispatch drone (Dispatch Dashboard)
3. ARM motors (Drone View)
4. Start mission (Drone View)

Automatic Actions:
5. ✈️ Fly to destination
6. 🛬 Land at PHC
7. ⏱️ Wait 3 seconds
8. 🛫 Take off for RTL
9. ✈️ Fly back home
10. 🛬 Land at home
11. ✅ Ready for next mission

┌─────────────────────────────────────────────────────────────────┐
│                    BENEFITS                                      │
└─────────────────────────────────────────────────────────────────┘

🎯 Efficiency - Drones automatically return to base
🔄 Automation - Minimal manual intervention
📊 Tracking - Full visibility of mission cycle
🔒 Safety - Controlled RTL procedure
⚡ Speed - Quick turnaround for next mission
🌐 Scalability - Works with all 5 drones
💾 Persistence - All states saved to Firebase
📱 Real-time - Live updates on all dashboards

---

This is the complete end-to-end mission flow with automatic RTL!
```
