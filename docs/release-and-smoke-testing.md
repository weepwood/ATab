# 扩展发布包与 Chromium 烟雾测试

ATab 的发布流程将“代码可以构建”与“扩展产物可以加载”分开验证。每个 PR 除原有类型检查、单元测试和生产构建外，还会校验最终 `dist`、生成 ZIP，并在真实 Chromium 持久上下文中加载扩展执行核心页面烟雾测试。

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
7. 生成可复现扩展 ZIP；
8. 安装 Playwright Chromium；
9. 在 Xvfb 中加载 MV3 扩展；
10. 执行新标签页、工作台、网页资料、统一搜索、设置和 IndexedDB 烟雾测试；
11. 上传扩展 ZIP；
12. 测试失败时上传 Playwright trace、截图和 HTML 报告。

PR 产物保留 14 天，失败报告保留 7 天。

## 构建产物校验

```bash
node scripts/validate-extension.mjs
```

校验内容：

- `manifest_version` 必须为 3；
- 扩展名称和数字版本有效；
- 标签页、标签组、书签、会话、存储与脚本权限存在；
- 浏览历史保持可选权限；
- HTTP/HTTPS 网站访问保持可选主机权限；
- 安装时不得申请 `<all_urls>` 或全部 HTTP/HTTPS 网站；
- 新标签页、设置、工作台和后台入口文件真实存在；
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
```

归档规则：

- `manifest.json` 位于 ZIP 根目录；
- 文件按路径排序；
- 使用固定时间戳和普通文件权限；
- 拒绝绝对路径和 `..` 路径；
- 压缩完成后重新读取 ZIP 验证结构。

本地安装：

1. 解压 ZIP；
2. 打开 Chrome/Edge 扩展管理页；
3. 启用开发者模式；
4. 选择“加载已解压的扩展”；
5. 选择解压目录，而不是 ZIP 文件本身。

## Chromium 烟雾测试

```text
apps/e2e/tests/extension.smoke.spec.ts
```

测试通过 `--disable-extensions-except` 和 `--load-extension` 加载生产构建目录，并从 MV3 Service Worker URL 获取真实扩展 ID。

当前验证：

- Manifest 新标签页入口可以打开；
- 新标签页显示 ATab；
- 工作台可以打开；
- 标签页、搜索和网页资料导航存在；
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
2. `scripts/verify-release-tag.mjs` 检查标签与 Manifest 版本一致；
3. 生成扩展 ZIP；
4. 使用 GitHub CLI 创建 Release；
5. 上传 ZIP 并自动生成发行说明。

例如 Manifest 为：

```json
{ "version": "0.1.0" }
```

只允许使用：

```text
v0.1.0
```

标签与 Manifest 不一致时，发布会在创建 Release 前失败。

## 安全边界

- Release 工作流只使用 GitHub 自动令牌创建发行版；
- 不向扩展构建注入模型密钥、Supabase service-role 或用户凭据；
- Playwright 使用临时浏览器配置目录；
- 失败报告可能包含测试页面截图，因此只测试无真实用户数据的临时环境；
- ZIP 是开发者加载包，不是 Chrome Web Store 签名 CRX；
- GitHub Release 不等于浏览器商店审核通过。

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
python3 scripts/package-extension.py
pnpm --filter @atab/e2e exec playwright install chromium
ATAB_EXTENSION_DIR="$PWD/apps/extension/dist" \
  pnpm --filter @atab/e2e exec playwright test
```

Linux 无桌面环境时使用：

```bash
xvfb-run -a pnpm --filter @atab/e2e exec playwright test
```
