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
- Robot selector for `A`, `B`, or `C`.
- Diagnostics that preserve the raw response/error for classroom testing.

Neurosity integration should come after this hardware bridge test succeeds on the real school-managed Chrome setup.
