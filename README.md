# magpie-t3code-quotas

极简的 **Magpie 插件**，让你在 **T3 Code 的 `Usage → Limits`** 里直接查看 Magpie 各账号的剩余额度与多账号汇总。

- **零改源码**：不改 Magpie 本体，也不改 T3 Code 本体，纯薄适配层。
- **零第三方依赖**：纯 ES Modules + Node/Bun 内置 API。
- **装完自动接入**：自动写入 `~/.t3/userdata/settings.json`（兼容 `$T3CODE_HOME`），T3 Code 自动热加载，无需手动填表；并正确识别 T3 Code 对密钥的加密脱敏（`••••••`），重启不再反复要求重新同步。
- **安全隔离**：首次启动自动生成高熵随机连接密钥；仅监听 `127.0.0.1`、严格校验 `Host` 头防 DNS rebinding，控制页接口校验每次启动生成的随机 `X-UI-Token`，绝不触碰任何 OAuth Token。

---

## 安装方式

### 在 Magpie 中安装（推荐）

打开 Magpie → **Plugins（插件）** 添加，或执行：

```sh
magpie plugin add github:uiuing/magpie-t3code-quotas
```

安装开启后：
- 插件自动随 Magpie 启动并写入 T3 Code 配置，直接去 T3 Code 按 `⌘U`（`Usage → Limits`）或输入 `/usage-limits` 即可查看额度。
- Magpie 左侧栏会出现 **「T3 Code 额度」** 控制页，所有勾选与设置修改即生效。

### 独立命令行运行（可选）

```sh
bun serve.mjs
# 或
node serve.mjs
```

支持环境变量：`PORT`、`MANAGEMENT_KEY`、`MAGPIE_ADDR` / `MAGPIE_URL`、`MAGPIE_API_KEY`、`KEPT_ONLY`。

---

## 核心功能

1. **按「厂商 → 套餐 → 账号」三级勾选**
   - 可以一键勾选或取消整个套餐（例如只同步 Claude Max 与 Codex Pro），也可展开微调单个账号。
   - 支持「新加入的账号自动同步」开关，记忆套餐级偏好。
2. **多账号重置时间不误导**
   - **默认推荐「每个账号单独显示」**：把选中套餐的账号逐个交给 T3 Code，由 T3 Code 原生拼成分段汇总条，精确显示「下次重置具体回血哪一段、回多少百分比」。
   - **「同套餐合并成 1 条」模式**：提供重置时间口径选择——默认**不显示单一重置时间（防误导）**，也可切换为「最早单号回血时间」或「全部重置时间（最晚）」。
   - 在插件页面里的每个套餐行，同时标出「最早单号回血」与「全部恢复」时间。
3. **页面内直接热切换端口**
   - 在设置页直接输入新端口并点击「切换端口」：先试绑定新端口（被占用时报错不中断原服务），绑定成功后自动更新 `plugins.json` 与 T3 Code 配置并跳转。
   - 若启动时端口被占用，超时兜底页也支持直接换端口重试。

---

## 支持范围与说明

- **T3 Code 原生 `Usage → Limits` 范围**：受 T3 Code 服务端白名单限制，原生显示 **Claude、Codex (ChatGPT)、Antigravity、Grok** 四类订阅账号（支持多账号、多套餐与 Remote Magpie 账号）。
- **其他厂商额度**：WorkBuddy、DeepSeek、Kimi、GLM、MiniMax 及 API Key 余额会在插件控制页第 4 节按 Magpie 规则汇总展示。
- **远程 T3 Code 接入**：服务仅监听 `127.0.0.1`；若 T3 Code 在另一台电脑，请在控制页展开「远程设备手动接入」复制 SSH 隧道命令后手动添加到 T3 Code。

## 本地测试

```sh
bun test
# 或
node --test
```

## License

MIT
