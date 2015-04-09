var request = require('request')
  , {filter} = require('transducers.js')
  , {spawn} = require('child_process')
  , JSONStream = require('JSONStream')
  , immutable = require('immutable')
  , {chan, putAsync, timeout, alts, operations: {mult: {tap}}} = require('js-csp')

// Initiate an HTTP GET request to the specified URL. Returns a channel that
// will have a map placed on it containing the response status and body
module.exports.httpGetToChan = function (url) {
  var ch = chan()

  request.get(url, {json: {}}, (err, res, body) => {
    if (err) {
      return putAsync(ch, immutable.fromJS({err: err}))
    }

    putAsync(ch, immutable.fromJS({status: res.statusCode, body: body}))
  })

  return ch
}

// Returns a channel that will receive log messages from the specified mult
// (which issues JSON log entries) matching the specified message.
module.exports.waitForLogMessage = function (message, mult) {
  return tap(mult, chan(1, filter(x => x.msg === message)))
}

// Start the dutch-master module. Returns a map containing the PID of the master
// process, and a channel that will have log messages from the cluster placed
// upon it in JSON format (obtained by piping the masters STDOUT into a streaming
// JSON parser).
module.exports.startCluster = function (env) {
  var nodeCmd = process.execPath
    , args = [`${__dirname}/master-shim.js`]
    , stdoutCh = chan()
    , exitCh = chan()

  var ps = spawn(nodeCmd, args, {
    env: env
  , stdio: [null, 'pipe', process.stderr]
  })

  ps.on('close', code => putAsync(exitCh, {code}))

  ps.stdout
  .pipe(JSONStream.parse())
  .on('data', data => putAsync(stdoutCh, data))

  return {
    stdoutCh
  , pid: ps.pid
  , exitCh
  }
}

module.exports.takeOrTimeout = function* (ch, msg) {
  var tOut = timeout(1000)

  var val = yield alts([ch, tOut])
  if (val.channel === tOut) {
    throw new Error('Timed out while "' + msg + '"')
  }

  return val
}

module.exports.takeN = function* (ch, n) {
  var result = []

  for (let i = 0; i < n; i++) {
    result.push(yield ch)
  }

  return result
}
