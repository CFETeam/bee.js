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
    contents = createNodes(target.childNodes);
  }else{
    if(content) {
      contents = createNodes(content)
      content = frag;
    }
  }
  if(contents) {
    for (var i = 0, l = contents.length; i < l; i++) {
      content.appendChild(contents[i]);
    }
  }

  el = createNodes(tpl)[0];

  if(utils.isObject(tpl)){
    tpl = el.outerHTML;
  }

  if(target){
    target.parentNode && target.parentNode.replaceChild(el, target);
  }

  return {el: el, tpl: tpl, content: content};
}

//将模板/元素/nodelist 同一转成 nodes array
function createNodes(tpl) {
  var wraper;
  var nodes = [];
  if(utils.isObject(tpl)) {
    if(tpl.nodeName && tpl.nodeType) {
      //dom 元素
      nodes = [tpl];
    }else if('length' in tpl){
      //nodelist
      nodes = tpl;
    }
  }else {
    wraper = doc.createElement('div')
    //自定义标签在 IE8 下无效. 使用 component 指令替代
    wraper.innerHTML = (tpl + '').trim();
    nodes = wraper.childNodes;
  }
  return utils.toArray(nodes);
}

module.exports = {
  tplParse: tplParse,
  createNodes: createNodes
};