# 扩展发布包与 Chromium 烟雾测试

ATab 的发布流程将“代码可以构建”与“扩展产物可以加载”分开验证。每个 PR 除原有类型检查、单元测试和生产构建外，还会校验最终 `dist`、生成 ZIP 与 SHA-256 校验文件，并在真实 Chromium 持久上下文中加载扩展执行核心页面烟雾测试。

## PR 工作流

```text
.github/workflows/extension-smoke.yml
```

执行步骤：

1. 安装 pnpm 和 Node.js 22；
2. 安装 workspace 依赖；
3. TypeScript 类型检查；
4. 单元测试；
5. 扩展、API 和共享协议生产构建；
6. 校验扩展 Manifest 与构建产物；
7. 校验根包、扩展包与构建 Manifest 的版本一致性；
8. 生成可复现扩展 ZIP 和 SHA-256 校验文件；
9. 重复打包并比较 ZIP 哈希；
10. 上传扩展包工件；
11. 安装 Playwright Chromium；
12. 在 Xvfb 中加载 MV3 扩展；
13. 执行新标签页、工作台、网页资料、统一搜索、设置和 IndexedDB 烟雾测试；
14. 测试失败时上传 Playwright trace、截图和 HTML 报告。

PR 扩展包工件保留 14 天，失败报告保留 7 天。扩展包在产物校验和打包成功后上传，因此即使后续 Chromium 测试失败，也可以下载对应 ZIP 与校验文件进行诊断；失败的烟雾测试不代表该产物可以发布。

## 构建产物校验

```bash
node scripts/validate-extension.mjs
```

校验内容：

- `manifest_version` 必须为 3；
- 扩展名称和数字版本有效；
- `minimum_chrome_version` 不得高于项目兼容目标 Chrome 109；
- 标签页、标签组、书签、会话、存储、脚本与定时任务权限存在；
- 浏览历史保持可选权限；
- HTTP/HTTPS 网站访问保持可选主机权限；
- 安装时不得申请 `<all_urls>` 或全部 HTTP/HTTPS 网站；
- 后台 Service Worker 使用 module 类型；
- 自定义扩展 CSP 不得允许远程脚本、`unsafe-eval` 或 `data:` 脚本；
- 新标签页、设置、工作台和后台入口路径安全且文件真实存在；
- 最终 `dist` 不得包含符号链接；
- 扫描构建后的 JS、HTML、JSON 和 CSS。

敏感信息扫描包括：

- 私钥 PEM；
- `sk-` 风格模型密钥；
- Supabase service-role 标识；
- 显式写入的常见模型 API Key；
- 远程静态或动态 JavaScript import；
- 远程 `<script src>`；
- `eval`；
- `new Function`。

扫描对象是最终扩展产物，而不是只扫描源代码。

## ZIP 打包

```bash
python3 scripts/package-extension.py
```

输出：

```text
artifacts/atab-extension-<manifest-version>.zip
artifacts/atab-extension-<manifest-version>.zip.sha256
```

归档规则：

- `manifest.json` 位于 ZIP 根目录；
- 文件按路径排序；
- 使用固定时间戳和普通文件权限；
- 拒绝符号链接、绝对路径、`..` 路径和重复归档路径；
- 产物输出目录不得位于扩展 `dist` 内部；
- 压缩完成后重新读取 ZIP 验证结构；
- 对最终 ZIP 计算 SHA-256，并生成标准校验文件；
- PR 工作流会重复打包一次并确认 ZIP 哈希完全一致。

下载 ZIP 和 `.sha256` 到同一目录后校验：

```bash
sha256sum -c atab-extension-0.1.0.zip.sha256
```

macOS 可以使用：

```bash
shasum -a 256 -c atab-extension-0.1.0.zip.sha256
```

本地安装：

1. 校验 ZIP 的 SHA-256；
2. 解压 ZIP；
3. 打开 Chrome/Edge 扩展管理页；
4. 启用开发者模式；
5. 选择“加载已解压的扩展”；
6. 选择解压目录，而不是 ZIP 文件本身。

## Chromium 烟雾测试

```text
apps/e2e/tests/extension.smoke.spec.ts
```

测试通过 `--disable-extensions-except` 和 `--load-extension` 加载生产构建目录，并从 MV3 Service Worker URL 获取真实扩展 ID。

当前验证：

- Manifest 新标签页入口可以打开；
- 新标签页搜索框和工作台入口可见；
- 工作台可以打开；
- 标签页、搜索和资料导航存在；
- 网页资料页面可以初始化；
- IndexedDB 中建立 `atab` 数据库；
- 统一搜索页面可以打开；
- 语义搜索默认关闭提示存在；
- 设置页面可以打开；
- 设置页包含 AI 与同步配置；
- 页面没有未捕获 JavaScript 异常。

测试使用临时 Chromium 用户目录，完成后关闭上下文并由 CI 清理运行目录。

## 标签发布

```text
.github/workflows/release.yml
```

推送 `v*` 标签后：

1. 重新运行类型检查、测试、构建、产物校验和 Chromium 烟雾测试；
2. `scripts/verify-release-tag.mjs` 检查根 `package.json`、扩展 `package.json`、构建 Manifest 与标签版本一致；
3. 生成并验证扩展 ZIP 与 SHA-256 校验文件；
4. 不存在同名 Release 时创建 Release 并生成发行说明；
5. 已存在同名 Release 时覆盖上传 ZIP 与校验文件，使失败后的工作流可以安全重跑。

例如项目版本为：

```json
{ "version": "0.1.0" }
```

只允许使用：

```text
v0.1.0
```

任一版本来源与标签不一致时，发布会在创建或更新 Release 前失败。

## 安全边界

- Release 工作流只使用 GitHub 自动令牌创建或更新发行版；
- 不向扩展构建注入模型密钥、Supabase service-role 或用户凭据；
- Playwright 使用临时浏览器配置目录；
- 失败报告可能包含测试页面截图，因此只测试无真实用户数据的临时环境；
- ZIP 是开发者加载包，不是 Chrome Web Store 签名 CRX；
- GitHub Release 不等于浏览器商店审核通过；
- SHA-256 用于完整性校验，不等同于代码签名或发布者身份认证。

## 仍需人工验收

自动测试不能完整覆盖浏览器权限和外部服务。正式发布前仍需至少验证：

- Chrome 与 Edge 当前稳定版；
- Chrome 109 兼容路径；
- 新标签页覆盖与恢复默认新标签页；
- 原生书签增删改和浏览器账号同步；
- 浏览历史权限申请、拒绝与撤销；
- 网页主机权限申请和敏感页面确认；
- AI endpoint 授权、登录、Token 刷新与 401；
- 真实模型摘要和嵌入接口；
- 两台浏览器之间的 Supabase 会话与云收藏同步；
- 冲突处理；
- 浏览器休眠与 Service Worker 重启；
- 大量标签页、书签和网页资料下的性能；
- ZIP 解压并重新加载升级后的 IndexedDB 迁移。

## 本地命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node scripts/validate-extension.mjs
node scripts/verify-release-tag.mjs v0.1.0
python3 scripts/package-extension.py
(cd artifacts && sha256sum -c atab-extension-0.1.0.zip.sha256)
pnpm --filter @atab/e2e exec playwright install chromium
ATAB_EXTENSION_DIR="$PWD/apps/extension/dist" \
  pnpm --filter @atab/e2e smoke
```

Linux 无桌面环境时使用：

```bash
xvfb-run -a pnpm --filter @atab/e2e smoke
```
