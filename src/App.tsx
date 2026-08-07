import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleStop,
  FlaskConical,
  Gauge,
  Lightbulb,
  Pause,
  PlugZap,
  Play,
  RadioTower,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FinchClient,
  FINCH_BASE_URL,
  type FinchDetection,
  type FinchResult,
  type RobotId,
} from "./finch/FinchClient";

type ConnectionState = "idle" | "checking" | "connected" | "blocked" | "failed";

type LogEntry = {
  id: string;
  label: string;
  tone: "good" | "warn" | "bad";
  detail: string;
  timestamp: string;
};

const colorCommands = [
  { label: "Red", color: [255, 0, 0], className: "red" },
  { label: "Green", color: [0, 255, 0], className: "green" },
  { label: "Blue", color: [0, 40, 255], className: "blue" },
  { label: "Off", color: [0, 0, 0], className: "dark" },
] as const;

const movementCommands = [
  { label: "Forward", icon: ArrowUp, left: 32, right: 32 },
  { label: "Left", icon: ArrowLeft, left: -26, right: 26 },
  { label: "Right", icon: ArrowRight, left: 26, right: -26 },
  { label: "Back", icon: ArrowDown, left: -26, right: -26 },
] as const;

const COMMAND_COOLDOWN_MS = 260;
const MOVEMENT_PULSE_MS = 650;

