# NeuroFinch BlueBird Browser Test

This is the first milestone for the NeuroFinch idea: prove that a browser app can talk to BirdBrain BlueBird Connector on the student's own computer.

The app is intentionally client-only. Vercel can host the files, but all Finch commands are sent from Chrome directly to:

```text
http://127.0.0.1:30061/hummingbird
```

## Test Setup

1. Install and open BlueBird Connector on the Windows machine.
2. Connect Finch 2.0 as robot `A`.
3. Open this web app in Chrome.
4. Click `Detect`.
5. Try `Red`, `Green`, `Blue`, and `Stop`.

If the deployed site cannot reach BlueBird but a local preview can, the likely issue is Chrome local network/CORS handling for a public HTTPS page calling a localhost HTTP service.

## Multi-Finch Station Setup

When several Finches are in the same room, label each robot and laptop before students connect in BlueBird.

Example robot label:

```text
FINCH 07
Bluetooth: ABC#FN7K29P
Assigned Station: 7
```

Put the same label on the laptop:

```text
STATION 7
FINCH 07
ABC#FN7K29P
```

Student instruction:

```text
In BlueBird, connect only to the Finch whose code matches the sticker on your computer.
```

NeuroLab includes a startup wizard for this:

1. Detect BlueBird.
2. Detect the connected Finch A/B/C.
3. Identify the Finch without driving it.
4. Confirm that the flashing Finch is yours.

The Identify step turns the beak and tail purple, prints the station label on the micro:bit display, and plays two short notes. If the wrong robot flashes, disconnect that robot in BlueBird and connect the Finch whose Bluetooth name matches the station sticker.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Current Scope

- BlueBird health probe with the Finch `isFinch` endpoint.
- Finch beak controls through tri-LED port 1.
- Stop-all command.
- Fixed emergency stop control.
- Safe Finch wheel pulses with capped speeds and automatic stop.
- Focus simulator that maps a mock focus value to the Finch beak.
- Optional focus-driven wheel control for supervised testing.
- Robot selector for `A`, `B`, or `C`.
- Diagnostics that preserve the raw response/error for classroom testing.

Neurosity integration should come after this hardware bridge test succeeds on the real school-managed Chrome setup.

## Experiment 01

The focus simulator is a rehearsal for the eventual Neurosity integration.

- `Manual` lets a student drag the focus slider.
- `Sweep` automatically moves the focus value up and down.
- `Run` maps focus above the threshold to a green beak and focus below the threshold to a red/orange beak.
- `Drive` optionally maps high focus to slow forward movement. Keep this supervised and use the fixed `STOP` button at any time.
