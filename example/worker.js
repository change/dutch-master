var http = require('http')

http.createServer(function (req, res) {
  res.end('hi')
}).listen(8000)
