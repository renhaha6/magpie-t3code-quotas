# magpie-t3code-quotas

极简的 **Magpie 插件（协议适配器）**，把 Magpie 的多账号订阅额度通过 T3 Code 原生的 **Usage Hub（CLIProxyAPI 协议）** 共享给 T3 Code 查阅。

- **零改源码**：不改 Magpie 本体，也不改 T3 Code 本体，只做薄适配层。
- **零第三方依赖**：纯 ES Modules + Node/Bun 内置 API，直接可在 Magpie 插件宿主里运行。
- **零凭证接触**：只读取 Magpie 本机公开的 `GET /v1/magpie/quotas`（默认 `?kept=1` 读缓存防 429），不碰任何 OAuth Token，不额外请求上游厂商。
- **吃满原生能力**：
  - 上游复用 Magpie 原生的多账号采集、Remote Magpie 聚合和缓存刷新。
  - 下游复用 T3 Code 原生的 **Usage → Limits** 多账号按套餐权重汇总（Pooled Limits）、`/usage-limits` 命令和手机端 Widget。

---

## 安装方式

### 方式一：直接在 Magpie 里安装（推荐）

在 Magpie 的 **Plugins（插件）** 页点击添加，或在终端执行：

```sh
magpie plugin add github:uiuing/magpie-t3code-quotas
```

（如果是本地调试，也可以直接装本地目录：`magpie plugin add /你的路径/magpie-t3code-quotas`）

安装并开启后：
- 插件会随 Magpie 自动在本机启动一个只读 HTTP 适配服务（默认 `http://127.0.0.1:3478`）。
- Magpie 左侧栏会出现 **「T3 Code 额度」** 页面，可以查看实时状态、切换同步模式、按账号勾选、一键复制接入信息。

### 方式二：独立命令行运行（无需装进 Magpie）

```sh
bun serve.mjs
# 或
node serve.mjs
```

支持环境变量覆盖：`PORT`、`MANAGEMENT_KEY`、`MAGPIE_ADDR` / `MAGPIE_URL`、`MAGPIE_API_KEY`、`KEPT_ONLY`。

---

## 在 T3 Code 中接入

1. 打开 T3 Code 的 **Settings → Providers → Usage providers → Add hub**。
2. 填入以下信息（也可直接在 Magpie 侧边栏「T3 Code 额度」页一键复制）：
   - **URL**：`http://127.0.0.1:3478`
   - **Management Key**：`magpie-t3code-local`（建议在配置页或插件选项中改为自己的本地 Key）
3. 打开 **Usage → Limits**（快捷键 `Cmd+U` / `Ctrl+U`）或在对话输入框里输入 `/usage-limits`，即可看到 Magpie 中的多账号额度与按套餐汇总进度条。

---

## 同步模式与筛选说明

在 Magpie 侧边栏的 **「T3 Code 额度」** 页面中修改后**立即生效**，无需重启 Magpie：

- **逐账号明细（`per-account`，默认推荐）**：把选中的每个账号明细直接传给 T3 Code，由 T3 Code 原生按套餐权重做 Pooled 汇总并保留单账号分段条与重置倒计时。
- **按同套餐预汇总（`pooled`）**：按 Magpie 同套餐合并规则（同套餐求均值、自动剔除过期缓存、被周限卡死的 5h 窗按 100% 已用计）合并成合集额度后再传给 T3 Code。
- **仅活跃账号（`active-only`）**：每个厂商仅同步 Magpie 标记为最近活跃（`last`）的账号。
- **账号筛选**：支持「默认全量同步并排除取消勾选的账号」或「仅同步明确勾选的账号」。

### 插件选项（Magpie `plugins.json`）

可以在 Magpie 的 Plugins 页选项里设置初始参数（端口修改在此处生效）：

```json
{
  "port": 3478,
  "managementKey": "magpie-t3code-local",
  "keptOnly": true,
  "mode": "per-account"
}
```

---

## 支持范围与已知边界

- **T3 Code 原生 `Usage → Limits` 显示范围**：受 T3 Code 服务端 `HUB_PROVIDERS` 白名单限制，原生 Hub 目前仅识别 **Claude、Codex (ChatGPT)、Antigravity、Grok (xAI)** 这 4 类订阅账号（包含多账号、多套餐与 Remote Magpie 账号）。
- **其他厂商额度**：WorkBuddy、DeepSeek、Kimi、GLM、MiniMax 及 API Key 余额不会被塞进 T3 Code 原生白名单，但仍会在本插件的控制页里按 Magpie 规则汇总展示。
- **只读安全**：仅提供只读查询；Codex 重置卡兑换等写操作请在 Magpie 内进行。

---

## 本地测试

```sh
bun test
# 或
node --test
```

## License

MIT
