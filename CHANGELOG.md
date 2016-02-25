# Changelog

## v0.1.5

* Explicitly stop workers when shutting down, since cluster.disconnect does not handle workers that do not close cleanly.

* Reduce timeouts, making sure the individual worker timeout is much shorter than the cluster shutdown timeout, so the cluster won't be killed before the workers have been cleaned up.

## v0.1.4

* Only listen for worker 'listening' event once

  Modules like statsd clients that create ephemeral sockets
  can cause many 'listening' events to occur. Make sure dutch-master
  only responds to the first one.

  NOTE: Workers should ensure that the first 'listening' event that occurs
  signals their readiness to join the cluster i.e. do not create an
  ephemeral socket as part of the worker startup before starting to
  listen for actual connections.

## v0.1.3

* Fix regression introduced in v0.1.2 where `dutch-master` would crash if a worker terminated unexpectedly.
* Extra test coverage.

## v0.1.2

* Introduce functional tests
* Fix a restart bug where, during (re)start, if a worker died before entering the 'listening' state (but then its replacement began listening normally), `dutch-master` still believed it was in a 'restarting' state, so never issued the 'Cluster ready' log message, and more importantly would *ignore* further restart requests.

## v0.1.1

Initial release
