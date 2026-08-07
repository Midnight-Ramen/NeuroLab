import { Neurosity, type DeviceInfo, type DeviceStatus } from "@neurosity/sdk";
import type { Subscription } from "rxjs";

export type NeurosityCredentials = {
  email: string;
  password: string;
  deviceSelector?: string;
};

export type NeurositySnapshot = {
  focus?: number;
  signalQuality?: number;
  status?: DeviceStatus;
  device?: DeviceInfo;
};

export type NeurosityHandlers = {
  onSnapshot: (snapshot: NeurositySnapshot) => void;
  onError: (message: string) => void;
};

export class NeurosityClient {
  private neurosity: Neurosity | null = null;
  private subscriptions: Subscription[] = [];

  async connect(credentials: NeurosityCredentials, handlers: NeurosityHandlers) {
    await this.disconnect();

    const neurosity = new Neurosity({ autoSelectDevice: false });
    this.neurosity = neurosity;

    await neurosity.login({
      email: credentials.email,
      password: credentials.password,
    });

    const device = await this.selectDevice(neurosity, credentials.deviceSelector);
    handlers.onSnapshot({ device });

    this.subscriptions = [
      neurosity.status().subscribe({
        next: (status) => handlers.onSnapshot({ status }),
        error: (error) => handlers.onError(readError(error)),
      }),
      neurosity.signalQualityV2().subscribe({
        next: (quality) =>
          handlers.onSnapshot({ signalQuality: quality.overall.score }),
        error: (error) => handlers.onError(readError(error)),
      }),
      neurosity.focus().subscribe({
        next: ({ probability }) => handlers.onSnapshot({ focus: probability }),
        error: (error) => handlers.onError(readError(error)),
      }),
    ];

    return device;
  }

  async disconnect() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }

    this.subscriptions = [];

    if (!this.neurosity) {
      return;
    }

    const neurosity = this.neurosity;
    this.neurosity = null;
    await neurosity.disconnect().catch(() => undefined);
    await neurosity.logout().catch(() => undefined);
  }

  private async selectDevice(neurosity: Neurosity, selector?: string) {
    const query = selector?.trim().toLowerCase();

    return neurosity.selectDevice((devices) => {
      if (!query) {
        return devices[0];
      }

      return (
        devices.find((device) => device.deviceId.toLowerCase() === query) ??
        devices.find((device) =>
          device.deviceNickname?.toLowerCase().includes(query),
        ) ??
        devices[0]
      );
    });
  }
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