function nowLabel() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export function App() {
  const [robot, setRobot] = useState<RobotId>("A");
  const [baseUrl, setBaseUrl] = useState(FINCH_BASE_URL);
  const [state, setState] = useState<ConnectionState>("idle");
  const [isFinch, setIsFinch] = useState<boolean | undefined>();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FinchResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [focus, setFocus] = useState(0.58);
  const [threshold, setThreshold] = useState(0.7);
  const [experimentRunning, setExperimentRunning] = useState(false);
  const [driveWithFocus, setDriveWithFocus] = useState(false);
  const [experimentMode, setExperimentMode] = useState<"manual" | "sweep">(
    "manual",
  );
  const lastCommandAtRef = useRef(0);
  const movementStopRef = useRef<number | null>(null);
  const experimentLastFocusRef = useRef<number | null>(null);

  const finch = useMemo(() => new FinchClient(robot, baseUrl), [baseUrl, robot]);

  useEffect(() => {
    const stopOnExit = () => {
      void finch.stop({ timeoutMs: 750 });
    };

    window.addEventListener("pagehide", stopOnExit);
    return () => window.removeEventListener("pagehide", stopOnExit);
  }, [finch]);

  useEffect(() => {
    if (!experimentRunning || experimentMode !== "sweep") {
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const wave = (Math.sin(elapsed * 1.35) + 1) / 2;
      setFocus(Number((0.25 + wave * 0.65).toFixed(2)));
    }, 650);

    return () => window.clearInterval(interval);
  }, [experimentMode, experimentRunning]);

  useEffect(() => {
    if (!experimentRunning || state !== "connected") {
      return;
    }

    const previousFocus = experimentLastFocusRef.current;

    if (previousFocus !== null && Math.abs(previousFocus - focus) < 0.04) {
      return;
    }

    experimentLastFocusRef.current = focus;
    void applyFocusExperiment(focus);
  }, [experimentRunning, focus, state]);

  const addLog = (
    label: string,
    tone: LogEntry["tone"],
    detail: string,
  ) => {
    setLog((items) =>
      [
        {
          id: crypto.randomUUID(),
          label,
          tone,
          detail,
          timestamp: nowLabel(),
        },
        ...items,
      ].slice(0, 8),
    );
  };

  const runDetect = async () => {
    setBusyLabel("Detect");
    setState("checking");

    const result = await finch.detect();
    setLastResult(result);

    if (result.success && result.isFinch === true) {
      setIsFinch(true);
      setState("connected");
      addLog(
        "Detect",
        "good",
        `BlueBird answered in ${result.response.elapsedMs} ms for robot ${robot}.`,
      );
      setBusyLabel(null);
      return;
    }

    if (result.success) {
      const selectedResponseBody = result.response.body;
      const foundRobot = await findConnectedFinch(robot, baseUrl);

      if (foundRobot) {
        setRobot(foundRobot.robot);
        setIsFinch(true);
        setState("connected");
        setLastResult(foundRobot.result);
        addLog(
          "Detect",
          "good",
          `BlueBird found a Finch on robot ${foundRobot.robot}; the selector was updated.`,
        );
      } else {
        setIsFinch(false);
        setState("failed");
        addLog(
          "Detect",
          "warn",
          `BlueBird answered, but no Finch was connected on A, B, or C. Response for ${robot}: ${selectedResponseBody || "(empty)"}.`,
        );
      }
    } else {
      setIsFinch(undefined);
      setState(result.error.includes("blocked") ? "blocked" : "failed");
      addLog("Detect", "bad", result.error);
    }

    setBusyLabel(null);
  };

  const runCommand = async (
    label: string,
    command: () => Promise<FinchResult>,
  ) => {
    if (!canSendCommand()) {
      addLog(label, "warn", "Command skipped to avoid sending commands too quickly.");
      return;
    }

    setBusyLabel(label);
    const result = await command();
    setLastResult(result);

    if (result.success) {
      setState("connected");
      addLog(label, "good", `Command completed in ${result.response.elapsedMs} ms.`);
    } else {
      setState(result.error.includes("blocked") ? "blocked" : "failed");
      addLog(label, "bad", result.error);
    }

    setBusyLabel(null);
  };

  const runEmergencyStop = async () => {
    setExperimentRunning(false);
    clearPendingMovementStop();
    await runCommand("Emergency stop", () => finch.stop());
  };

  const runMovementPulse = async (label: string, left: number, right: number) => {
    clearPendingMovementStop();
    await runCommand(label, () => finch.setWheels(left, right));
    movementStopRef.current = window.setTimeout(() => {
      void runCommand("Auto stop", () => finch.stopFinch({ timeoutMs: 1000 }));
    }, MOVEMENT_PULSE_MS);
  };

  const applyFocusExperiment = async (value: number) => {
    const focused = value >= threshold;
    const intensity = Math.round(value * 255);
    const beak = focused
      ? [0, Math.max(90, intensity), 30]
      : [Math.max(90, 255 - intensity), 20, 0];

    await runCommand("Focus signal", () => finch.setBeak(beak[0], beak[1], beak[2]));

    if (driveWithFocus) {
      const speed = focused ? Math.min(42, Math.round(value * 44)) : 0;
      await runCommand("Focus drive", () =>
        speed > 0 ? finch.setWheels(speed, speed) : finch.stopFinch(),
      );
    }
  };

  const canSendCommand = () => {
    const now = Date.now();

    if (now - lastCommandAtRef.current < COMMAND_COOLDOWN_MS) {
      return false;
    }

    lastCommandAtRef.current = now;
    return true;
  };

  const clearPendingMovementStop = () => {
    if (movementStopRef.current === null) {
      return;
    }

    window.clearTimeout(movementStopRef.current);
    movementStopRef.current = null;
  };

  const statusCopy = getStatusCopy(state, isFinch);
  const focusPercent = Math.round(focus * 100);

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <FlaskConical size={16} aria-hidden="true" />
            NeuroFinch Lab
          </p>
          <h1>NeuroLab Finch control</h1>
          <p>
            A classroom-ready bridge for testing Finch commands today and
            rehearsing brain-signal experiments before adding Neurosity.
          </p>
        </div>

        <div className="signal-map" aria-label="Connection path">
          <PathNode label="Chrome" active={state !== "idle"} />
          <div className="path-line" />
          <PathNode label="BlueBird" active={state === "connected"} />
          <div className="path-line" />
          <PathNode label={`Finch ${robot}`} active={isFinch === true} />
        </div>
      </section>

      <button
        className="emergency-stop"
        onClick={runEmergencyStop}
        disabled={busyLabel !== null}
        title="Immediately stop Finch outputs"
      >
        <CircleStop size={22} aria-hidden="true" />
        STOP
      </button>

      <section className="workspace">
        <div className="control-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Hardware Bridge</p>
              <h2>Finch control</h2>
            </div>
            <StatusBadge state={state} label={statusCopy.label} />
          </div>

          <div className="field-grid">
            <label>
              Robot
              <select
                value={robot}
                onChange={(event) => {
                  setRobot(event.target.value as RobotId);
                  setState("idle");
                  setIsFinch(undefined);
                }}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>

            <label>
              BlueBird URL
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="button-row">
            <button
              className="primary"
              onClick={runDetect}
              disabled={busyLabel !== null}
              title="Check whether BlueBird can see the selected Finch"
            >
              <RadioTower size={18} aria-hidden="true" />
              Detect
            </button>
            <button
              onClick={() =>
                runCommand("Reset", () => finch.setBeak(0, 0, 0))
              }
              disabled={busyLabel !== null}
              title="Turn the Finch beak off"
            >
              <RotateCcw size={18} aria-hidden="true" />
              Reset
            </button>
            <button
              className="danger"
              onClick={() => runCommand("Stop", () => finch.stop())}
              disabled={busyLabel !== null}
              title="Send BlueBird's stop-all command"
            >
              <CircleStop size={18} aria-hidden="true" />
              Stop
            </button>
          </div>

          <div className="movement-panel">
            <div>
              <p className="section-kicker">Safe Motion</p>
              <h2>Short movement pulses</h2>
            </div>
            <div className="movement-grid" aria-label="Finch movement controls">
              {movementCommands.map(({ label, icon: Icon, left, right }) => (
                <button
                  key={label}
                  className={`move-button ${label.toLowerCase()}`}
                  onClick={() => runMovementPulse(label, left, right)}
                  disabled={busyLabel !== null || state !== "connected"}
                  title={`${label} for ${MOVEMENT_PULSE_MS} milliseconds`}
                >
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="color-grid" aria-label="Beak color controls">
            {colorCommands.map(({ label, color, className }) => (
              <button
                key={label}
                className={`color-button ${className}`}
                onClick={() =>
                  runCommand(label, () =>
                    finch.setBeak(color[0], color[1], color[2]),
                  )
                }
                disabled={busyLabel !== null}
                title={`Set Finch ${robot} beak to ${label.toLowerCase()}`}
              >
                <Lightbulb size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <aside className="diagnostics">
          <div className="diagnostic-card">
            <div className="diagnostic-icon">
              <PlugZap size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="section-kicker">Status</p>
              <h2>{statusCopy.label}</h2>
              <p>{statusCopy.detail}</p>
            </div>
          </div>

          <div className="diagnostic-card caution">
            <div className="diagnostic-icon">
              <ShieldAlert size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="section-kicker">Safety</p>
              <h2>Stop stays visible</h2>
              <p>
                Use `Stop` any time a test behaves unexpectedly. The app also
                sends a best-effort stop command when the page closes.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="experiment-band">
        <div className="experiment-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Experiment 01</p>
              <h2>Focus simulator</h2>
            </div>
            <span className={experimentRunning ? "status connected" : "status idle"}>
              {experimentRunning ? "Running" : "Paused"}
            </span>
          </div>

          <div className="focus-meter" aria-label="Simulated focus meter">
            <div className="focus-value">
              <Gauge size={24} aria-hidden="true" />
              <strong>{focus.toFixed(2)}</strong>
              <span>{focusPercent}%</span>
            </div>
            <div className="meter-track">
              <div style={{ width: `${focusPercent}%` }} />
              <span style={{ left: `${threshold * 100}%` }} />
            </div>
          </div>

          <div className="experiment-controls">
            <label>
              Focus
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={focus}
                onChange={(event) => setFocus(Number(event.target.value))}
                disabled={experimentMode === "sweep" && experimentRunning}
              />
            </label>
            <label>
              Threshold
              <input
                type="range"
                min="0.35"
                max="0.95"
                step="0.01"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="experiment-actions">
            <button
              className={experimentRunning ? "danger" : "primary"}
              onClick={() => {
                setExperimentRunning((running) => !running);
                experimentLastFocusRef.current = null;
              }}
              disabled={state !== "connected" || busyLabel !== null}
              title="Start or pause the focus-to-Finch experiment"
            >
              {experimentRunning ? (
                <Pause size={18} aria-hidden="true" />
              ) : (
                <Play size={18} aria-hidden="true" />
              )}
              {experimentRunning ? "Pause" : "Run"}
            </button>
            <button
              onClick={() =>
                setExperimentMode((mode) =>
                  mode === "manual" ? "sweep" : "manual",
                )
              }
              disabled={busyLabel !== null}
              title="Toggle manual focus control or automatic sweep"
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              {experimentMode === "manual" ? "Manual" : "Sweep"}
            </button>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={driveWithFocus}
                onChange={(event) => setDriveWithFocus(event.target.checked)}
              />
              Drive
            </label>
          </div>
        </div>

        <div className="student-code">
          <p className="section-kicker">Student API Shape</p>
          <h2>Next coding layer</h2>
          <pre>{`brain.onFocus((focus) => {
  if (focus > ${threshold.toFixed(2)}) {
    finch.beak("green");
  } else {
    finch.beak("red");
  }
});`}</pre>
        </div>
      </section>

      <section className="data-band">
        <div className="log-panel">
          <div className="panel-header compact">
            <div>
              <p className="section-kicker">Diagnostics</p>
              <h2>Activity</h2>
            </div>
            {busyLabel ? <span className="busy">{busyLabel}...</span> : null}
          </div>

          {log.length === 0 ? (
            <p className="empty-log">
              Run `Detect` first, then try a beak color if BlueBird answers.
            </p>
          ) : (
            <ol className="event-log">
              {log.map((item) => (
                <li key={item.id} className={item.tone}>
                  <span>{item.timestamp}</span>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="raw-panel">
          <div className="panel-header compact">
            <div>
              <p className="section-kicker">Raw Response</p>
              <h2>Last request</h2>
            </div>
            <Activity size={20} aria-hidden="true" />
          </div>
          <pre>{formatResult(lastResult)}</pre>
        </div>
      </section>
    </main>
  );
}

async function findConnectedFinch(currentRobot: RobotId, baseUrl: string) {
  const robots: RobotId[] = ["A", "B", "C"];
  const candidates = robots.filter((candidate) => candidate !== currentRobot);

  for (const candidate of candidates) {
    const client = new FinchClient(candidate, baseUrl);
    const result = await client.detect();

    if (result.success && result.isFinch === true) {
      return { robot: candidate, result };
    }
  }

  return null;
}

function PathNode({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={active ? "path-node active" : "path-node"}>
      <span />
      {label}
    </div>
  );
}

function StatusBadge({
  state,
  label,
}: {
  state: ConnectionState;
  label: string;
}) {
  return <span className={`status ${state}`}>{label}</span>;
}

function getStatusCopy(state: ConnectionState, isFinch?: boolean) {
  if (state === "checking") {
    return {
      label: "Checking",
      detail: "Chrome is waiting for BlueBird Connector to answer.",
    };
  }

  if (state === "connected" && isFinch !== false) {
    return {
      label: "Detected",
      detail: "BlueBird answered. Try a beak color and watch the Finch.",
    };
  }

  if (state === "blocked") {
    return {
      label: "Blocked",
      detail:
        "Chrome could not complete the localhost request. Test locally and from the deployed page to separate BlueBird setup from browser policy.",
    };
  }

  if (state === "failed") {
    return {
      label: "Needs attention",
      detail:
        "Check that BlueBird Connector is open, Finch is connected as the selected robot, and port 30061 is available.",
    };
  }

  return {
    label: "Ready",
    detail: "Connect BlueBird and Finch, then run the detection probe.",
  };
}

function formatResult(result: FinchResult | null) {
  if (!result) {
    return "No request yet.";
  }

  if (result.success) {
    return JSON.stringify(
      {
        ok: result.response.ok,
        status: result.response.status,
        elapsedMs: result.response.elapsedMs,
        url: result.response.url,
        body: result.response.body || "(empty)",
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      ok: false,
      elapsedMs: result.elapsedMs,
      url: result.url,
      error: result.error,
      detail: result.detail,
    },
    null,
    2,
  );
}
