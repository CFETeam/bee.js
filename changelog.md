0.5.0
---
- 支持模板内事件调用 `b-on-click="dosth()"` 写法
- 自定义组件双向绑定支持. via `$valuekey`
- 添加 `b-comonent` 的简写 `b-tag`
- 多元素的 `b-if` 及 `b-repeat` 支持. via `template` or `b-template`
- 移除 `$watchers`
- 模板中 `repeat` 内调用方法的 `this` 改为指向根 ViewModel
- 使用 `$isReplace` 替换 `$target` 的作用
- 当 `b-if` 为 false 时, 其内部表达式将停止监听执行
- 新增 `{{> content}}` 直接量简写 `b-content`

0.4.1
---
- `b-style` 将不会覆盖原始的 `style` 样式
- 修复深层嵌套 `b-repeat` 问题

0.4.0
---
- `b-ref` 支持组件引用
- 局部性能优化
- `$set` 改为浅合并

0.3.3
---
- `$watch` 默认不再立即调用回调. 立即回调需要第三个参数传入 `true`
- 新增 `Bee.filter` 方法添加 `filter`
- Bug fix

0.3.2
---
- 修复 `$replace` 不能深层删除的问题
- 表达式求值错误时不再打印警告 (`console.warn`)

0.3.0
---
- `$get` 表达式支持
- 统一模板和 js 调用中 `$get, $set, $replace` 的指向
- 完善生命周期方法
- 新增 `$destroy` 方法
- 组件分组
- `mixin` 支持
- 在 `filter` 中支持 `promise` 管道及 `catchby`
- `trackby` 支持

0.2.0
---
- Repeat 中的 `item.$index` 改为 `$index`
- IE8 及以上浏览器的委托事件支持
- `content` directive 支持
