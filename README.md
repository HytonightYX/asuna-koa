# asuna-koa

## 1 套用 http，跑个服务先

`lib/application.js`

```javascript
const { createServer } = require('http')

class Application {
  constructor() {
    this.middleware = []
  }

  // 添加中间件 app.use(...)
  use(fn) {
    // 将中间件函数添加到 middleware 中
    this.middleware.push(fn)
  }

  listen(...args) {
    const server = createServer((req, res) => {
      /*
        处理请求的回调函数，在这里执行所有中间件函数
        req 是 node 原生的 request 对象
        res 是 node 原生的 response 对象
      */
      this.middleware.forEach(fn => fn(req, res))
    })
    server.listen(...args)
  }
}

module.exports = Application
```

`app.js`

```js
const Koa = require('./lib/application')
const app = new Koa()

app.use((req, res) => {
  console.log('----中间件1----')
})

app.use((req, res) => {
  console.log('----中间件2----')
  res.end('yunxi')
})

app.listen(3000)

/*
  ----中间件1----
  ----中间件2----
  ----中间件1----
  ----中间件2----
 */
```

## 2 实现 context

我们会发现 koa 的路由写法中，传入的参数是 `(ctx, next)` 而不是 `(req, res)` ，因此做一些封装。

下面先搞出 ctx。ctx 是一个上下文对象，里面绑定了很多请求和相应相关的数据和方法，例如`ctx.path`、`ctx.query`、`ctx.body()`等等等等，极大的为开发提供了便利。

`lib/application.js`

```js
class Application {
  constructor() {
    this.middleware = []
    this.context = Object.create(context)
    this.request = Object.create(request)
    this.response = Object.create(response)
  }

  ...

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
```

为了测试挂载的情况，我们写个中间件

`app.js`

```js
app.use((ctx, next) => {
  console.log('----中间件1----')
  console.log(ctx.req.url)
  console.log(ctx.request.req.url)
  console.log(ctx.response.req.url)
  console.log(ctx.request.url)
  console.log(ctx.request.path)
  console.log(ctx.url)
  console.log(ctx.path)
  console.log(ctx.query)
})
```

好了，访问 `http://localhost:3000/abc?a=1`

![image-20200322211032790](http://qn-noter.yunxi.site/imagehost/z2vcf.png)

显然，我们还需要挂载 `ctx.request.xxx`，`ctx.url`，`ctx.path`，`ctx.query`。那这个怎么实现呢？

## 3 实现 request

对照源码，不管怎么说，这些东西总是有的：

`lib/request.js`

```js
const url = require('url')

const request = {
  get url() {
    return this.req.url
  },

  get path() {
    return url.parse(this.req.url).pathname
  },

  get query() {
    return url.parse(this.req.url).query
  }
}

module.exports = request
```

一个关键点来了，委托！

`lib/context.js`

```js
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
```

`delegates` 是 TJ 写的一个库，可以指定对象的属性和方法委托到目标对象上。用法如上文所示。

好了，引入这些文件，再试试：

`lib/application.js`

```js
const { createServer } = require('http')
const context = require('./context')
const request = require('./request')
const response = require('./response')
...


class Application {
  constructor() {
    this.middleware = []
    this.context = Object.create(context)
    this.request = Object.create(request)
    this.response = Object.create(response)
  }
  ...
}
```

再来跑一遍！

![image-20200322184324053](http://qn-noter.yunxi.site/imagehost/pnt7b.png)

全都有了！

## 4 洋葱之心：`compose()` 和 `next()`

koa2 创建 http 服务函数，会发现多次调用 use 函数，其实这就是洋葱模型的应用。

> 洋葱是由很多层组成的,你可以把每个中间件看作洋葱里的一层,根据 app.use 的调用顺序中间件由外层到里层组成了整个洋葱,整个中间件执行过程相当于由外到内再到外地穿透整个洋葱。

![image-20200322191533029](http://qn-noter.yunxi.site/imagehost/x5tg5.png)

每次执行 use 函数，我们实际是往一个`middleware` 数组中添加了一个函数，然后再次通过一个 `compose` 函数，处理添加进来函数的执行顺序，也就是这个 `compose` 函数实现了洋葱模型机制。

你可能发现了，我们现在才写了一个中间件，如果再加一个，koa 中我们需要用到 `next()` 方法。

`lib/application.js`

```js
{
  // ...
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
      fn(ctx).then(() => {
        console.log('TODO: 准备返回响应')
      })
    }

    return handleRequest
  }
  // ...
}
```

`util/koa-compose.js`

```js
/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 */
function compose(middleware) {
  return ctx => {
    function dispatch(i) {
      let fn = middleware[i]
      if (!fn) return Promise.resolve()

      /**
       * 对比中间件和下面这行的写法:
       * app.use((ctx, next) => {...; next())
       *
       * fn(ctx, dispatch.bind(null, i + 1))
       *
       * 很明显，我们把 dispatch.bind(null, i + 1)) 传给了 next，
       * 那么执行 next() 也就是执行了 dispatch.bind(null, i + 1))
       * 所以，我们每次调用 next() 就是在执行下一个中间件函数
       */
      return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)))
    }

    // 执行第一个中间件，后续通过递归执行
    return dispatch(0)
  }
}

module.exports = { compose }
```

这就是 `compose` 函数，简单而精妙~，划重点：

我们把 `dispatch.bind(null, i + 1))` 传给了 `next`，那么执行 next() 也就是执行了 `dispatch.bind(null, i + 1))`。所以，我们每次调用 `next()` 就是在执行下一个中间件函数

好了，可以测试一下有没有做好

`app.js`

```js
app.use(async (ctx, next) => {
  console.log('----中间件1----')
  await next()
})

app.use(async (ctx, next) => {
  console.log('----中间件2----')
  // await next() --> 故意不加 next()
})

app.use(async (ctx, next) => {
  console.log('----中间件3----')
})
```

![image-20200322192624524](http://qn-noter.yunxi.site/imagehost/ynhsm.png)

印证了我们的想法。

## 5 处理 response

你应该发现了，我们每次访问 3000 端口，网页都是刷不出来的，一直在转圈 ，这是因为我们没有给它返回响应（response）。

`lib/response.js`

```js
const response = {
  get body() {
    return this._body
  },

  set body(value) {
    this.res.statusCode = 200
    this._body = value
  }
}

module.exports = response
```

简易版的，先不要太抠细节。下一篇会进行源码分析～

`lib/application.js`

```js
class Application {
  ...
  callback() {
    const fn = compose(this.middleware)
    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res)
      const handleResponse = () => respond(ctx)
      fn(ctx).then(handleResponse).catch(err => console.log(err))
    }

    return handleRequest
  }
	...
}

// 简易版响应处理
function respond(ctx) {
  const body = ctx.body
  ctx.res.end(typeof body === 'object' ? JSON.stringify(body) : body)
}
```

好啦，测试一下

`app.js`

```js
app.use(async (ctx, next) => {
  console.log('----1----')
  await next()
  console.log('----2----')
})

app.use(async (ctx, next) => {
  console.log('----3----')
  await next()
  console.log('----4----')
})

app.use(async (ctx, next) => {
  console.log('----5----')
  ctx.body = '<h1>I am Yunxi</h1>'
  await next()
  console.log('----6----')
})
```

![image-20200322205903297](http://qn-noter.yunxi.site/imagehost/hpkd4.png)

![image-20200322210105792](http://qn-noter.yunxi.site/imagehost/jx9wn.png)

没毛病。
