let assert = require('assert')
  , workerCoordinator = require('./support/worker-coordinator')
  , {startCluster, waitForLogMessage, takeOrTimeout, takeN, httpGetToChan} = require('./support/helpers')
  , {take, go, alts, timeout, operations: {mult}} = require('js-csp')

describe('worker death', function () {
  it('replaces workers that die unexpectedly', function (done) {
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

  context('worker requests a restart', function () {
    context('with a long request in progress', function () {
      it('replaces workers that request a restart', function (done) {
        go(function* () {
          let coord = workerCoordinator()
            , cluster = startCluster({numWorkers: 1, COORDINATOR_PORT: yield take(coord.portCh)})
            , clusterReadyCh = waitForLogMessage('Cluster ready', mult(cluster.stdoutCh))

          let w1 = yield coord.workerActiveCh

          let clusterPort = (yield coord.tellWorker(w1, 'startListening')).get('clusterPort')

          yield* takeOrTimeout(clusterReadyCh, 'Waiting for Cluster Ready log message')

          let longReqCh = httpGetToChan(`http://localhost:${clusterPort}/long-request`)

          coord.tellWorker(w1, 'requestRestart')

          let w2 = yield coord.workerActiveCh
          coord.tellWorker(w2, 'startListening')

          // Make sure the long-running request wasn't killed during graceful restart
          yield coord.tellWorker(w1, 'completeLongRequest')
          let longReqResponse = yield longReqCh
          assert.equal(200, longReqResponse.get('status'))

          // Make sure the cluster stays alive for a short while
          let {channel} = yield alts([cluster.exitCh, timeout(100)])
          assert.notEqual(channel, cluster.exitCh, 'Cluster exited abnormally')

          done()
        }.bind(this))
      })
    })

    context('multiple times', function () {
      it('only brings up one replacement', function (done) {
        go(function* () {
          let coord = workerCoordinator()
            , cluster = startCluster({numWorkers: 1, COORDINATOR_PORT: yield take(coord.portCh)})
            , clusterReadyCh = waitForLogMessage('Cluster ready', mult(cluster.stdoutCh))

          let w1 = yield coord.workerActiveCh
          coord.tellWorker(w1, 'startListening')

          yield* takeOrTimeout(clusterReadyCh, 'Waiting for Cluster Ready log message')

          // Request a restart multiple times in succession
          coord.tellWorker(w1, 'requestRestart')
          coord.tellWorker(w1, 'requestRestart')
          coord.tellWorker(w1, 'requestRestart')

          let w2 = yield coord.workerActiveCh
          coord.tellWorker(w2, 'startListening')

          // Make sure the cluster does not attempt to spin up more than 1 replacement worker
          let {channel} = yield alts([coord.workerActiveCh, timeout(100)])
          assert.notEqual(channel, coord.workerActiveCh, 'Cluster created too many replacement workers')

          done()
        }.bind(this))
      })
    })
  })
})
