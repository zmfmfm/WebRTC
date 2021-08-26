/************************************
nodejs로 실행한 웹 서버 및 시그널링
************************************/

'use strict';

var os = require('os');
var nodeStatic = require('node-static');
// var http = require('http');
var socketIO = require('socket.io');


var https = require('https'); //https
var fs = require('fs');

var fileServer = new(nodeStatic.Server)();

//https
var options = {
  key: fs.readFileSync('./private.pem'),
  cert: fs.readFileSync('./public.pem')
}

var app = https.createServer(options, (function(req, res) {
  fileServer.serve(req, res);
})).listen(8000)


var io = socketIO.listen(app);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit('message', message);
  });

  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    console.log('Room ' + room + ' now has ' + numClients + ' client(s)');
    log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (numClients === 0) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);
      console.log('joined0');
    } else if (numClients === 1) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
      console.log('joined1');
    } else { // max two clients
      socket.emit('full', room);
      console.log('joined2');
    }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

  // sweet
  // socket.on('message', function(message) {
  //   log('Client said: ', message);
    
  //   if (message==="bye" && socket.rooms['foo']) {
  //       io.of('/').in('foo').clients((error, socketIds) => {
  //           if (error) throw error;

  //           socketIds.forEach(socketId => {
  //               io.sockets.sockets[socketId].leave('foo');
  //           });
  //       });
  //   }
  //   socket.broadcast.emit('message', message);
  // });

});


