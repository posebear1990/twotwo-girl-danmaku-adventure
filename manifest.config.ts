import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "22娘弹幕大冒险",
  description:
    "在哔哩哔哩播放器里操控像素风 22 娘，在弹幕上跳跃冒险。",
  version: "0.1.0",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  },
  content_scripts: [
    {
      matches: [
        "https://www.bilibili.com/video/*",
        "https://www.bilibili.com/bangumi/play/*"
      ],
      js: ["src/content/main.ts"],
      run_at: "document_idle"
    }
  ]
});
