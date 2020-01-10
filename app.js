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
    error = require('./util/error');
var sessionId = Math.floor(Math.random() * 1000000000);
var sessions = {};
var sessionCheckTime = new Date();
var svgCaptcha = require('svg-captcha');

var request = require('request-promise');

var app = express();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
// app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// var accessLogStream = FileStreamRotator.getStream({
//     filename: logDirectory + '/access-%DATE%.log',
//     frequency: 'daily',
//     verbose: false
// });
var accessLogStream = fs.createWriteStream(__dirname + '/logs/log.log', {
    flags: 'a'
});
// app.use(morganLogger('default', {stream: accessLogStream}));

app.use(morganLogger('tiny'));

app.use(function(req, res, next) {
    if (_.contains(['/heartbeat', '/preLogin', '/login', '/verification', '/reverification'], req.url.split('?')[0])) {
        next();
    } else if (_.contains(['/nvs/getTestResultList', '/nvs/getTopologyDetails'], req.url) && '127.0.0.1' == _.last(getClientIp(req).split(':'))) {
        next();
    } else {
        isLoggedIn(req, res, next, 'check')
    }
});
//转向到登录页面
app.use('/preLogin', function(req, res) {
    res.render('login');
});

app.use('/heartbeat', function(req, res, next) {
    isLoggedIn(req, res, next, 'heartbeat')
});
//登出
app.use('/logout', function(req, res) {
    logout(req.cookies.NDSSESSIONID);
    res.send(error('SUCCESS'));
});

function logout(sessionid) {
    removeSession(sessionid);
}

//处理登录请求
app.use('/login', function(req, res) {
    authenticate(req, function(e, user) {
        if (e) {
            var sessionId = createSession().id;
            res.cookie('NDSSESSIONID', sessionId, {
                expires: 0,
                httpOnly: true
            });
            res.send(_.extend({}, e, {
                'NDSSESSIONID': sessionId
            }));
        } else {
            var _user = _.extend({}, user);
            delete _user.password;
            delete _user.userid;
            res.send(_.extend({ "user": _user }, error('SUCCESS')));
        }
    });
});

app.use('/verification', function(req, res) {
    var sessionid = req.cookies.NDSSESSIONID;
    var session = querySession(sessionid);
    res.type('svg'); // 使用ejs等模板时如果报错 res.type('html')
    res.status(200).send(session.verificationimg);
});
app.use('/reverification', function(req, res) {
    var sessionid = req.cookies.NDSSESSIONID;
    var session = querySession(sessionid);
    if (session) {
        session.reverfification();
        res.type('svg'); // 使用ejs等模板时如果报错 res.type('html')
        res.status(200).send(session.verificationimg);
    } else {
        res.send('can\'t find session');
    }
});

function authenticate(req, fn) {
    var username = req.body.username;
    var authCode = req.body.authCode;
    var verification = req.body.verification;
    var sessionid = req.cookies.NDSSESSIONID;
    if (username && authCode && sessionid) {
        var user = users.findUserByName(username);
        if (user) {
            var encrptPassword = user.password.toUpperCase();
            var _authCode = md5(sessionid + '-' + encrptPassword).toUpperCase();
            var session = querySession(sessionid);
            if (session.verification.toLowerCase() != verification.toLowerCase()) {
                fn(error('VERIFICATION_FAILED'));
                return
            }
            if (session) {
                if (authCode == _authCode) {
                    session.clientIp = getClientIp(req);
                    session.username = username;
                    session.createTime = new Date();
                    fn(null, user);
                } else {
                    fn(error('AUTH_FAILED'));
                }
            } else {
                fn(error('NO_SUCH_SESSION'));
            }
        } else {
            fn(error('AUTH_FAILED'));
        }
    } else {
        fn(error('NO_SUCH_ITEM'));
    }
}


var forward = require('./routes/forward');
var index = require('./routes/index');
var users = require('./routes/users');
users.sessions = sessions;
var file = require('./routes/file');
var database = require('./routes/database');
var nvs = require('./routes/nvs');


app.use(forward);
app.use('/', index);
app.use('/users', users);
app.use('/file', file);
app.use('/database', database);
app.use('/nvs', nvs);

// function checkLogin(req,res){
//     var boceSessionId = req.body?(req.body.sessionId?req.body.sessionId:''):'';
//     var a = request('http://127.0.0.1:3012/heartbeat?sessionId='+boceSessionId).then(function (body) 
//     {
//     }

// }
function checkLogin(req, res) {
    var sessionid = req.cookies['NDSSESSIONID'];
    var session = querySession(sessionid);
    if (session && session.clientIp == getClientIp(req)) {
        return true
    } else {
        return false
    }
}

