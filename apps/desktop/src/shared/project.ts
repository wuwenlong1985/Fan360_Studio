export type ProjectDocument = {
  version: 1
  savedAt: string
  selectedSceneId: string
  playing: boolean
  speed: number
  brightness: number
  cameraAngle: number
  timeline: number
  viewMode: string
  quality: string
  deviceIp: string
  layout: {
    left: boolean
    right: boolean
    bottom: boolean
    circle: boolean
  }
}

export type ProjectFileResult = {
  ok: boolean
  path?: string
  document?: ProjectDocument
  message: string
}

export type ProjectApi = {
  save: (document: ProjectDocument) => Promise<ProjectFileResult>
  load: () => Promise<ProjectFileResult>
}

export const PROJECT_CHANNELS = {
  save: 'project:file:save',
  load: 'project:file:load',
} as const
