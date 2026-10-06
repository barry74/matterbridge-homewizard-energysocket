import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  onOffPlugInUnit,
  electricalSensor,
  bridgedNode,
  powerSource,
  type PlatformConfig,
  type PlatformMatterbridge,
} from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement, OnOff } from 'matterbridge/matter/clusters';

type SocketConfig = { name: string; ip: string };
type PluginConfig = PlatformConfig & { sockets?: SocketConfig[]; pollSeconds?: number };

type DataResponse = {
  active_power_w?: number;
  active_power_l1_w?: number;
  total_power_import_t1_kwh?: number;
};

type StateResponse = { power_on?: boolean };

export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PluginConfig) {
  return new HomeWizardEnergySocketPlatform(matterbridge, log, config);
}

export class HomeWizardEnergySocketPlatform extends MatterbridgeDynamicPlatform {
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, override config: PluginConfig) {
    super(matterbridge, log, config);
  }

  override async onStart(): Promise<void> {
    await this.ready;
    const sockets = this.config.sockets ?? [];
    if (sockets.length === 0) {
      this.log.error('Geen sockets in de config. Voeg sockets toe met name en ip.');
      return;
    }
    for (const socket of sockets) {
      await this.addSocket(socket);
    }
  }

  override async onShutdown(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
  }

  private async addSocket(socket: SocketConfig): Promise<void> {
    const base = `http://${socket.ip}`;
    const endpoint = new MatterbridgeEndpoint(
      [onOffPlugInUnit, electricalSensor, bridgedNode, powerSource],
      { id: socket.ip },
      this.config.debug,
    )
      .createDefaultIdentifyClusterServer()
      .createDefaultElectricalEnergyMeasurementClusterServer(0, 0)
      .createDefaultElectricalPowerMeasurementClusterServer(230_000, 0, 0, 50_000)
      .createDefaultBridgedDeviceBasicInformationClusterServer(socket.name, socket.ip, 0xfff1, 'HomeWizard', 'HWE-SKT')
      .createDefaultOnOffClusterServer()
      .createDefaultPowerSourceWiredClusterServer()
      .addRequiredClusterServers();

    const device = await this.addDevice(endpoint);
    device.addCommandHandler('on', async () => {
      await this.setPower(base, true);
      await device.setAttribute(OnOff.id, 'onOff', true, device.log);
    });
    device.addCommandHandler('off', async () => {
      await this.setPower(base, false);
      await device.setAttribute(OnOff.id, 'onOff', false, device.log);
    });

    const poll = async () => {
      try {
        const state = await this.getJson<StateResponse>(`${base}/api/v1/state`);
        const data = await this.getJson<DataResponse>(`${base}/api/v1/data`);
        const watts = data.active_power_w ?? data.active_power_l1_w ?? 0;
        await device.setAttribute(OnOff.id, 'onOff', state.power_on === true, device.log);
        await device.setAttribute(ElectricalPowerMeasurement.id, 'voltage', 230_000, device.log);
        await device.setAttribute(ElectricalPowerMeasurement.id, 'activeCurrent', Math.round((watts / 230) * 1000), device.log);
        await device.setAttribute(ElectricalPowerMeasurement.id, 'activePower', Math.round(watts * 1000), device.log);
        if (data.total_power_import_t1_kwh !== undefined) {
          await device.setAttribute(
            ElectricalEnergyMeasurement.id,
            'cumulativeEnergyImported',
            { energy: Math.round(data.total_power_import_t1_kwh * 1_000_000) },
            device.log,
          );
        }
        this.log.info(`${socket.name}: ${watts} W`);
      } catch (error) {
        this.log.warn(`${socket.name}: meting mislukt: ${error}`);
      }
    };

    await poll();
    this.timers.push(setInterval(() => void poll(), (this.config.pollSeconds ?? 5) * 1000));
    this.log.info(`${socket.name} gepubliceerd op ${base}`);
  }

  private async setPower(base: string, on: boolean): Promise<void> {
    const response = await fetch(`${base}/api/v1/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ power_on: on }),
    });
    if (!response.ok) throw new Error(`state ${response.status}`);
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return (await response.json()) as T;
  }
}
