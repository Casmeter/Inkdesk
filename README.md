# inkdesk

Godot Dialogue Manager 码字桌面。

![inkdesk 码字界面](docs/editor.png)

护眼稿纸、Dialogue Manager 语法色、灯芯桌宠。源码可以放进 GitHub，**不要把 `inkdesk.exe` 和 `release` 文件夹推进仓库**——网页上传单个文件不能超过 25MB。截图很小，可以一起传。

## 在 README 里加图

把 png / jpg 放进仓库（例如 `docs/` 文件夹），在 README 里写：

```md
![说明文字](docs/editor.png)
```

路径相对 README。自己再截打字机、统计页，存成 `docs/typewriter.png` 之类，再加一行即可。

## 网页上传源码

1. 解压 `inkdesk-source.zip`
2. 在 GitHub 新建空仓库
3. 把解压出来的文件拖进仓库上传（记得带上 `docs` 文件夹）

## 安装包（约 76MB）

仓库页面 → **Releases** → **Create a new release** → 把 `inkdesk-1.0.0.7z` 或 `inkdesk-发送用.exe` 当附件上传。Releases 不受 25MB 限制。

## 从源码运行

需要 [Node.js](https://nodejs.org)。

```
npm install
npm run electron
```

打包 Windows 绿色版：

```
npm run pack
```
