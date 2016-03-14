require('..')({
  worker: 'worker.js',
  beforeFork: function () {
    process.chdir('/deploys/app/current')
  },

  // Calculate number of workers at startup
  numWorkers: function () {
    return Math.max(require('os').cpus().length, 2)
  },

  // Or use a static number
  // numWorkers: 2

  logger: require('bunyan')({name: 'my-app'}),
  workerEnvironment: {
    NODE_ENV: 'production'
  }
})
