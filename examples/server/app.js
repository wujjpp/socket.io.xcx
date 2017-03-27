// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

io.on('connection', function (socket) {

    // when the client emits 'new message', this listens and executes
    socket.on('message', function (data) {

        console.log('message from client: ', data);

        // we tell the client to execute 'new message'
        io.emit('message', {
            message: data + ' world ' + new Date()
        });
        /*socket.broadcast.emit('new message', {
         message: data
         });*/

        /*socket.emit('new message', {
         message: data
         });*/
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        // echo globally that this client has left
        socket.broadcast.emit('user left', {
            message: 'user left'
        });

    });
});
