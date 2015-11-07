Bee 构造函数
---

```js
new Bee('<div>{{name}}</div>', {$data: { name: 'Bee' }})
```

参数:

- **tpl** `String|Element` 可选. HTML 模板, 同 `props.$tpl`.
- **props** `Object` 可选

Bee 构造函数是 Bee 的起点. 一个 Bee 实例既是一个 `ViewModel` 实例, 同时混入了 `View` 及 `Model` 属性的一个对象.

Bee 构造函数接受两个参数: `tpl`, `props`.
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

#### $tpl 和 $el
这两个属性相互关联, 但是有不同的用处.

- `$tpl` 等同于前面的参数 `tpl`, 缺省值为 `<div></div>`. 当传入一个 dom 对象时,
其会被传换成该元素的 `outerHTML`.
- `$el` 是一个 dom 元素, 缺省值是 `$tpl` 表示的元素. `$el` 的子元素, 会被移到 `$content` 属性中.


```js
var el = document.getElementById('someId');
var bee = new Bee('<div>{{name}}</div>', { $el: el, $data: { name: 'Bee' } });
bee.$el === el;    //true
```

#### $content [String|Element|NodeList]
传入的 `$content` 内容会被转成一个 documentFragment 存放在对应属性中.
配合 `content` 指令可以将其内容展示出来.

当有传入 `$el` 时, `$content` 会被 `$el` 中的内容替代.

#### $mixins [Array]
除了构造函数继承外, `$mixins`  是另外一种继承方式. 一些可复用的方法集合可通过 `$mixins` 并入 Bee 实例中.

#### props 与实例属性
一般来说, `props` 传入的参数都将作为实例属性出现, 并且保持同一引用. 但是有几个特例:

- `$tpl` 可以通过 props 传入 DOM 元素或字符串模板, 但其实例属性始终是字符串
- `$content` 接受字符串 / DOM元素 / nodeList 参数, 但是会被转成 "documentFragment"
- 生命周期方法. 通过 `props` 传入的生命周期方法不会通构造函数及 `mixins` 中定义的互相覆盖, 它们全部有效.

构造函数方法
---

### Bee.defaults

数据 `$data` 的默认值, 该构造函数下的实例都将带上这些默认值.

### Bee.extend

创建一个继承 Bee 的构造函数.

```js
var Ant = Bee.extend({
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

子构造函数的 `__super__` 属性指向父构造函数的 `prototype` 对象. 父构造函数的原型属性和静态属性会被子构造函数的同名属性覆盖,
除了 `directives, components, filters` 三个静态属性除外. 子构造函数会继承父构造函数 `directives, components, filters` 属性,
并且会并入 `extend` 方法中传入的相应内容.

### Bee.directive

创建一个自定义指令.

### Bee.tag

`Bee.component` 的别名. 以一个自定义标签定义一个组件.

### Bee.mount

加载某个组件. 如果 `Bee.mount` 一个普通元素(非关联的自定义标签), 则效果与 `new Bee` 一样.

### Bee.filter

创建一个自定义 `filter`


实例方法
---

### $get

参数:
- **expression** `String`

获取当前实例的数据. 支持模板中的表达式写法.
```
var bee = new Bee({$data: {list: [1, 2, 3], size: 5}});
bee.$get('list.length'); //3
bee.$get('list.length * size') //15
```

### $set

参数:
- **keyPath** `String` 可选
- **value** `AnyType`

更新当前实例的数据. 用 `$set` 方法总是扩展(添加或修改)数据.

```
bee.$set({key: 1});
bee.$set('key', 1);
```

### $replace
替换当前实例的数据. 参数同 `.$set`

### $watch

参数:
- **expression** `String` 监听的表达式
- **callback** `Function` 回调
- **immediate** `Boolean` 是否在监听时立即回调一次. 默认为 false

监听某个表达式的变化.

### $unwatch

参数:
- **expression** `String`
- **callback** `Function`

取消监听表达式中出现的变量对应的回调.

### $destroy

参数:
- **removeElement** `Boolean` 可选. 缺省为 `false`. 为真时将从 DOM 树移除 `$el` 元素.

销毁当前实例. 销毁后该实例下所有的绑定都会失效.

### $refs

`$refs` 中包含了对 `b-ref` 指令关联元素或组件的引用.


### 生命周期方法

- `$beforeInit` 该方法在解析模板之前调用. 可以在该方法中添加额外的数据之类的
- `$afterInit` 初始化渲染结束后调用.
- `$beforeUpdate` 调用 `$set, $replace` 方法更新 dom 树前.
- `$afterUpdate` 调用 `$set, $replace` 方法更新 dom 树后.
- `$beforeDestroy` Bee 实例销毁之前回调
- `$afterDestroy` Bee 实例销毁之后回调

> 关于生命周期方法还有一点需要注意的是: 各个阶段定义的生命周期方法并不会互相覆盖.

```js
var Ant = Bee.extend({
    $beforeInit: function() {
        console.log(1);
    },
    $mixins: [{
        $beforeInit: function() {
            console.log(2);
        }
    }]
});

