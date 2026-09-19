import type { ProjectApi, ProjectDocument } from '../../../shared/project'

const fallback: ProjectApi = {
  save: async () => ({ ok: false, message: '浏览器预览模式无法保存项目文件' }),
  load: async () => ({ ok: false, message: '浏览器预览模式无法打开项目文件' }),
}

export const projectApi = window.fan360?.project ?? fallback
export type { ProjectDocument }
