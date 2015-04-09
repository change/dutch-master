var csp = require('js-csp')
  , assert = require('assert')
  , workerCoordinator = require('./support/worker-coordinator')
  , {startCluster, waitForLogMessage, takeOrTimeout} = require('./support/helpers')
  , {take, go, alts, timeout, operations: {mult}} = csp

function* takeN(ch, n) {
  var result = []

  for (var i = 0; i < n; i++) {
    result.push(yield ch)
  }

  return result
}

describe('worker death', function () {
  it('works', function (done) {
    go(function* () {
      let coord = workerCoordinator()
        , cluster = startCluster({COORDINATOR_PORT: yield take(coord.portCh)})
        , clusterReadyCh = waitForLogMessage('Cluster ready', mult(cluster.stdoutCh))

      let [w1, w2] = yield* takeN(coord.workerActiveCh, 2)

      coord.tellWorker(w1, 'startListening')
      coord.tellWorker(w2, 'startListening')

      yield* takeOrTimeout(clusterReadyCh, 'Waiting for Cluster Ready log message')

      coord.tellWorker(w1, 'crash')

      let w3 = yield coord.workerActiveCh
      coord.tellWorker(w3, 'startListening')

      // Make sure the cluster stays alive for a short while
      let {channel} = yield alts([cluster.exitCh, timeout(100)])
      assert.notEqual(channel, cluster.exitCh, 'Cluster exited abnormally')

      done()
    }.bind(this))
  })
})
