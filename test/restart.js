let assert = require('assert')
  , immutable = require('immutable')
  , workerCoordinator = require('./support/worker-coordinator')
  , {startCluster, waitForLogMessage, takeOrTimeout, httpGetToChan} = require('./support/helpers')
  , {go, take, operations: {merge, mult}} = require('js-csp')

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

          this.workerSigtermChans = this.initialWorkerIds.map(id => {
            return this.coordinator.requestToChan('post', `/worker/${id}/signal/SIGTERM`)
          })

          process.kill(this.cluster.pid, 'SIGUSR2')

          // Wait for replacement workers to come online
          this.newWorkerIds = immutable.Set()
          for (let i = 0; i < numWorkers; i++) {
            this.newWorkerIds = this.newWorkerIds.add(yield take(this.coordinator.workerActiveCh))
          }

          yield take(this.coordinator.tellWorkers(this.newWorkerIds, 'startListening'))

          yield take(restartCompleteCh)
          this.coordinator.tellWorkers(this.initialWorkerIds, 'completeLongRequest')
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
            this.newWorkerIds.contains(helloWorldResp.getIn(['body', 'workerId']))
          , 'Request was handled by an OLD worker'
          )
          done()
        }.bind(this))
      })

      it('should send SIGTERM to the old workers', function (done) {
        go(function* () {
          let merged = merge(this.workerSigtermChans.toArray())

          for (let i = 0; i < this.workerSigtermChans.count(); i++) {
            yield take(merged)
          }

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
        let workerIds = []
        for (let i = 0; i < numWorkers; i++) {
          workerIds.push(yield take(this.coordinator.workerActiveCh))
        }
        this.initialWorkerIds = immutable.Set(workerIds)


        // Tell workers to start listening
        let listeningCh = this.coordinator.tellWorkers(this.initialWorkerIds, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield take(listeningCh)).map(x => x.get('clusterPort')).first()

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
        let workerIds = []
        for (let i = 0; i < numWorkers; i++) {
          workerIds.push(yield take(this.coordinator.workerActiveCh))
        }
        this.initialWorkerIds = immutable.Set(workerIds)

        // Tell one worker to crash
        let badWorkerId = this.initialWorkerIds.first()
        this.coordinator.tellWorker(badWorkerId, 'crash')

        // Tell the other workers to start listening
        let goodWorkerIds = this.initialWorkerIds.rest()
        this.coordinator.tellWorkers(goodWorkerIds, 'startListening')

        // Wait for another worker to come online
        let replacementWorkerId = yield take(this.coordinator.workerActiveCh)
        this.initialWorkerIds = this.initialWorkerIds.add(replacementWorkerId).delete(badWorkerId)

        // Tell that worker to start listening
        let listeningCh = this.coordinator.tellWorker(replacementWorkerId, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield take(listeningCh)).get('clusterPort')

        yield* takeOrTimeout(this.clusterReadyCh, 'Waiting for Cluster Ready log message')

        done()
      }.bind(this))
    })

    assertRestart(numWorkers)
  })
})
