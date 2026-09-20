export const sceneCatalog = [
  { id: 'strawberry', name: '草莓', category: '商品', emoji: '🍓', accent: '#ff496c', second: '#6dff9d' },
  { id: 'santa', name: '圣诞老人', category: '节庆', emoji: '🎅', accent: '#ff465f', second: '#f7f0e8' },
  { id: 'portrait', name: '人物雕像', category: '人物', emoji: '👤', accent: '#d8cbb8', second: '#bcae99' },
  { id: 'countdown', name: '数字倒计时', category: '数字', emoji: '3', accent: '#28e7ff', second: '#885cff' },
  { id: 'earth', name: '旋转地球', category: '科技', emoji: '🌍', accent: '#21b3ff', second: '#53f9bd' },
  { id: 'gift', name: '圣诞礼盒', category: '节庆', emoji: '🎁', accent: '#ff4f6d', second: '#ffd166' },
  { id: 'rose', name: '玫瑰花', category: '商品', emoji: '🌹', accent: '#ff3864', second: '#ff83ae' },
  { id: 'fireworks', name: '烟花', category: '节庆', emoji: '✦', accent: '#ffd166', second: '#ff5ccf' },
  { id: 'butterfly', name: '蝴蝶', category: '自然', emoji: '🦋', accent: '#24d9ff', second: '#ac70ff' },
  { id: 'astronaut', name: '宇航员', category: '角色', emoji: '👨‍🚀', accent: '#f4f7ff', second: '#2ad4ff' },
  { id: 'energy', name: '炫彩能量球', category: '抽象', emoji: '◉', accent: '#00e0ff', second: '#8c55ff' },
  { id: 'flame', name: '火焰图腾', category: '抽象', emoji: '🔥', accent: '#ff8a00', second: '#ff2d55' },
  { id: 'diamond', name: '旋转钻石', category: '商品', emoji: '💎', accent: '#63e9ff', second: '#ffffff' },
  { id: 'clock', name: '全息时钟', category: '数字', emoji: '◷', accent: '#35e5ff', second: '#4e75ff' },
  { id: 'spectrum', name: '音乐频谱', category: '音频', emoji: '▥', accent: '#4dff9d', second: '#287cff' },
  { id: 'logo', name: '品牌 LOGO', category: '品牌', emoji: '◈', accent: '#ffc857', second: '#ff5f6d' },
  { id: 'text3d', name: '3D 文字', category: '品牌', emoji: 'T', accent: '#34ddff', second: '#a45cff' },
  { id: 'car', name: '跑车', category: '商品', emoji: '🏎', accent: '#ff4757', second: '#d7e3ff' },
  { id: 'particles', name: '粒子头像', category: '人物', emoji: '✺', accent: '#5ce1e6', second: '#9c6cff' },
  { id: 'custom', name: '自定义模型', category: '我的', emoji: '+', accent: '#68758b', second: '#b6c5d8' },
] as const

export type SceneId = (typeof sceneCatalog)[number]['id']

export type SceneItem = Omit<(typeof sceneCatalog)[number], 'id'> & {
  id: SceneId
}
