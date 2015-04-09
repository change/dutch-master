let assert = require('assert')
  , immutable = require('immutable')
  , workerCoordinator = require('./support/worker-coordinator')
  , {startCluster, waitForLogMessage, takeOrTimeout, httpGetToChan} = require('./support/helpers')
  , {go, take, operations: {mult}} = require('js-csp')

function assertRestart(numWorkers) {
  afterEach(function () {
    process.kill(this.cluster.pid, 'SIGKILL')
  })

  context('with a long request in progress', function () {
    beforeEach(function () {
      this.longRequestCh = httpGetToChan(`http://localhost:${this.clusterPort}/long-request`)
    })

    describe('restart', function () {
      beforeEach(function (done) {
        go(function* () {
          let restartCompleteCh = waitForLogMessage('Restart complete', this.logMult)

          this.w1SigtermCh = this.coordinator.tellWorker(this.w1, 'notifySigterm')
          this.w2SigtermCh = this.coordinator.tellWorker(this.w2, 'notifySigterm')

          process.kill(this.cluster.pid, 'SIGUSR2')

          // Wait for replacement workers to come online
          this.w3 = yield take(this.coordinator.workerActiveCh)
          this.w4 = yield take(this.coordinator.workerActiveCh)

          yield take(this.coordinator.tellWorker(this.w3, 'startListening'))
          yield take(this.coordinator.tellWorker(this.w4, 'startListening'))

          yield take(restartCompleteCh)

          this.coordinator.tellWorker(this.w1, 'completeLongRequest')
          this.coordinator.tellWorker(this.w2, 'completeLongRequest')
          done()
        }.bind(this))
      })

      it('should complete the long request successfully', function (done) {
        go(function* () {
          let longReqResponse = yield take(this.longRequestCh)
          assert.equal(200, longReqResponse.get('status'))
          done()
        }.bind(this))
      })

      it('new requests should be handled by the new workers', function (done) {
        go(function* () {
          let helloWorldResp = yield take(httpGetToChan(`http://localhost:${this.clusterPort}/`))
          assert.equal(200, helloWorldResp.get('status'))
          assert(
            immutable.Set([this.w3, this.w4]).contains(helloWorldResp.getIn(['body', 'workerId']))
          , 'Request was handled by an OLD worker'
          )
          done()
        }.bind(this))
      })

      it('should send SIGTERM to the old workers', function (done) {
        go(function* () {
          yield* takeOrTimeout(this.w1SigtermCh, 'Waiting for w1 to receive SIGTERM')
          yield* takeOrTimeout(this.w2SigtermCh, 'Waiting for w2 to receive SIGTERM')

          done()
        }.bind(this))
      })
    })
  })
}

context('all workers running normally', function () {
  let numWorkers = 2

  beforeEach(function (done) {
    go(function* () {
      this.coordinator = workerCoordinator()

      this.cluster = startCluster({
        COORDINATOR_PORT: yield take(this.coordinator.portCh)
      })

      this.logMult = mult(this.cluster.stdoutCh)
      this.clusterReadyCh = waitForLogMessage('Cluster ready', this.logMult)

      done()
    }.bind(this))
  })

  context('having started successfully', function () {
    beforeEach(function (done) {
      go(function* () {
        // Wait for workers to be started by the cluster
        this.w1 = yield take(this.coordinator.workerActiveCh)
        this.w2 = yield take(this.coordinator.workerActiveCh)

        // Tell workers to start listening
        let listeningCh = this.coordinator.tellWorker(this.w1, 'startListening')
        this.coordinator.tellWorker(this.w2, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield take(listeningCh)).get('clusterPort')

        yield* takeOrTimeout(this.clusterReadyCh, 'Waiting for Cluster Ready log message')

        done()
      }.bind(this))
    })

    assertRestart(numWorkers)
  })

  context('after one worker fails to start one time', function() {
    beforeEach(function(done) {
      go(function*() {
        // Wait for workers to be started by the cluster
        let w1a = yield take(this.coordinator.workerActiveCh)
        this.w2 = yield take(this.coordinator.workerActiveCh)

        // Tell one worker to crash
        this.coordinator.tellWorker(w1a, 'crash')

        // Tell the other worker to start listening
        this.coordinator.tellWorker(this.w2, 'startListening')

        // Wait for another worker to come online
        this.w1 = yield take(this.coordinator.workerActiveCh)

        // Tell that worker to start listening
        let listeningCh = this.coordinator.tellWorker(this.w1, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield take(listeningCh)).get('clusterPort')

        yield* takeOrTimeout(this.clusterReadyCh, 'Waiting for Cluster Ready log message')

        done()
      }.bind(this))
    })

    assertRestart(numWorkers)
  })
})
