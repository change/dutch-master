var cluster = require('cluster')
  , npid = require('npid')
  , pidFile = process.env.PID_FILE

process.chdir('deploy')
var frontend = require('server/app')

frontend.run(3000, function () {
  process.send('ready')
})