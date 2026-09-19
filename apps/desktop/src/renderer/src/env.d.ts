import type { DeviceApi } from '../../shared/device'

declare global {
  interface Window {
    fan360?: {
      device: DeviceApi
    }
  }
}

export {}