new Ant({
    $beforeInit: function() {
        console.log(3)
    }
});
//1, 2, 3 会全部依次打印出来
```

Directive
---

`Directive` 是来自 [angular.js](https://angularjs.org/) 中的概念. 其是一个特殊的 HTML 属性来标识处理特性的操作.
`Beejs` 中内置了若干 `directive` 来方便我们的程序处理.

### b-model
用于双向绑定. 用于表单输入元素上或自定义组件中. 对于自定义组件, 激活双向绑定需要将其 `$valuekey` 属性指向需要绑定的 data 路径

```html
<input b-model="some.key" type="text" />
```

### b-if
条件指令.控制元素是否出现在 DOM 树中.

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
事件监听指令. 标准的 `b-on` 指令接收 [backbone 风格](http://backbonejs.org/#View-extend)的事件处理对象.

另外你也可以简单使用 `b-on-click, b-on-mousedown` 等特定事件指令直接在模板中完成调用.

```html
<div b-on="{'click a': handler}"></div>
<div b-on-click="list.push(1)"></div>
```

### b-style b-src
`b-style`, 用于设定样式. `b-src` 用于图片 `src`

IE 浏览器会校验 `style` 属性值, 所以直接使用 `style='{{"color: white"}}'` 这种写法在 IE 中没有效果. 为了兼容 IE 浏览器,
 可以使用 `b-style` 指令, 指令值可以为字符串或对象.

直接使用 `src='{{src}}'` 这种写法有可能会向服务器发送一条无效的 `404` 请求, 为了避免这种情况请使用 `b-src` 指令代替.

```html
<div b-style="{color: color, width: 50}"></div>
<div b-style="'color: ' + color + '; width: 50px;'"></div>
```

### b-class
`b-class` 用于快速的设定元素的 CSS 类名. `b-class` 指令支持字符串或者对象格式.

对于对象格式 `<span b-class="{'myclassname': 'mykey'}"></span>`,
当 `mykey` 为 `true` 时会在 `span` 元素上添加一个 `myclassname` 的类名, 反之则移除这个类名.

### b-text b-html b-content
这三种指令都用于展示内容.

- `b-text` 用于展示普通文本内容. 等同于双花括号表达式. 比如在文本中 `<span b-text="some.key"><span>` 等同于 `{{some.key}}`
- `b-html` 用于展示为转义 HTML 内容. 等同于三花括号表达式. 比如 `<span b-html="some.key"><span>` 等同于 `{{{some.key}}}`
- `b-content` 可用于展示 DOM 内容. 等同于 `{{> some.key }}`

### b-ref
对指定元素或组件建立一个快速的引用. `b-ref` 标记引用以供 `$refs` 使用.

### b-template
`templte` 标签的 `ie8` 兼容.

### b-component b-tag
用于组件化自定义标签. 等同于自定义标签. 如 `<span b-compoent="x-component">content</span>` 等同于 `<x-component>content</x-component>`

需要注意的是, IE8 中的自定义标签 bug 极多, 在某些情况下甚至不能正常工作. 所以如果要兼容 IE8, 请尽量使用 `b-component` 或 `b-tag` 代替自定义标签.
