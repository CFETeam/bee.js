"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  , scope = require('../scope')
  ;

//这些数组操作方法被重写成自动触发更新
var arrayMethods = ['splice', 'push', 'pop', 'shift', 'unshift', 'sort', 'reverse'];

module.exports = {
  priority: 1000
, anchor: true
, terminal: true
, unLink: function(){
    this.vmList.forEach(function(vm){
      vm.$destroy()
    })
  }
, link: function() {
    var Bee = require('../bee')

    this.trackId = this.el.getAttribute('track-by')
    this.el.removeAttribute('track-by')

    //创建 repeat 的匿名构造函数
    //继承父构造函数的 `directives, components, filters` 属性
    this.cstr = Bee.extend({}, this.vm.constructor)

    //默认数据不应继承
    this.cstr.defaults = {};

    this.curArr = [];
    this.vmList = [];//子 VM list

    if(this.el.content) {
      this.frag = this.el.content;
      this.isRange = true
    }else{
      this.frag = this.el;
    }
    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    var that = this, vmList = this.vmList;
    var trackId = this.trackId;

    //TODO 将数组修饰移至所有表达式中
    var arrs = []; //repeat 表达式中出现的数组

    if(utils.isArray(items)) {
      // 在 repeat 指令表达式中相关变量
      this.listPath = this.summary.paths.filter(function(path) {
        return !utils.isFunction(that.vm.$get(path))
      });

      //删除元素
      arrDiff(curArr, items, trackId).forEach(function(item) {
        var pos = indexByTrackId(item, curArr, trackId)
        curArr.splice(pos, 1)

        if(that.isRange) {
          getNodesByIndex(that, pos).forEach(function(node) {
            parentNode.removeChild(node)
          })
        }else{
          parentNode.removeChild(vmList[pos].$el)
        }
        vmList[pos].$destroy()
        vmList.splice(pos, 1)
      })

      items.forEach(function(item, i) {
        var pos = indexByTrackId(item, items, trackId, i)
          , oldPos = indexByTrackId(item, curArr, trackId, i)
          , vm, el, anchor
          ;

        //新增元素
        if(oldPos < 0) {

          el = this.frag.cloneNode(true)

          if(this.isRange) {
            anchor = doc.createComment('')
            el.childNodes.length ? el.insertBefore(anchor, el.childNodes[0]) : el.appendChild(anchor)
          }

          vm = new this.cstr(el, {
            $data: item,
            $index: pos,
            $root: this.vm.$root,
            $parent: this.vm,
            $context: this.vm.$context,
            _assignments: this.summary.assignments,
            __repeat: true,
            __anchor: anchor,
            __vmList: this.vmList
          });

          parentNode.insertBefore(vm.$el, getAnchor(that, pos))
          vmList.splice(pos, 0, vm);
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {

            parentNode.insertBefore(getElByIndex(that, oldPos), getAnchor(that, pos))
            parentNode.insertBefore(getElByIndex(that, pos), getAnchor(that, oldPos + 1))

            vmList[oldPos] = [vmList[pos], vmList[pos] = vmList[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            vmList[pos].$index = pos
            vmList[pos].$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      vmList.forEach(function(vm, i) {
        vm.$index = i
        vm.$el.$index = i
        vm.$update('$index', false)
      });

      this.listPath.forEach(function(localKey) {
        var local = that.vm.$get(localKey)
        utils.isArray(local) && arrs.push(local)
      })
      arrs.push(items)
      arrs.forEach(function(local) {
        var dirs = local.__dirs__;

        if(!dirs){
          //数组操作方法
          utils.extend(local, {
            $set: function(i, item) {
              local.splice(i, 1, utils.isObject(item) ? utils.extend({}, local[i], item) : item)
            },
            $replace: function(i, item) {
              local.splice(i, 1, item)
            },
            $remove: function(i) {
              local.splice(i, 1);
            }
          });
          arrayMethods.forEach(function(method) {
            local[method] = utils.afterFn(local[method], function() {
              dirs.forEach(function(dir) {
                dir.listPath.forEach(function(path) {
                  var reformed = scope.reformScope(dir.vm, path)
                  reformed.vm.$update(reformed.path)
                })
              })
            })
          });
          dirs = local.__dirs__  = [];
        }
        //一个数组多处使用
        //TODO 移除时的情况
        if(dirs.indexOf(that) === -1) {
          dirs.push(that)
        }
      })

    }else{
      //TODO 普通对象的遍历
    }
  }
};

function getAnchor(dir, index) {
  var vm = dir.vmList[index]
  return vm ? ( dir.isRange ? vm.__anchor : vm.$el ) : dir.anchors.end
}

//根据索引获取该次迭代中的所有元素
function getNodesByIndex(dir, index) {
  var vmList = dir.vmList
    , anchor = vmList[index].__anchor
    , next = vmList[index + 1]
    ;
  return [anchor].concat(dir.getNodes(anchor, next && next.__anchor))
}

function getElByIndex (dir, index) {
  var frag = doc.createDocumentFragment()
  if(dir.isRange) {
    getNodesByIndex(dir, index).forEach(function(node) {
      frag.appendChild(node)
    })
  }else{
    frag.appendChild(dir.vmList[index].$el)
  }
  return frag
}

function arrDiff(arr1, arr2, trackId) {
  var arr2Copy = arr2.slice();
  return arr1.filter(function(el) {
    var result, index = indexByTrackId(el, arr2Copy, trackId)
    if(index < 0) {
      result = true
    }else{
      arr2Copy.splice(index, 1)
    }
    return result
  })
}

function indexByTrackId(item, list, trackId, startIndex) {
  startIndex = startIndex || 0;
  var index = list.indexOf(item, startIndex);
  if(index === -1 && trackId){
    for(var i = startIndex, item1; item1 = list[i]; i++) {
      if(item[trackId] ===  item1[trackId] && !utils.isUndefined(item[trackId])){
        index = i;
        break;
      }
    }
  }
  return index;
}
