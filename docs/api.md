Bee 构造函数
---

```js
new Bee('<div>{{name}}</div>', {$data: { name: 'Bee' }})
```

参数:

- **tpl** `String|Element` 可选. HTML 模板
- **props** `Object` 可选

Bee 构造函数是 Bee 的起点. 接受两个参数: `tpl`, `props`.
第一个参数 `tpl` 表示模板, 可以是模板字符串或 dom 元素.

在模板中可以通过各种指令使用 Bee 实例的数据及方法.

### props

Props 参数会并入 bee 示例中, 作为其属性或方法, 并且可以在花括号表达式 (`{{ exp }}`)
及其他指令中直接使用.

#### $data

$data 中的数据将会并入 Bee 实例中.

```js
var data = {a: 'a'};
var bee = new Bee({
    $data: data
});

bee.$data === data; //true
bee.a;              //'a'
```

> 尽管 `props` 和 `$data` 都会并入 Bee 实例中, 多数时候它们使用起来也没有区别.
但正像它们的名字那样, 请还是区分它们的使用. 即在 `$data` 中存放数据, 而方法和其他属性放在 `props` 里.

#### $tpl, $el 及 $target
这三个属性相互关联, 但是有不同的用处.

- `$tpl` 等同于前面的参数 `tpl`, 缺省值为 `<div></div>`. 当传入一个 dom 对象时,
其会被传换成该元素的 `outerHTML`.
- `$el` 是一个 dom 元素, 缺省值是 `$tpl` 表示的元素. 当 `$tpl` 和 `$el` 都传入时,
`$tpl` 将被插入 `$el` 中.
- `$target` 类似 `$el`, 不同的是 `$target` 节点会被 `$tpl` 节点替换, 而不是插入.
- 当 `$target` 存在时, 会同时创建一个 `$content` 的 documentFragment,
`$target` 的子元素会被存放其中.

```js
var el = document.getElementById('someId');
var bee = new Bee('<div>{{name}}</div>', { $el: el, $data: { name: 'Bee' } });
bee.$el === el;    //true
```

#### props 与实例属性
一般来说, `props` 传入的参数都将作为实例属性出现, 并且保持同一引用. 但是有几个特例:

- `$tpl` 可以通过 props 传入 DOM 元素或字符串模板, 但其实例属性始终是字符串
- `$data, $filters, $watchers` 作为实力属性会和传入值保持同一引用, 但是会并入默认项
- `$content` 接受字符串参数

构造函数方法
---

### Bee.extend

创建一个继承 Bee 的构造函数.

```js
Bee.extend({
  //原型属性/方法
  constructor: function() {
    //doSth
    Bee.apply(this, arguments)
  },
  someMethod: function() {

  }
}, {
  //静态属性/方法
})
```

### Bee.directive

创建一个自定义指令.

### Bee.tag

`Bee.component` 的别名. 以一个自定义标签定义一个组件.

### Bee.mount

加载某个组件. 如果 `Bee.mount` 一个普通元素(非关联的自定义标签), 则效果与 `new Bee` 一样.


实例方法
---

### $get

获取当前实例的数据.

### $set

更新当前实例的数据. 用 `$set` 方法总是扩展(添加或修改)数据.

### $replace

替换当前实例的数据.

### $watch

监听某个表达式的变化.

### $unwatch

取消监听.
