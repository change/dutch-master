# Test suite

Currently this is a set of blackbox tests designed to operate against the public
API of dutch-master (which is currently: signals in, log messages out).

The tests set up a local HTTP server knows as the 'worker coordinator'. Then a
cluster is started. The 'worker' that we ask dutch-master to start for us will
immediately contact the worker coordinator to report that it has been started
and await further instructions.

With this arrangement we can drive a wide variety of failure scenarios by forcing
workers to die, not start, hang, or not exit cleanly when requested.
