"use strict";
exports.__esModule = true;
var express = require("express");
var app = express();
var http = require('http').Server(app);
app.use(express.static('dist'));
app.get('main.js', function (req, res) {
    res.sendFile('main.js');
});
app.get('/', function (req, res) {
    res.sendFile('index.html', { root: __dirname });
});
http.listen(process.env.PORT || 3000, function () {
    console.log('listening ...');
});
