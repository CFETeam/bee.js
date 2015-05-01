
Bee 构造函数
---

参数:

- **tpl** `String|Element` 可选. HTML 模板
- **props** `Object` 可选

Bee 构造函数是 Bee 的唯一入口.

props
---

Props 参数会并入 bee 示例中, 作为其属性或方法, 并且可以在花括号 `{{ exp }}` 表达式中直接使用.

### $data

$data 中的数据将会并入 Bee 示例中.

```js
var data = {a: 'a'};
var bee = new Bee({
    $data: data
});

bee.$data === data; //true
bee.a;              //'a'
```
