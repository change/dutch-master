## dutch_master

> Pass on the left hand side.

### Synopsis

Rolling restarts.

### Description

A simple module to manage worker processes and communicate with them to initiate graceful restarts.

### Example

Running: 
```javascript
var dutchMaster = require('dutch-master')
  , dutch = dutchMaster().init('worker.js')
```
Initiating a rolling restart:
```shell
kill -SIGUSR2 [pid of master]
```

### Install:
`npm i dutch_master`

### Test:
todo

### License:
none, this is not open source software currently.
