var app = require('express')()

// Middleware to isolate each request into its own domain
app.use(function (req, res, next) {
  var d = require('domain').create()
  d.add(req)
  d.add(res)

  d.on('error', function (err) {
    next(err)
    process.send({event: 'request-restart'})
  })

  d.run(next)
})

app.get('/', function (req, res) {
  res.send('Hello world')
})

app.listen(8000)
