# dsh-codeslice

以**图谱 + 笔记**的方式读代码，和对话同屏。这是 DeepSeek Harness 的一个插件。

- **AST 知识图谱**：节点是文件/类/函数/说明，边是调用、导入、继承、包含、方法、说明
- **符号导航**：光标处定义、符号引用、按名字检索
- **混合检索**：中文二元组 + 英文单词 + 本地 Ollama 向量的 RRF 融合
- **笔记与锚点**：代码改动后报告 `fresh / moved / drifted / missing`
- **零运行时依赖**：Host 半是纯 Node ESM；Client 半是单文件 bundle

插件本体在 [`plugin/`](plugin/)。

## 安装

从 npm（发布后）：

```bash
npm install dsh-codeslice
```

或从本仓库的 [Release](https://github.com/ctianye/dsh-codeslice/releases) 下载 `dsh-codeslice-1.0.0.tgz`：

```bash
npm install ./dsh-codeslice-1.0.0.tgz
```

然后在 DSH profile 的 `package.json` 中把它加入 bundle：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-codeslice"]
    }
  }
}
```

重启 DSH。Host 半只在启动时加载，Client 半在页面刷新后生效。

## 开发与验证

```bash
cd plugin
node dev/build-client.mjs          # client/src → client.js
node dev/build-editor.mjs          # CodeMirror 懒加载块
node dev/host-test.mjs "D:/dsh-CodeSlice"
node dev/audit-checks.mjs
node dev/robustness.mjs
node dev/chat-probe.mjs
cd dev/harness && node run.mjs "D:/dsh-CodeSlice"
```

更多细节见 [`plugin/README.md`](plugin/README.md)、[`plugin/WIRE.md`](plugin/WIRE.md)、[`plugin/WIRE-CHAT.md`](plugin/WIRE-CHAT.md)。

## 许可

MIT。第三方组件许可见 [`plugin/client/vendor/`](plugin/client/vendor/)。