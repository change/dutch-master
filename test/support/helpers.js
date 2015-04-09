var request = require('request')
  , csp = require('js-csp')
  , transducers = require('transducers.js')
  , spawn = require('child_process').spawn
  , JSONStream = require('JSONStream')
  , immutable = require('immutable')
  , filter = transducers.filter
  , tap = csp.operations.mult.tap

// Initiate an HTTP GET request to the specified URL. Returns a channel that
// will have a map placed on it containing the response status and body
module.exports.httpGetToChan = function (url) {
  var ch = csp.chan()

  request.get(url, {json: {}}, (err, res, body) => {
    if (err) {
      return csp.putAsync(ch, immutable.fromJS({err: err}))
    }

    csp.putAsync(ch, immutable.fromJS({status: res.statusCode, body: body}))
  })

  return ch
}

// Returns a channel that will receive log messages from the specified mult
// (which issues JSON log entries) matching the specified message.
module.exports.waitForLogMessage = function (message, mult) {
  return tap(mult, csp.chan(1, filter(x => x.msg === message)))
}

// Start the dutch-master module. Returns a map containing the PID of the master
// process, and a channel that will have log messages from the cluster placed
// upon it in JSON format (obtained by piping the masters STDOUT into a streaming
// JSON parser).
module.exports.startCluster = function (env) {
  var nodeCmd = process.execPath
    , args = [__dirname + '/master-shim.js']
    , stdoutCh = csp.chan()
    , exitCh = csp.chan()

  var ps = spawn(nodeCmd, args, {
    env: env
  , stdio: [null, 'pipe', process.stderr]
  })

  ps.on('close', code => csp.putAsync(exitCh, {code}))

  ps.stdout
  .pipe(JSONStream.parse())
  .on('data', data => csp.putAsync(stdoutCh, data))

  return {
    stdoutCh
  , pid: ps.pid
  , exitCh
  }
}

module.exports.takeOrTimeout = function* (ch, msg) {
  var timeout = csp.timeout(1000)

  var val = yield csp.alts([ch, timeout])
  if (val.channel === timeout) {
    throw new Error('Timed out while "' + msg + '"')
  }

  return val
}
