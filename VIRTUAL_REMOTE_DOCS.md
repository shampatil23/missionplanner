# 🎮 Virtual Remote Control System

## Feature Overview

**New Feature**: Comprehensive Virtual Cockpit for Manual Drone Control

### What It Is
A fully functional, on-screen remote control interface that simulates a physical drone controller. It allows for precise manual maneuvering of any drone in the fleet.

### Key Components

1.  **System Controls**
    - **START/STOP**: One-click Arm/Disarm toggle with safety checks.
    - **LAND**: Immediate emergency landing command.

2.  **Mode Selectors**
    - **LOITER**: Holds current position and altitude.
    - **AUTO**: Engages autonomous mission mode.
    - **RTL**: Return to Launch (Home).

3.  **Dual Virtual Joysticks**
    - **Left Stick (Throttle/Yaw)**: 
      - Up/Down: Change Altitude (+/- 2m)
      - Left/Right: Rotate Heading (+/- 10 deg)
    - **Right Stick (Pitch/Roll)**: 
      - Up/Down: Move Forward/Backward (~10m)
      - Left/Right: Strafe Left/Right (~10m)

4.  **Extra Actions**
    - **PRE-FLIGHT**: Runs diagnostic checks.
    - **HOLD POS**: Switches to GUIDED mode to hold position.

## Technical Implementation

### Manual Logic (`handleManualControl`)
- **Override behavior**: If drone is in AUTO/RTL, manual input automatically switches it to GUIDED mode.
- **Physics**: Updates `lat`, `lng`, `alt`, and `heading` relative to the drone's current orientation.
- **Telemetry**: Instantly updates global telemetry state for smooth map feedback.

### Safety Features
- **Arming Checks**: Cannot arm without pre-flight checks or healthy status.
- **Flight Prevention**: Manual controls disabled if motors are disarmed.
- **RTL Cancellation**: Any manual input cancels an active RTL and gives control back to the pilot.

## How to Use

1.  **Select a Drone** from the fleet list.
2.  **Click START** to arm motors (if ready).
3.  **Use Joysticks** to fly manually:
    - Click `^` on Left Stick to take off/ascend.
    - Click `^` on Right Stick to fly forward.
4.  **Switch Modes** using the mode buttons as needed.
5.  **Click LAND** to auto-land at current position.

## Integration
- Replaced the basic "FLIGHT ACTIONS" grid.
- Located in the "Drone View" sidebar for easy access.
- Fully compatible with the existing multi-drone physics engine.

---
**Status**: Implemented & Ready for Testing
