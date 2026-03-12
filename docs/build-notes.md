# 构建说明

## 推荐环境

- Node.js: `22.22.0`
- npm: 跟随 `.nvmrc` 对应版本使用即可

## 本次踩坑记录

### 现象

执行 `npm run build` 时出现以下错误：

```bash
TypeError: generate is not a function
    at ignore-listed frames
```

### 根因

不是业务代码报错，而是当前终端环境被注入了 Next.js 私有环境变量，导致构建流程异常。

已确认会影响构建的环境变量包括：

- `TURBOPACK`
- `__NEXT_PRIVATE_STANDALONE_CONFIG`
- `__NEXT_PRIVATE_ORIGIN`

其中 `__NEXT_PRIVATE_STANDALONE_CONFIG` 指向的路径不是当前项目，属于外部环境污染。

## 正确构建方式

如果当前 shell 可能带有外部注入环境变量，请使用干净环境构建：

```bash
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run build
```

校验命令：

```bash
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run lint
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run build
```

## 当前状态

在干净环境下，当前项目已经验证通过：

- `npm run lint` ✅
- `npm run build` ✅

## 后续建议

如果后面接 CI 或部署脚本，建议统一在构建命令前清理上述环境变量，避免再次出现同类问题。
