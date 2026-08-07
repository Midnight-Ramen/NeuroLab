import {
  Activity,
  CircleStop,
  FlaskConical,
  Lightbulb,
  PlugZap,
  RadioTower,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

  const finch = useMemo(() => new FinchClient(robot, baseUrl), [baseUrl, robot]);

  useEffect(() => {
    const stopOnExit = () => {
      void finch.stop({ timeoutMs: 750 });
    };

    window.addEventListener("pagehide", stopOnExit);
    return () => window.removeEventListener("pagehide", stopOnExit);
  }, [finch]);

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

  const statusCopy = getStatusCopy(state, isFinch);

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <FlaskConical size={16} aria-hidden="true" />
            NeuroFinch Lab
          </p>
          <h1>Browser to BlueBird Finch test</h1>
          <p>
            A first-pass classroom console for proving that Chrome can reach
            BlueBird Connector on localhost before adding Neurosity signals.
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
