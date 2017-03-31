# 微信小程序版 socket.io和engine.io [![Build Status](https://travis-ci.org/wujjpp/socket.io.xcx.svg?branch=master)](https://travis-ci.org/wujjpp/socket.io.xcx)

可以使用在微信小程序中的socket.io和engine.io

微信小程序的websocket做了一次封装，导致socket.io或者engine.io客户端包，无法直接使用
，该项目在engine.io-client项目基础上，实现wxwebsocket的传输层，使得在小程序中能使用socket.io的所有功能。

注意：编译出来的包只能在微信小程序当中使用

## 安装
```shell
$ git clone https://github.com/wujjpp/socket.io.xcx.git
$ cd socket.io.xcx
$ npm install
```

## 运行测试服务器&测试微信小程序
1. 运行测试服务器
```shell
$ npm run serve
```
2. 使用 "微信web开发者工具" 打开examples/app项目，运行样例小程序

注意：运行测试程序，请开启"开发环境不校验请求域名及TLS版本"


## 生产环境中使用
复制dist/socket.io.xcx.min.js到您的小程序源码，直接使用，具体可参照examples/app

Made with ♥ by Wu Jian Ping
