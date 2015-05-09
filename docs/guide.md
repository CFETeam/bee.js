Bee 使用向导
====

完整的 Bee 程序分为 HTML 模板和 JS 程序两部分

一个典型的 Bee 模板:

```html
<div id="tpl">
  <h2>{{name}}<i class='fold' b-on="{click: foldToggle}">{{isFold?"+":"-"}}</i></h2>
  <ul  b-if="!isFold">
    <li b-repeat="item in list">
        <span>{{item.name}}</span> <i b-if="item.state">i</i>
        <div title="{{item.detail}}">{{ellipsis(item.detail)}}</div>
    </li>
  </ul>
</div>
```

模板经过初始化之后才会被赋予正常的行为.

```js
var bee = new Bee(tpl, {
  $data: {
    name: 'Bee',
    list: [{
      name: 'props',
      state: true,
      detail: '短的介绍'
    }, {
      name: 'datas',
      state: false,
      detail: '这是比较长的介绍, 会被截断'
    }]
  },
  ellipsis: function(text) {
    if (text.length >= 10) {
      text = text.slice(0, 8) + '……'
    }
    return text
  },
  foldToggle: function() {
    this.$set('isFold', !this.isFold);
  }
})
```
初始化之后的实例 `bee` 将具备一些相关方法, 这些方法同时可以在模板内部和外部使用.

运行效果请访问: http://codepen.io/justan/pen/GJopBB


组件化
---

对于一些常用的功能我们可以将其封装成一些自定义标签的形式, 在页面的其他地方使用.

一个 Bee 组件就是一个继承自 Bee 的构造函数. 在于一个自定义标签建立关联之后,
页面中的这些自定义标签将变成该组件的实例. 为了理解这点请想想 HTML 中的 `img`
标签和 JavaScript 中的 `Image` 构造函数的关系.

创建组件通过 `Bee.tag` 方法完成.
```js
var Ant = Bee.extend({
  $tpl: tpl.innerHTML,
  ellipsis: function(text) {
    if (text.length >= 10) {
      text = text.slice(0, 8) + '……'
    }
    return text
  },
  foldToggle: function() {
    this.$set('isFold', !this.isFold);
  }
})

Bee.tag('x-bee', Ant);
```

运行效果请见: http://codepen.io/justan/pen/MwKwWQ
