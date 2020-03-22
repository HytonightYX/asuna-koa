const Koa = require('./lib/application')
const app = new Koa()

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

app.listen(3000)