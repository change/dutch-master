var cluster = require('cluster')
  , _ = require('lodash')
  , async = require('async')

module.exports = function (options) {
  var logger = options.logger
    , workers = []
    , restarting = false

  var numWorkers = _.isFunction(options.numWorkers)
    ? options.numWorkers()
    : options.numWorkers
    || 2

  cluster.setupMaster({
    exec: options.worker
  })

  logger.info({numWorkers: numWorkers}, 'Starting cluster')

  async.times(numWorkers, function (n, next) {
    newWorker(next)
  }, function (err, workers) {
    logger.info({workers: workers.length}, 'Cluster ready')
  })

  function restartAllWorkers(triggeringEvent) {
    logger.info(triggeringEvent, 'Restart requested')

    if (restarting) {
      logger.warn('Restart already in process, ignoring this request')
      return
    }

    restarting = true

    async.each(_.where(workers, {state: 'running'}), restartWorker, function (err) {
      logger.info('Restart complete')
      restarting = false
    })
  }

  function shutdown(triggeringEvent) {
    logger.info(triggeringEvent, 'Shutdown requested')

    restarting = true

    _.each(workers, function (worker) {
      worker.state = 'stopping'
    })

    var timeout = setTimeout(function () {
      logger.warn('Cluster did not shutdown cleanly within timeout, exiting')
      process.exit(1)
    }, 30000)

    cluster.disconnect(function () {
      restarting = false
      clearTimeout(timeout)
      logger.info('Cluster shutdown cleanly')
      process.exit(0)
    })
  }

  process.on('SIGUSR2', function () {
    restartAllWorkers({signal: 'SIGUSR2'})
  })

  process.on('SIGTERM', function () {
    shutdown({signal: 'SIGTERM'})
  })

  // Fork a new worker and add it to the cluster
  // invokes callback once the worker is safely online
  function newWorker(callback) {
    callback = callback || _.noop

    logger.info('Creating new worker')

    options.beforeFork && options.beforeFork()
    var clusterWorker = cluster.fork(options.workerEnvironment)

    var metaWorker = {
      id: clusterWorker.id
    , clusterWorker: clusterWorker
    , logger: logger.child({
        workerId: clusterWorker.id
      , workerPid: clusterWorker.process.pid
      })
    , state: 'starting'
    }

    workers.push(metaWorker)

    clusterWorker.once('listening', function () {
      metaWorker.logger.info('Worker listening')
      metaWorker.state = 'running'

      callback(null)
    })

    clusterWorker.on('message', function (msg) {
      if (msg.event === 'request-restart') {
        if (metaWorker.state !== 'running') {
          return
        }

        metaWorker.logger.info('Worker dying')

        restartWorker(metaWorker)
      }
    })

    clusterWorker.on('disconnect', function () {
      metaWorker.logger.info('Worker disconnected')

      if (metaWorker.state === 'starting') {
        metaWorker.logger.warn('Worker disconnected unexpectedly while starting')

        metaWorker.state = 'disconnected'
        newWorker(callback)
      }

      if (metaWorker.state === 'running') {
        metaWorker.logger.warn('Worker disconnection was unexpected')

        metaWorker.state = 'disconnected'
        newWorker()
      }

      metaWorker.state = 'disconnected'
      stopWorker(metaWorker)
    })

    clusterWorker.on('exit', function (code, signal) {
      metaWorker.logger.info({
        code: code
      , signal: signal
      }, 'Worker exited')

      if (metaWorker.killTimer) {
        clearTimeout(metaWorker.killTimer)
        metaWorker.killTimer = null
      }

      metaWorker.state = 'exited'
    })
  }

  // Bring up a new worker, then gracefully close down the supplied worker
  // then invoke the callback
  function restartWorker(metaWorker, callback) {
    metaWorker.logger.info('Restarting worker')
    metaWorker.state = 'restarting'

    newWorker(function () {
      metaWorker.logger.info('Replacement worker available - disconnecting')

      stopWorker(metaWorker)

      callback && callback(null)
    })
  }

  // Ensure a worker is dead or dying
  function stopWorker(metaWorker) {
    metaWorker.logger.debug({state: metaWorker.state}, 'Stopping worker')
    function startKillTimer() {
      return setTimeout(function () {
        if (metaWorker.state === 'exited') return

        metaWorker.logger.debug('Hard-killing worker as it did not die gracefully')

        try {
          metaWorker.clusterWorker.kill()
        } catch (err) {
          metaWorker.logger.debug(err, 'Could not kill with worker.kill()')
        }

        try {
          metaWorker.clusterWorker.process.kill()
        } catch (err) {
          metaWorker.logger.debug(err, 'Could not kill with worker.process.kill()')
        }
      }, 30000)
    }

    switch (metaWorker.state) {
      case 'disconnected':
        metaWorker.logger.debug('Killing worker')
        metaWorker.clusterWorker.kill()
        break

      case 'exited':
        break

      default:
        metaWorker.logger.debug('Disconnecting worker')
        metaWorker.clusterWorker.disconnect()
    }

    if (metaWorker.state !== 'exited') {
      metaWorker.killTimer = startKillTimer()
    }
  }
}
