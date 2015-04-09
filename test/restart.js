var csp = require('js-csp')
  , assert = require('assert')
  , immutable = require('immutable')
  , workerCoordinator = require('./support/worker-coordinator')
  , helpers = require('./support/helpers')

function assertRestart(numWorkers) {
  afterEach(function () {
    process.kill(this.cluster.pid, 'SIGKILL')
  })

  context('with a long request in progress', function () {
    beforeEach(function () {
      this.longRequestCh = helpers.httpGetToChan('http://localhost:' + this.clusterPort + '/long-request')
    })

    describe('restart', function () {
      beforeEach(function (done) {
        csp.go(function* () {
          var restartCompleteCh = helpers.waitForLogMessage('Restart complete', this.logMult)

          this.workerSigtermChans = this.initialWorkerIds.map(id => {
            return this.coordinator.requestToChan('post', '/worker/' + id + '/signal/SIGTERM')
          })

          process.kill(this.cluster.pid, 'SIGUSR2')

          // Wait for replacement workers to come online
          this.newWorkerIds = immutable.Set()
          for (var i = 0; i < numWorkers; i++) {
            this.newWorkerIds = this.newWorkerIds.add(yield csp.take(this.coordinator.workerActiveCh))
          }

          yield csp.take(this.coordinator.tellWorkers(this.newWorkerIds, 'startListening'))

          yield csp.take(restartCompleteCh)
          this.coordinator.tellWorkers(this.initialWorkerIds, 'completeLongRequest')
          done()
        }.bind(this))
      })

      it('should complete the long request successfully', function (done) {
        csp.go(function* () {
          var longReqResponse = yield csp.take(this.longRequestCh)
          assert.equal(200, longReqResponse.get('status'))
          done()
        }.bind(this))
      })

      it('new requests should be handled by the new workers', function (done) {
        csp.go(function* () {
          var helloWorldResp = yield csp.take(helpers.httpGetToChan('http://localhost:' + this.clusterPort + '/'))
          assert.equal(200, helloWorldResp.get('status'))
          assert(
            this.newWorkerIds.contains(helloWorldResp.getIn(['body', 'workerId']))
          , 'Request was handled by an OLD worker'
          )
          done()
        }.bind(this))
      })

      it('should send SIGTERM to the old workers', function (done) {
        csp.go(function* () {
          var merged = csp.operations.merge(this.workerSigtermChans.toArray())

          for (var i = 0; i < this.workerSigtermChans.count(); i++) {
            yield csp.take(merged)
          }

          done()
        }.bind(this))
      })
    })
  })
}

context('all workers running normally', function () {
  var numWorkers = 2

  beforeEach(function (done) {
    csp.go(function* () {
      this.coordinator = workerCoordinator()

      this.cluster = helpers.startCluster({
        COORDINATOR_PORT: yield csp.take(this.coordinator.portCh)
      })

      this.logMult = csp.operations.mult(this.cluster.stdoutCh)
      this.clusterReadyCh = helpers.waitForLogMessage('Cluster ready', this.logMult)

      done()
    }.bind(this))
  })

  context('having started successfully', function () {
    beforeEach(function (done) {
      csp.go(function* () {
        // Wait for workers to be started by the cluster
        var workerIds = []
        for (var i = 0; i < numWorkers; i++) {
          workerIds.push(yield csp.take(this.coordinator.workerActiveCh))
        }
        this.initialWorkerIds = immutable.Set(workerIds)


        // Tell workers to start listening
        var listeningCh = this.coordinator.tellWorkers(this.initialWorkerIds, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield csp.take(listeningCh)).map(x => x.get('clusterPort')).first()

        yield* helpers.takeOrTimeout(this.clusterReadyCh, 'Waiting for Cluster Ready log message')

        done()
      }.bind(this))
    })

    assertRestart(numWorkers)
  })

  context('after one worker fails to start one time', function() {
    beforeEach(function(done) {
      csp.go(function*() {
        // Wait for workers to be started by the cluster
        var workerIds = []
        for (var i = 0; i < numWorkers; i++) {
          workerIds.push(yield csp.take(this.coordinator.workerActiveCh))
        }
        this.initialWorkerIds = immutable.Set(workerIds)

        // Tell one worker to crash
        var badWorkerId = this.initialWorkerIds.first()
        this.coordinator.tellWorker(badWorkerId, 'crash')

        // Tell the other workers to start listening
        var goodWorkerIds = this.initialWorkerIds.rest()
        this.coordinator.tellWorkers(goodWorkerIds, 'startListening')

        // Wait for another worker to come online
        var replacementWorkerId = yield csp.take(this.coordinator.workerActiveCh)
        this.initialWorkerIds = this.initialWorkerIds.add(replacementWorkerId).delete(badWorkerId)

        // Tell that worker to start listening
        var listeningCh = this.coordinator.tellWorker(replacementWorkerId, 'startListening')

        // Grab the port that the cluster is listening on
        this.clusterPort = (yield csp.take(listeningCh)).map(x => x.get('clusterPort')).first()

        yield* helpers.takeOrTimeout(this.clusterReadyCh, 'Waiting for Cluster Ready log message')

        done()
      }.bind(this))
    })

    assertRestart(numWorkers)
  })
})
