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

#### $content
传入的 `$content` 内容会被转成一个 documentFragment 存放在对应属性中. 配合 `content` 指令可以将其内容展示出来.

当有定义 `$target` 时, `$content` 会被 `$target` 中的内容替代.

#### $watchers
用来初始快速调用 `$watch` 方法.


#### props 与实例属性
一般来说, `props` 传入的参数都将作为实例属性出现, 并且保持同一引用. 但是有几个特例:

- `$tpl` 可以通过 props 传入 DOM 元素或字符串模板, 但其实例属性始终是字符串
- `$data, $filters, $watchers` 作为实例属性会和传入值保持同一引用, 但是会并入默认项
- `$content` 接受字符串 / DOM元素 / nodeList 参数, 但是会被转成 "documentFragment"

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
获取当前实例的数据. 支持模板中的表达式写法.
```
var bee = new Bee({$data: {list: [1, 2, 3], size: 5}});
bee.$get('list.length'); //3
bee.$get('list.length * size') //15
```

### $set
更新当前实例的数据. 用 `$set` 方法总是扩展(添加或修改)数据.

```
bee.$set({key: 1});
bee.$set('key', 1);
```

### $replace
替换当前实例的数据. 参数同 `.$set`

### $watch
监听某个表达式的变化.

### $unwatch
取消监听.


Directive
---

`Directive` 是来自 [angular.js](https://angularjs.org/) 中的概念. 其是一个特殊的 HTML 属性来标识处理特性的操作.
`Beejs` 中内置了若干 `directive` 来方便我们的程序处理.

### b-model
用于双向绑定. 只限于使用在表单输入元素上.

```html
<input b-model="some.key" type="text" />
```

### b-if
条件指令.控制元素是否出现在 DOM 树种.

```html
<div b-if="some.expression"> </div>
```

### b-repeat
Repeat 指令. 用于展示数组内容.

Repeat 指令会创建一个匿名的 bee 实例, 并且会添加一个 `$index` 变量标示在数组中的索引.

```html
<ul>
  <li b-repeat="item in list">{{$index + 1}}. {{item}}</li>
</ul>
```

### b-attr
HTML 属性指令.

```html
<div b-attr="{class: 'someClass', 'data-sth': 'some attr'}"></div>
```

### b-on
事件绑定

```html
<div b-on="{click: handler}"></div>
```

### b-style b-src
`b-style`, 用于设定样式. `b-src` 用于图片 `src`

```html
<div b-style="{color: color, width: 50}"></div>
```

### b-text b-html b-content
这三种指令都用于展示内容.

- `b-text` 用于展示普通文本内容. 等同于双括号表达式. 比如 `<span b-text="some.key"><span>` 等同于 `{{some.key}}`
- `b-html` 用于展示为转义 HTML 内容. 等同于三括号表达式. 比如 `<span b-html="some.key"><span>` 等同于 `{{{some.key}}}`
- `b-content` 可用于展示 DOM 内容.

### b-component
用于组件化自定义标签. 等同于自定义标签. 如 `<span b-compoent="x-component">content</span>` 等同于 `<x-component>content</x-component>`

需要注意的是, IE8 中的自定义标签 bug 极多, 在某些情况下甚至不能正常工作. 所以如果要兼容 IE8, 请尽量使用 `b-component`  代替自定义标签.

