import type { DeviceApi } from '../../shared/device'
import type { ProjectApi } from '../../shared/project'

declare global {
  interface Window {
    fan360?: {
      device: DeviceApi
      project: ProjectApi
    }
  }
}

export {}
