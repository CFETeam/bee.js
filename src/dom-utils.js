"use strict";

var doc = require('./env.js').document
var utils = require('./utils')

//处理 $target,  $content, $tpl
//target: el 替换的目标
function tplParse(tpl, target, content) {
  var el, contents
    , frag = doc.createDocumentFragment();
  if(utils.isObject(target) && target.childNodes) {
    content = frag;
    contents = target.childNodes;
  }else{
    if(typeof content == 'string') {
      contents = createElementByTpl(content)
      content = frag;
    }
  }
  if(contents) {
    while (contents[0]) {
      content.appendChild(contents[0]);
    }
  }
  if(utils.isObject(tpl)){
    el = tpl;
    tpl = el.outerHTML;
  }else{
    el = createElementByTpl(tpl)[0]
  }
  if(target){
    target.parentNode && target.parentNode.replaceChild(el, target);
  }

  return {el: el, tpl: tpl, content: content};
}

function createElementByTpl(tpl) {
  var wraper = doc.createElement('div');
  //自定义标签在 IE8 下无效. 使用 component 指令替代
  wraper.innerHTML = tpl.trim();
  return wraper.childNodes;
}

module.exports = {
  tplParse: tplParse,
  createElementByTpl: createElementByTpl
}