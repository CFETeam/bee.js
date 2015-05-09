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
- `$el` 必须是一个 dom 元素, 缺省值是 `$tpl` 表示的 dom 元素. 当 `$tpl` 和 `$el` 都传入时,
`$tpl` 节点将会被插入 `$el` 中.
- `$target` 类似 `$el`, 不同的是 `$target` 节点会被 `$tpl` 节点替换, 而不是插入.

```js
var el = document.getElementById('someId');
var bee = new Bee('<div>{{name}}</div>', { $el: el, $data: { name: 'Bee' } });
bee.$el === el;    //true
```


构造函数方法
---

### Bee.extend

### Bee.directive

### Bee.tag

### Bee.mount


实例方法
---

### $get

### $set

### $replace

### $watch

### $unwatch
