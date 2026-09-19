# Fan360 TCP 设备协议 v2

## 1. 连接参数

- 传输层：TCP
- 设备地址：由用户在桌面程序中输入
- 端口：固定 `5000`
- 连接方式：用户手动点击“连接设备”
- 字节序：小端序 Little Endian
- 显示规格：360 角度片 × 80 LED × 4 B/LED
- 单角度片原始数据：320 B
- 单帧原始数据：115,200 B
- 单个角度片传输包：336 B
- 单帧数据包流：360 × 336 = 120,960 B

## 2. 控制消息信封

所有控制消息使用固定 16 B 头、可变长度 payload 和 4 B CRC32。

| 偏移 | 长度 | 字段 | 说明 |
|---:|---:|---|---|
| 0 | 4 | Magic | `0x30363346`，对应字节 `46 33 36 30` |
| 4 | 2 | Version | 当前为 `2` |
| 6 | 2 | Type | 消息类型 |
| 8 | 4 | Sequence | 同步序号 |
| 12 | 4 | PayloadLength | payload 字节数 |
| 16 | N | Payload | 消息数据 |
| 16+N | 4 | CRC32 | 对 `[0, 16+N)` 计算 IEEE CRC32 |

总长度：

```text
16 + PayloadLength + 4
```

## 3. 控制消息类型

| 值 | 名称 | 方向 | 说明 |
|---:|---|---|---|
| 1 | HELLO | App → Device | 握手和能力协商 |
| 2 | SYNC_BEGIN | App → Device | 开始同步，设备暂停显示刷新 |
| 3 | SYNC_COMMIT | App → Device | 数据结束，要求设备校验并提交 |
| 4 | SYNC_ACK | Device → App | 返回同步结果 |
| 5 | SYNC_ABORT | App → Device | 中止当前同步 |
| 6 | PLAY | App → Device | 从已提交缓冲区恢复显示 |
| 7 | STOP | App → Device | 停止显示 |

## 4. SYNC_BEGIN Payload

固定 24 B：

| 偏移 | 长度 | 字段 | 说明 |
|---:|---:|---|---|
| 0 | 2 | frameCount | 本次同步帧数，1 到 255 |
| 2 | 2 | reserved | 必须为 0 |
| 4 | 4 | frameBytes | 单帧原始字节数，115200 |
| 8 | 2 | sectorPacketBytes | 单角度片传输包大小，336 |
| 10 | 2 | holdRevolutions | 每帧保持显示的旋转圈数，最小 1 |
| 12 | 4 | payloadCrc32 | 多帧原始数据连续拼接后的 CRC32 |
| 16 | 4 | totalPacketBytes | 数据包流总字节数 = frameCount × 120960 |
| 20 | 4 | fpsMilli | 源动画帧率 × 1000 |

## 5. 角度片数据包

`SYNC_BEGIN` 后，App 按帧连续发送数据。每帧包含 360 个固定 336 B 数据包，按角度 0 到 359 排列；多帧之间直接连续排列。

| 偏移 | 长度 | 字段 | 说明 |
|---:|---:|---|---|
| 0 | 2 | Magic | `0xF360` |
| 2 | 1 | Version | `1` |
| 3 | 1 | Type | `1` = angle data |
| 4 | 2 | AngleIndex | 0 到 359 |
| 6 | 2 | Sequence | 数据包序号 |
| 8 | 2 | Flags | bit0 表示一个完整同步帧 |
| 10 | 2 | PayloadLength | 固定 320 |
| 12 | 320 | LED Data | 80 个 LED |
| 332 | 4 | CRC32 | 对前 332 B 计算 CRC32 |

每个 LED 固定 4 B，顺序为：

```text
[亮度, R, G, B]
```

## 6. SYNC_ACK Payload

固定 4 B：

| 偏移 | 长度 | 字段 | 说明 |
|---:|---:|---|---|
| 0 | 1 | Accepted | `1` 成功，`0` 失败 |
| 1 | 1 | ErrorCode | 设备错误码 |
| 2 | 2 | reserved | 必须为 0 |

设备收到 `SYNC_COMMIT` 后必须：

1. 检查数据包数量是否为 360。
2. 检查每个角度包的 AngleIndex、长度和 CRC32。
3. 从 360 个数据包中重建 115,200 B 原始帧。
4. 计算重建帧 CRC32。
5. 与 `SYNC_BEGIN.payloadCrc32` 比较。
6. 校验成功后，把数据原子切换到显示缓冲区。
7. 返回 Accepted=1 的 `SYNC_ACK`。
8. 等待 App 的 `PLAY`，或根据配置自动恢复显示。

## 7. 完整同步状态机

```text
App                                      Device
 |                                          |
 |---------------- HELLO ------------------>|
 |<--------------- SYNC_ACK ----------------|
 |                                          |
 |------------- SYNC_BEGIN ---------------->|
 |            Device pauses display          |
 |                                          |
 |--------- 360 × 336 B data -------------->|
 |                                          |
 |------------- SYNC_COMMIT --------------->|
 |                          Verify CRC/length|
 |                          Swap buffer      |
 |<--------------- SYNC_ACK ----------------|
 |---------------- PLAY ------------------->|
 |                          Resume display   |
```

当前版本明确不接受“一边同步、一边显示”。同步期间设备暂停显示刷新；后续版本再设计双缓冲实时上传。

## 8. 建议超时

- TCP 连接超时：5 秒
- SYNC_ACK 超时：8 秒
- 单个控制消息最大 payload：1 MiB
- 单帧数据包流大小：120,960 B

## 9. 错误处理

- 控制消息 Magic、Version、PayloadLength 或 CRC 错误：返回失败 ACK 或断开连接。
- 角度片数量、顺序、长度或 CRC 错误：拒绝本次同步。
- 原始帧 CRC 不一致：拒绝本次同步。
- App 等待 ACK 超时：发送 `SYNC_ABORT` 并将同步状态标记为错误。
- 连接中断：当前实现不会自动重连，用户需要重新手动连接。
