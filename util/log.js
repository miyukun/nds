/**
 * Created by dp on 17-6-27.
 */
var log4js = require('log4js');
log4js.configure({
    appenders: [
        {
            type: 'console'
//          category: "console"
        }, //控制台输出
        {
            type: "dateFile",
            filename: 'logs/log.log',
            pattern: "_yyyy-MM-dd",
            alwaysIncludePattern: false,
            category: 'ndsLog'
        }//日期文件格式
    ],
    replaceConsole: true,   //替换console.log
    levels:{
        ndsLog: 'debug',
        console: 'debug'
    }
});

var ndsLog = log4js.getLogger('ndsLog');

exports.logger = ndsLog;


exports.use = function(app) {
    //页面请求日志,用auto的话,默认级别是WARN
    //app.use(log4js.connectLogger(dateFileLog, {level:'auto', format:':method :url'}));
    app.use(log4js.connectLogger(ndsLog, {level:'debug', format:':method :url'}));
};

process.on('uncaughtException', (err) => {
  ndsLog.error(`Caught exception: ${err}\n`);
});

