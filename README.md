# Fan360 Studio

裸眼 3D 旋转风扇桌面应用。技术方案和 UI 方向已确认，正式 Electron 工程已经启动。

## 当前已完成的评审材料

- [技术方案](docs/technical-design.md)
  - Electron/React/Ant Design/Three.js 架构
  - 1000 rpm、1.0°、80 LED、4 B/LED 的时序和数据率计算
  - 360 组角度片和 `.fan360` 传输格式建议
  - 单页风扇裸眼 3D 的物理边界
  - 默认 20 个 3D 场景清单
- [UI 设计方案](docs/ui-design.md)
  - 主工作台布局
  - 场景库、3D 编辑器、参数检查器、时间轴、设备仿真和数据预览
  - Ant Design 组件映射和验收标准
- [开发任务清单](docs/development-plan.md)
  - M0 到 M9 里程碑
  - 每项任务的验收证据
  - 推荐执行顺序

## 可运行 UI 原型

原型目录：

```text
prototype/ui
```

启动：

```powershell
cd C:\Users\Administrator\Desktop\deepseek\prototype\ui
npm install
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:5173/
```

构建：

```powershell
npm run build
```

原型的用途是确认界面布局和交互方向，不是完整产品。正式桌面应用位于 `apps/desktop`。

## 重要技术结论

- 1000 rpm 对应 60 ms/圈，每个 1° 角度片只有 166.67 µs。
- 单角度片数据为 80 × 4 = 320 B。
- 单圈原始数据为 360 × 320 = 115,200 B。
- 单圈原始链路需求为 1.92 MB/s，约 15.36 Mbps。
- 设备通信采用 TCP；用户输入 IP，端口固定为 5000，手动点击连接。
- 同步 3D 数据期间暂停设备显示刷新；整帧传输、校验完成后再恢复。
- 当前版本不实现“一边同步、一边显示”，该问题留作后续优化。
- 单页风扇不是真多视角体三维。本项目应定位为“高质量裸眼 3D 错觉”，并通过真实设备圆盘预览管理预期。




## 正式桌面应用

开发启动：

```powershell
cd C:\Users\Administrator\Desktop\deepseek
npm install
npm run dev
```

类型检查、测试和构建：

```powershell
npm run typecheck
npm test
npm run build
```

当前已完成：

- Electron + electron-vite + React + TypeScript 工程
- Ant Design 深色工作台
- 大正方形 3D 视口
- 圆形设备显示区域遮罩和开关
- 左栏、右栏、下方预览独立显示/隐藏
- 安全 preload 和类型化 IPC
- TCP IP 输入、固定端口 5000、手动连接/断开
- 真实 Electron Renderer 到 Main Process 的 TCP 连接验证
- 360×80×4B 帧模型、336B 角度片、CRC32 和 .fan360 文件格式
- 3D RenderTarget 到 360×80 极坐标帧的真实采样
- 真实极坐标数据驱动设备圆盘预览和数据矩阵
- TCP SYNC_BEGIN → 360 包数据 → SYNC_COMMIT → SYNC_ACK → PLAY 协议
- 模拟设备整帧重建和 CRC 校验
- 核心数据与协议层 14 个单元测试
