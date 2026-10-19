# 花萝卜 🐾

一只住在桌面上的黑白猫。使用完整的二维动作帧，支持自主活动、鼠标互动和桌面图标猫爬架。

## 下载安装

**Windows 10 / 11 · Intel / AMD x64**

前往 [Releases](https://github.com/haidarkhanuk3344-collab/hualuobo/releases/tag/v0.6.1)，下载 `花萝卜-0.6.1-Windows-x64-Setup.exe`。安装后打开花萝卜，点击「放出花萝卜」。无需安装 Node.js，也无需下载源码。

0.6.0 用户可直接覆盖安装 0.6.1。此版本修复 Windows 提示「并行配置不正确」的启动配置损坏问题。

## 操作

- 控制面板：放出／收起、暂停、大小调整（70%–120%）、图标互动和开机启动开关。
- 连续双击猫咪：打开操作菜单。
- 关闭控制面板：收到托盘；彻底关闭请点击「退出花萝卜」。
- 鼠标靠近：关注、嗅闻和拍爪等反应。
- 桌面文件、文件夹和快捷方式：作为猫爬架，支持攀上、趴卧和离开。

图标组件只读取位置，不点击、打开、拖动或重命名用户文件，不读取文件内容。

## 当前状态

**0.6.1 为未签名测试版。** 80 项自动化测试通过，安装包 248 项文件解包哈希核验通过；启动配置与官方 Electron 原件一致。真实 Windows 安装、启动与图标互动仍待验证，欢迎通过 Issues 反馈系统版本、应用版本及截图。

动作采用现有少量完整帧，部分动作衔接和步态仍有局限。当前版本不代表已达到真实猫咪连续运动效果。

## 本地开发

建议 Node.js 22。安装依赖后运行：

```sh
npm ci
npm test
npm run build
npm start
```

macOS 原生组件需要 Xcode Command Line Tools 和 Node.js headers；可通过 `HUALUOBO_NODE_HEADERS` 指定 headers 目录。

Windows 原生图标读取组件需要 C++ 编译器。在 Visual Studio x64 Native Tools 命令行中执行：

```sh
npm ci
npm run build:windows-native
npm run build
npm start
npm run package:windows
npm run package:windows:installer
```

安装器构建需要 NSIS 和 7-Zip；可用 `HUALUOBO_NSIS_DIR` 与 `HUALUOBO_7ZZ` 指定工具路径。默认自动下载工具的流程主要在 macOS 构建机验证。跨平台构建 Windows 原生组件可通过 `HUALUOBO_WINDOWS_CXX` 指定 LLVM-MinGW 编译器。

## 技术

Electron、TypeScript、Canvas 2D；Windows 使用只读 UIAutomation 读取桌面图标位置，macOS 使用原生辅助功能接口。渲染保持完整身体，不对肢体切片拼接，不用半透明交叉叠图切换姿势。

## 权利说明

仓库公开可见，暂未指定开源许可证。代码与角色素材保留相关权利；第三方组件遵循其各自许可证。见 [NOTICE.txt](NOTICE.txt)。
