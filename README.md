# dutch-master

> Pass on the left hand side. - @luk-

Wraps the Node cluster module to provide a full HTTP clustering solution with
lifecycle management for workers.

## Install:
```bash
$ npm install --save dutch-master
```

## Usage

Create a 'master' script e.g. `master.js`:

```js
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
```

`app.js` should be a regular Node/Express/etc app:

```js
var app = require('express')()

app.get('/', function (req, res) {
  res.send('Hello world')
})

app.listen(8000)
```

## Function: `start`

Options:

* `worker`: Name of script to pass to `cluster` that will be invoked as many times
as `numWorkers`.
* `numWorkers`: The number of workers that the cluster will attempt to keep running.
Either an integer, or a callback returning an integer. Optional, defaults to 2.
* `beforeFork`: Supply a callback that will be run by the master process each time
it is about to create a new worker. If you're using `capistrano` this is a great
place to `chdir` to a newly symlinked release directory. Optional.
* `logger`: A [bunyan](https://github.com/trentm/node-bunyan) logger instance.
* `workerEnvironment`: Object describing the environment variables that the worker
will have access to. Passed directly to `cluster.fork`. Optional, defaults to `{}`

## Signal: `SIGUSR2`

Initiates a rolling restart when received.

## Signal: `SIGTERM`

Initiates a graceful stop of all workers, then exits.

## Message: `{event: 'request-restart'}`

A worker can signal to `dutch-master` that it needs to be restarted. Typically
this would be in response to a top-level error handler being triggered by an
uncaught error, meaning that the app is in an inconsistent state but is still
capable of finishing in-flight requests. As the section below explains, a
replacement worker will be started, and once it is ready, the worker that
requested the restart will be stopped gracefully.

Example usage:

```js
// Middleware to isolate each request into its own domain
app.use(function (req, res, next) {
  var d = domain.create()
  d.add(req)
  d.add(res)

  d.on('error', function (err) {
    next(err)
    process.send({event: 'request-restart'})
  })

  d.run(next)
})
```

## Stopping and starting workers

Workers will be stopped, when necessary, by calling
 [`disconnect`](http://nodejs.org/api/cluster.html#cluster_worker_disconnect) on
them. If they are still alive after 30 seconds, `dutch-master` will attempt to
kill the worker process.

No worker is stopped until a replacement worker is available (i.e. has fired
it's `listening` event). This makes `dutch-master` suitable for applications that
are slow to start up. This does not apply when performing a graceful stop invoked
by `SIGTERM`.
