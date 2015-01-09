# Changelog

## v0.1.2

* Introduce functional tests
* Fix a restart bug where, during (re)start, if a worker died before entering the 'listening' state (but then its replacement began listening normally), `dutch-master` still believed it was in a 'restarting' state, so never issued the 'Cluster ready' log message, and more importantly would *ignore* further restart requests.

## v0.1.1

Initial release
