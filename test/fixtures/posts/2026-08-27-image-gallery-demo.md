---
title: 图片九宫格 Demo
layout: post
tags:
  - demo
images:
  - https://picsum.photos/seed/grid-1/800/800
  - https://picsum.photos/seed/grid-2/800/800
  - https://picsum.photos/seed/grid-3/800/800
  - https://picsum.photos/seed/grid-4/800/800
  - https://picsum.photos/seed/grid-5/800/800
  - https://picsum.photos/seed/grid-6/800/800
  - https://picsum.photos/seed/grid-7/800/800
  - https://picsum.photos/seed/grid-8/800/800
  - https://picsum.photos/seed/grid-9/800/800
---

这是一个**图片九宫格**功能的**测试 fixture**：只在测试构建时由 `test/fixtures.mjs` 复制进 `_posts/`（用后清理），不会出现在真实站点的开发 / 线上构建里。

- 列表页（首页 / posts 归档页）会根据 front matter 的 `images:` 字段渲染朋友圈式缩略图网格：1 张大图、2–4 张两列、5–9 张三列。
- 点击任意缩略图打开大图灯箱，支持：
  - 左右圆形按钮切换
  - 键盘 `←` / `→` 切换、`Esc` 关闭
  - 手机上左右滑动切换
- 正文里的图片同样可以点击放大并左右切换（本页下面放了两张作演示）。

![demo 1](https://picsum.photos/seed/grid-1/800/800)

![demo 2](https://picsum.photos/seed/grid-2/800/800)

在帖子正文中这样添加：

```yaml
---
images:
  - https://example.com/a.jpg
  - https://example.com/b.jpg
---
```

即 front matter 里的 `images:` 列表，最多显示前 9 张。