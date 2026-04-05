# 22娘弹幕大冒险

![22娘弹幕大冒险宣传图](assets/branding/promotional-image-440x280.png)

把哔哩哔哩播放器变成一个能边看边玩的像素小游戏。安装后，你可以直接操控 22 娘在实时弹幕上跳跃、助跑、踩台子、拿分数。

[Chrome Web Store](https://chromewebstore.google.com/detail/ffipgjffmghinekaaolhingoncpnenol?utm_source=item-share-cb)

[离线下载 / Releases](https://github.com/posebear1990/twotwo-girl-danmaku-adventure/releases/latest)

## 它是做什么的

22娘弹幕大冒险会在哔哩哔哩视频页和番剧播放页注入一个本地运行的互动层：

- 自动识别当前播放器和屏幕上正在飘过的弹幕
- 让 22 娘把这些弹幕当成临时平台来跳跃
- 提供助跑、弹簧起跳、计分和成就提示
- 尽量不打断正常看片，没开始时保留播放器常用按键

## 为什么值得安装

- 它不是单纯换皮挂件，而是真的把弹幕变成了可玩的内容
- 玩法足够轻，想玩就玩，不想玩的时候也不会把播放器完全接管
- 视觉是专门做过的像素风 22 娘主题，不是通用模板
- 如果你本来就喜欢弹幕文化、B 站整活和轻量小游戏，这个扩展会很对味

## 预览

![22娘弹幕大冒险实际截图](assets/screenshots/gameplay-1280x800.png)

## 功能

- 22 娘会出生在跟随播放进度移动的弹簧上
- 可以用弹幕当落脚点，并且会被弹幕一起带着移动
- 支持助跑、长跳和弹簧高跳
- 踩到新的弹幕平台会累计分数
- 满足条件时会触发 `FOOTLESS BIRD` 成就提示
- 视频重播后会重新开始计分

## 操作

- `A / D` 或 `← / →`：左右移动
- `Shift / J`：助跑
- `Space / K`：跳跃
- `J / K / ↑`：开始游戏

## 安装

### 方式一：从 Chrome Web Store 安装

打开上面的商店链接，点击安装即可。

### 方式二：手动安装离线包

如果你访问不了商店页面，可以用仓库里的 release zip：

1. 打开 [Releases 页面](https://github.com/posebear1990/twotwo-girl-danmaku-adventure/releases/latest)
2. 下载 zip 包
3. 解压到任意本地文件夹
4. 打开 Chromium 内核浏览器的扩展管理页面
5. 打开“开发者模式”
6. 选择“加载已解压的扩展程序”
7. 选中刚刚解压出来的文件夹

## 兼容范围

- `https://www.bilibili.com/video/*`
- `https://www.bilibili.com/bangumi/play/*`

## 本地开发

```bash
npm install
npm run build
```

构建完成后，把 `dist/` 目录作为 unpacked extension 加载到浏览器里即可。
