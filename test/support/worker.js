// This fake worker gets invoked by dutch-master, and performs actions we tell
// it to via communications with the worker-coordinator.

// This is not run through the 6to5 compiler so no ES6 syntax is available.

// All stdout output from the master process (and hence, this script) will be
// parsed by a streaming JSON parser to interpret log output. If you need to add
// logging in here for diagnostic purposes, use `console.error`.

var request = require('request')
  , when = require('when')
  , cluster = require('cluster')
  , immutable = require('immutable')

var app = require('express')()
  , server = require('http').createServer(app)
  , coordinatorUrl = 'http://localhost:' + process.env.COORDINATOR_PORT
  , workerInfoUrl = coordinatorUrl + '/worker/' + cluster.worker.id
  , sharedState = immutable.Map()

function ensureLongReqState() {
  if (!sharedState.has('longRequestDefer')) {
    sharedState = sharedState.set('longRequestDefer', when.defer())
  }

  return sharedState.get('longRequestDefer')
}

// Simple happy-path endpoint
app.get('/', function (req, res) {
  res.json({workerId: cluster.worker.id})
})

// This endpoint will not complete until we receive an instruction to do so
app.get('/long-request', function (req, res) {
  ensureLongReqState().promise.done(function () {
    sharedState = sharedState.delete('longRequestDefer')
    res.json({
      workerId: cluster.worker.id
    })
  })
})

// Notify the coordinator that we are running
request.post(workerInfoUrl + '/running', waitForInstruction)

// Long-poll for instructions
function waitForInstruction() {
  request.get(workerInfoUrl, {json: {}}, function (err, res, body) {
    if (err) return

    if (body.action === 'startListening' && !sharedState.get('listening')) {
      sharedState = sharedState.set('listening', true)

      server.listen(null, function () {
        request.post(coordinatorUrl + body.completionUrl, {
          json: {
            clusterPort: server.address().port
          }
        })
      })
    }

    if (body.action === 'notifySigterm') {
      process.on('SIGTERM', function () {
        request.post(coordinatorUrl + body.completionUrl, function () {
          process.exit(143)
        })
      })
    }

    if (body.action === 'completeLongRequest') {
      request.post(coordinatorUrl + body.completionUrl)
      ensureLongReqState().resolve()
    }

    if (body.action === 'crash') {
      request.post(coordinatorUrl + body.completionUrl)
      process.exit(1)
    }

    waitForInstruction()
  })
}
