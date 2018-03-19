//index.js
//获取应用实例

import io from '../../socket.io.xcx.min'
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
