# 微信小程序版 socket.io和engine.io

可以使用在微信小程序中的socket.io和engine.io

微信小程序的websocket做了一次封装，导致socket.io或者engine.io客户端包，无法直接使用
，该项目在engine.io-client项目基础上，实现wxwebsocket的传输层，使得在小程序中能使用socket.io的所有功能。

注意：编译出来的包只能在微信小程序当中使用

[![Build Status](https://travis-ci.org/wujjpp/socket.io.xcx.svg?branch=master)](https://travis-ci.org/wujjpp/socket.io.xcx)

## 安装

```shell
$ git clone https://github.com/wujjpp/socket.io.xcx.git
$ cd socket.io.xcx
$ npm install
```

## 运行测试服务器&测试微信小程序

1.  运行测试服务器

```shell
$ npm run serve
```

2.  使用 "微信web开发者工具" 打开examples/app项目，运行样例小程序

注意：运行测试程序，请开启"开发环境不校验请求域名及TLS版本"

## 生产环境中使用

复制dist/socket.io.xcx.min.js到您的小程序源码，直接使用，具体可参照examples/app

## 代码片段

该实例通过emit message向服务端发送 `hello` 字串，服务端收到后 emit message 到客户端

client -> server : hello

server -> client : 'hello world <current time>'

#### 小程序端
`~/examples/app/pages/index/index.js`
```javascript
// 导入socket.io小程序版包
import io from '../../socket.io.xcx.min'

// 使用IO创建socket实例，本实例使用本地socket.io服务器， 请根据根据实际情况修改IP
let socket = io('ws://127.0.0.1:3000')

function _setup() {
    var self = this;

    socket.on('connect', function () {
        console.log('连上了');
    });

    socket.on('message', function (data) {
        self.data.messages.push(data.message);
        self.setData({
            messages: self.data.messages
        })
    });

    socket.on('disconnect', function () {
        console.log('you have been disconnected');
    });
}

Page({
    data: {
        messages: []
    },
    onLoad: function () {
        _setup.apply(this);
    },
    send: function () {
        socket.emit('message', 'hello');
    }
})
```

#### 服务器端
`~/examples/server/app.js`
```javascript
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

        io.emit('message', {
            message: data + ' world ' + new Date()
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        // echo globally that this client has left
        socket.broadcast.emit('user left', {
            message: 'user left'
        });

    });
});
```

Made with ♥ by Wu Jian Ping
