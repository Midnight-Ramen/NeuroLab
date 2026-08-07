export type RobotId = "A" | "B" | "C";

export type FinchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  body: string;
  elapsedMs: number;
};

export type FinchResult =
  | {
      success: true;
      response: FinchResponse;
    }
  | {
      success: false;
      url: string;
      elapsedMs: number;
      error: string;
      response?: FinchResponse;
      detail?: string;
    };

export type FinchDetection = FinchResult & {
  isFinch?: boolean;
};

type RequestOptions = {
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:30061/hummingbird";

export class FinchClient {
  constructor(
    private readonly robot: RobotId = "A",
    private readonly baseUrl = DEFAULT_BASE_URL,
  ) {}

  detect(options?: RequestOptions): Promise<FinchDetection> {
    return this.request(`/in/isFinch/static/${this.robot}`, options).then(
      (result) => {
        if (!result.success) {
          return result;
        }

        return {
          ...result,
          isFinch: parseBlueBirdDetection(result.response.body),
        };
      },
    );
  }

  setBeak(
    red: number,
    green: number,
    blue: number,
    options?: RequestOptions,
  ): Promise<FinchResult> {
    const r = clampColor(red);
    const g = clampColor(green);
    const b = clampColor(blue);
    return this.request(`/out/triled/1/${r}/${g}/${b}/${this.robot}`, options);
  }

  setWheels(
    leftSpeed: number,
    rightSpeed: number,
    options?: RequestOptions,
  ): Promise<FinchResult> {
    const left = clampSpeed(leftSpeed);
    const right = clampSpeed(rightSpeed);
    return this.request(`/out/wheels/${this.robot}/${left}/${right}`, options);
  }

  stopFinch(options?: RequestOptions): Promise<FinchResult> {
    return this.request(`/out/stopFinch/${this.robot}`, options);
  }

  stop(options?: RequestOptions): Promise<FinchResult> {
    return this.request(`/out/stopall/${this.robot}`, options);
  }

  private async request(
    path: string,
    { timeoutMs = 3500 }: RequestOptions = {},
  ): Promise<FinchResult> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const startedAt = performance.now();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.text();

      const finchResponse = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url,
        body,
        elapsedMs: Math.round(performance.now() - startedAt),
      };

      if (response.ok) {
        return {
          success: true,
          response: finchResponse,
        };
      }

      return {
        success: false,
        url,
        elapsedMs: finchResponse.elapsedMs,
        error: `BlueBird answered with HTTP ${response.status}.`,
        response: finchResponse,
      };
    } catch (error) {
      return {
        success: false,
        url,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: explainFetchError(error),
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const FINCH_BASE_URL = DEFAULT_BASE_URL;

function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampSpeed(value: number) {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

function parseBlueBirdDetection(value: string) {
  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "finch"].includes(normalized)) {
    return true;
  }

  if (
    ["false", "0", "no", "null", "undefined", "", "not connected"].includes(
      normalized,
    )
  ) {
    return false;
  }

  return undefined;
}

function explainFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "BlueBird did not answer before the request timed out.";
  }

  if (error instanceof TypeError) {
    return "Chrome blocked the request or BlueBird is not reachable. This is commonly caused by CORS, local-network policy, BlueBird not running, or port 30061 being unavailable.";
  }

  return "The browser could not complete the BlueBird request.";
}
