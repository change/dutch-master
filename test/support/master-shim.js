// Shim for running dutch-master so it can be run out of process and shut down
// without killing the test process

require('../../')({
  worker: __dirname + '/worker.js',
  numWorkers: process.env.numWorkers || 2,
  logger: require('bunyan').createLogger({
    name: 'shim'
  }),
  workerEnvironment: process.env
})
