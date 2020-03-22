/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 * 
 * @param {Array} middleware
 * @return {Function}
 */
function compose(middleware) {
  return (ctx) => {
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