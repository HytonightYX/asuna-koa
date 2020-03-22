const { createServer } = require('http')
const { compose } = require('../util/koa-compose')
const context = require('./context')
const request = require('./request')
const response = require('./response')

class Application {
  constructor() {
    this.middleware = []
    this.context = Object.create(context)
    this.request = Object.create(request)
    this.response = Object.create(response)
  }

  // 添加中间件 app.use(...)
  use(fn) {
    // 将中间件函数添加到 middleware 中
    this.middleware.push(fn)
  }

  listen(...args) {
    const server = createServer(this.callback())
    return server.listen(...args)
  }

  callback() {
    const fn = compose(this.middleware)
    // 调用该函数，返回值为promise对象
    // then方法触发了, 说明所有中间件函数都被调用完成
    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res)
      const handleResponse = () => respond(ctx)
      fn(ctx).then(handleResponse).catch(err => console.log(err))
    }

    return handleRequest
  }

  /**
   * 初始化新的上下文 ctx
   */
  createContext(req, res) {
    // 使用Object.create方法是为了继承this.context但在增加属性时不影响原对象
    const context = Object.create(this.context)
    const request = context.request = Object.create(this.request)
    const response = context.response = Object.create(this.response)
    // 下面一段代码就是将一堆变量挂载到 ctx，提供相当多的方法访问 req, res 等等
    context.app = request.app = response.app = this
    context.req = request.req = response.req = req
    context.res = request.res = response.res = res
    request.ctx = response.ctx = context
    request.response = response
    response.request = request
    return context
  }
}

function respond(ctx) {
  const body = ctx.body
  ctx.res.end(typeof body === 'object' ? JSON.stringify(body) : body)
}

module.exports = Application