require('dutch-master').start({
  worker: 'app.js',
  beforeFork: function () {
    process.chdir('/deploys/app/current')
  },
  numWorkers: function () {
    return Math.min(require('os').cpus().length, 2)
  },
  logger: require('bunyan')({name: 'my-app'}),
  workerEnvironment: {
    NODE_ENV: 'production'
  }
})
