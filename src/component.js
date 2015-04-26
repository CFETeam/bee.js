/**
 * 注册组件
 * @param {String} 自定义组件的标签名
 * @param {Function} 自定义组件的构造函数
 */
function tag(tagName, component) {
    var tags = this.components = this.components || {};

    this.doc.createElement(tagName);//for old IE

    return tags[tagName] = component;
}

exports.tag = exports.component = tag;
