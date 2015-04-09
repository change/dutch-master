var csp = require('js-csp')
  , immutable = require('immutable')
  , crypto = require('crypto')

module.exports = function () {
  var app = require('express')()
    , server = require('http').createServer(app)
    , instructionChMap = immutable.Map()
    , workerActiveCh = csp.chan()
    , portCh = csp.chan()

  app.use(require('body-parser').json())

  app.use((req, res, next) => {
    req.body = immutable.fromJS(req.body)
    next()
  })

  app.param('id', (req, res, next, id) => {
    req.params.id = Number(id)
    next()
  })

  // Called by a worker once it has started.
  app.post('/worker/:id/running', (req, res) => {
    instructionChMap = instructionChMap.set(req.params.id, csp.chan())
    csp.putAsync(workerActiveCh, req.params.id)
    res.end()
  })

  // Called by a worker to receive instructions on what to do. Long-polls
  // until an action is available.
  app.get('/worker/:id', (req, res) => {
    var instructionCh = instructionChMap.get(req.params.id)

    csp.go(function* () {
      res.json(yield csp.take(instructionCh))
    })
  })

  function requestToChan(method, path) {
    var ch = csp.chan()

    app[method](path, (req, res) => {
      csp.putAsync(ch, req.body)
      ch.close()
      res.end()
    })

    return ch
  }

  server.listen(null, () => {
    csp.putAsync(portCh, server.address().port)
  })

  return {
    // Channel that will have the port number of this coordinator placed
    // on it once it starts listening
    portCh: portCh

    // Channel that has a workerId placed on it each time a new worker
    // becomes active
  , workerActiveCh: workerActiveCh

    // Issues an instruction to the specified worker id, returns a channel that
    // will have a map placed on it containing the response from the worker
  , tellWorker: function (workerId, action, RecordType) {
      return csp.go(function* () {
        var instructionId = crypto.randomBytes(16).toString('hex')
          , completionUrl = '/instruction/' + instructionId + '/complete'
          , completeCh = requestToChan('post', completionUrl, RecordType)

        yield csp.put(instructionChMap.get(workerId), {action, completionUrl})

        return yield csp.take(completeCh)
      })
    }
  }
}
