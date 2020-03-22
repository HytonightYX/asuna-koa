const delegate = require('delegates')

const proto = {}
// 将 response 对象的属性和方法委托到 proto 上
delegate(proto, 'response')
  .method('set')
  .access('status')
  .access('body')

// 将 request 对象上的属性和方法委托到 proto 上
delegate(proto, 'request')
  .access('query')
  .access('url')
  .access('path')
  .getter('headers')

module.exports = proto