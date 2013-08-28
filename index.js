var cluster = require('cluster')
  , npid = require('npid')
  , debug = require('debug')('fe:application')

var Dutch = function Dutch () {
  this.numCPUs = Math.min(require('os').cpus().length, 2)
  this.workers = []
  var fork, sendShutdown, nextWorker, handleSignal

  fork = function fork (env) {
    env = env || {NODE_PATH: './'}
    debug('forking new worker')
    cluster.fork(env)
  }

  sendShutdown = function sendShutdown (worker) {
    var workerPid = worker.process.pid
    debug('sending shutdown to worker %d', workerPid)

    try {
      worker.send('shutdown')
    } catch (e) {
      debug('unable to send shutdown to worker %d' + workerPid)
    }
  }

  nextWorker = function nextWorker () {
    var w = this.workers.pop()
    if (!w) return
    fork()
    sendShutdown(w, 3000)
  }.bind(this)

  handleSignal = function handleSignal () {
    Object.keys(cluster.workers).forEach(function (i) {
      this.workers.push(cluster.workers[i])
    }.bind(this))
    nextWorker()
  }.bind(this)

  this.init = function (workerScript, pid) {

    !workerScript && function () {
      throw new Error('a worker file must be specified')
    }()

    cluster.setupMaster({
      exec: workerScript
    })

    try {
      npid.create(process.env.PID_FILE || pid)
    }
    catch (e) {
      console.error('unable to create PID file')
      console.error(e)
      process.exit(1)
    }

    for (var i = 0; i < this.numCPUs; i++) {
      fork()
    }
  }

  cluster.on('exit', function (worker) {
    var exitCode = worker.process.exitCode
    debug('worker %d died with exit code %d', worker.process.pid, exitCode)

    !exitCode && fork()
  })

  cluster.on('online', function (worker) {
    debug('worker %d online', worker.process.pid)
    cluster.workers[worker.id].on('message', function (msg) {
      debug('worker %d ready, calling nextWorker', worker.process.pid)
      msg === 'ready' && nextWorker()
    })
  })

  process.on('SIGUSR2', function () {
    handleSignal()
  })

}

module.exports = function () {
  return new Dutch()
}