function isLoggedIn(req, res, next, parent) {
    var boceSessionId = req.body ? (req.body.sessionId ? req.body.sessionId : '') : '';
    if (boceSessionId) {

        logger.info('判断NetVistal系统是否登陆')
        request('http://127.0.0.1:3012/heartbeat?sessionId=' + boceSessionId).then(function(body) {
            var body = JSON.parse(body);
            if (parent == 'heartbeat') {
                if (body.errorCode == 0) {
                    logger.info('NetVistal系统登陆')
                    if (!checkLogin(req, res)) {
                        var sessionId = createSession().id;
                        var session = querySession(sessionId);
                        session.clientIp = getClientIp(req);
                        session.username = 'boce';
                        session.createTime = new Date();
                        res.cookie('NDSSESSIONID', sessionId, {
                            expires: 0,
                            httpOnly: true
                        });
                        res.cookie('e2e-username', 'boce', {
                            expires: 0,
                            httpOnly: false
                        });
                        res.cookie('e2e-nickname', 'boce', {
                            expires: 0,
                            httpOnly: false
                        });
                    }
                    res.send(error('SUCCESS'));
                } else {
                    var sessionid = req.cookies['NDSSESSIONID'];
                    var session = querySession(sessionid);
                    if (session && session.clientIp == getClientIp(req)) {
                        res.send(error('SUCCESS'));
                    } else {
                        var sessionId = createSession().id;
                        res.cookie('NDSSESSIONID', sessionId, {
                            expires: 0,
                            httpOnly: true
                        });
                        res.send(_.extend({}, error('NO_SUCH_SESSION'), {
                            'NDSSESSIONID': sessionId
                        }));
                    }
                }
            } else {
                if (body.errorCode == 0) {
                    next();
                } else {
                    var sessionid = req.cookies['NDSSESSIONID'];
                    var session = querySession(sessionid);
                    if (session && session.clientIp == getClientIp(req)) {
                        next();
                    } else {
                        res.send(error('NO_SUCH_SESSION'));
                    }
                }

            }

        });
    } else {
        logger.info('输入用户名 ,密码 登陆')
        if (parent == 'heartbeat') {
            var sessionid = req.cookies['NDSSESSIONID'];
            var session = querySession(sessionid);
            if (session && session.clientIp == getClientIp(req)) {
                res.send(error('SUCCESS'));
            } else {
                var sessionId = createSession().id;
                res.cookie('NDSSESSIONID', sessionId, {
                    expires: 0,
                    httpOnly: true
                });
                res.send(_.extend({}, error('NO_SUCH_SESSION'), {
                    'NDSSESSIONID': sessionId
                }));
            }
        } else {
            var sessionid = req.cookies['NDSSESSIONID'];
            var session = querySession(sessionid);
            if (session && session.clientIp == getClientIp(req)) {
                next();
            } else {
                res.send(error('NO_SUCH_SESSION'));
            }

        }
    }

}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});


function removeSession(sessionid) {
    for (var i in sessions) {
        var s = sessions[i];
        if (s.id == sessionid) {
            delete sessions[i];
        }
    }
}

function createSession() {
    var d = new Date();
    var captcha = svgCaptcha.create({
        ignoreChars: '0o1i',
        background: '#C8C3C5',
        fontSize: 30,
        color: true,
        width: 115,
        height: 30
    });
    var session = {
        id: sessionId,
        createTime: d,
        verificationimg: captcha.data,
        verification: captcha.text
    };
    session.reverfification = function() {
        captcha = svgCaptcha.create({
            ignoreChars: '0o1i',
            background: '#C8C3C5',
            color: true,
            fontSize: 30,
            width: 115,
            height: 30
        });
        this.verificationimg = captcha.data;
        this.verification = captcha.text
    }
    sessionId++;
    sessions[session.id] = session;
    checkSession();
    return session;
}

function checkSession() {
    var d = new Date();
    var dd = d - 30 * 60 * 1000;
    for (var i in sessions) {
        var s = sessions[i];
        if (s.createTime < dd) {
            logger.debug("删除session:" + s.id);
            delete sessions[i];
        } else {
            s.createTime = d;
        }
    }
}

// 通过url查询session
function querySession(sid) {
    checkSession();
    var s = sessions[sid];
    if (s) {
        s.createTime = new Date();
        logger.info("sid:" + sid);
        logger.debug("更改session的createtime为:" + s.createTime);
        return s;
    }
    return false;
}

function getClientIp(req) {
    return req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
}
module.exports = app;