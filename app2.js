var express = require('express'),
    path = require('path'),
    favicon = require('serve-favicon'),
    morganLogger = require('morgan'),
    // fileStreamRotator = require('file-stream-rotator'),
    bodyParser = require('body-parser'),
    fs = require('fs'),
    _ = require('underscore'),
    logger = require('./util/log').logger,
    cookieParser = require('cookie-parser'),
    md5 = require('md5'),
    base64js = require('base64-js');
error = require('./util/error');
var app = express();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

var accessLogStream = fs.createWriteStream(__dirname + '/logs/log.log', {
    flags: 'a'
});
var cfg = require('./conf/conf.js');
app.use(morganLogger('tiny'));
app.use(function (req, res, next) {
    var result = checkAuth(req, res, cfg);
    if (result) {
        result = Buffer.from(JSON.stringify(result)).toString('base64')
        res.cookie('userConfig', result, {
            expires: 0,
            maxAge: 60 * 60 * 1000,
            httpOnly: false
        });
        return next()
    } else {
        reAuth(req, res, cfg, next)
    }

});
var forward = require('./routes/forward');
// var index = require('./routes/index');
var users = require('./routes/users');
var file = require('./routes/file');
var database = require('./routes/database');
var nvs = require('./routes/nvs');
// app.use(forward);
// app.use('/', index);
app.use('/users', users);
app.use('/file', file);
app.use('/database', database);
app.use('/nvs', nvs);
app.use('/logout', function (req, res) {
    res.cookie('visual', '', {
        maxAge: 0,
    });
    res.send(error('SUCCESS'));
});
// app.use(express.static(path.join(__dirname, 'web/build/production/E2E')));
app.use(express.static(path.join(__dirname, 'web')));
// app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

function checkAuth(req, res, cfg) {
    var jwt = false;
    //登陆成功后的回转会带有jwt
    if (req.query && req.query.jwt) {
        jwt = req.query.jwt;
        res.cookie('visual', jwt, {
            maxAge: 60 * 60 * 1000,
            httpOnly: false
        });
        var arr = req.url.split('/');
        var path = arr[1];
        return res.redirect('http://' + req.headers.host+'/'+path);
    } else if (req.cookies.visual) {
        jwt = req.cookies.visual
    }
    if (jwt) {

        return checkJWT(jwt, cfg)
    }
    return false
}

function checkJWT(jwt, cfg) {
    jwt = jwt.split('.');
    if (jwt.length != 3) return false;
    var mySign = md5(jwt[0] + '.' + jwt[1] + 'vixtel').toUpperCase();
    try {
        var head = JSON.parse(Buffer.from(base64js.toByteArray(jwt[0])).toString());
        if (head.alg != 'MD5' || head.typ != 'JWT') {
            console.log('head err', head);
            return false;
        }
        var body = JSON.parse(Buffer.from(base64js.toByteArray(jwt[1])).toString());
        if (!body.name || !body.nbf || !body.exp || !body.sys) {
            console.log('body err:', body);
            return false;
        }
        var sys = JSON.parse(body.sys);

        if (sys.id != cfg.jwt.id) {
            console.log('id wrong:', body.sys, cfg.jwt.id);
            return false;
        }

        var sign = jwt[2];
        if (sign != mySign) {
            console.log('sign err:', jwt);
            return false;
        }
        var now = (new Date()).getTime() / 1000;
        // if (now < body.nbf || now > body.exp) {
        //     // 超时
        //     console.log('outtime:', body.nbf, body.exp, now);
        //     return false;
        // }
        var user_config = {
            "name": body.name,
            "edit": sys.edit,
            "city": sys.city
        };
        return user_config
    } catch (e) {
        console.log('except: ', e);
        return false;
    }
}

function reAuth(req, res, cfg, next) {
    // ctx.status = 302;
    var curUrl = 'http://' + req.headers.host + req.url +'/index.html?systemIdentification=' + cfg.jwt.id;
    curUrl = encodeURIComponent(curUrl);
    var redirectUrl = cfg.jwt.url + '?template=index-auth1&subsystem=' + curUrl;
    res.redirect(redirectUrl);
}
module.exports = app;