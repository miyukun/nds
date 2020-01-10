var express = require('express');
var fs = require('fs');
var path = require('path');
var router = express.Router();
var _ = require('underscore');
var logger = require('../util/log').logger;
var error = require('../util/error');
var dbm = require('../util/dbm');
var cfgPath = path.join(__dirname, '../conf/db.json');

router.get('/', function (req, res, next) {
    logger.debug('route database')
    res.render('database');
});

router.post('/list', function (req, res, next) {
    logger.debug('route database/list')
    res.json(_.extend({},{rows: getDBCfgs()}, error('SUCCESS')));
});

//显示库名中所有表
router.post('/listTables', function (req, res, next) {
    logger.debug('route database/listTables');
    var returnVal = _.extend({},error('SUCCESS'));
    var datas = req.body;
    var count = datas.length;
    if(count&&count>0) {
        _.each(datas, function (cfg) {
            cfg.sql = 'show tables';
            query(cfg, checkShowSql, function (tag, obj) {
                returnVal[tag] = _.pluck(obj.rows, obj.fields[0]);
                // _.each(obj.rows, function (row) {
                //     returnVal[tag].push((row[obj.fields[0]]));
                // });
                count--;
                if (count == 0) {
                    logger.debug('/database/listTables,返回结果:' + JSON.stringify(returnVal));
                    res.json(returnVal)
                }
            });
        });
    }else{
        res.json(error('INVALID_PARAMETERS'));
    }
});

//sql查询
router.post('/sql', function (req, res, next) { 
    logger.debug('route database/sql')
    var returnVal = _.extend({},error('SUCCESS'));
    var datas = req.body;
    var count = datas.length;
    _.each(datas, function (cfg) {
        query(cfg, checkSelSql, function (tag, obj) {
            returnVal[tag] = obj;
            count--;
            if (count == 0) {
                logger.debug('/database/sql,返回结果:' + JSON.stringify(returnVal));
                res.json(returnVal)
            }
        });
    });
});

var getDBCfgs = function () {
    return Object.keys(require(cfgPath));
};

var query = function (cfg, sqlRule, cb) {
    var dbName = cfg.dbName;
    var sql = cfg.sql;
    logger.debug('查询数据库:db'+dbName+",sql:"+sql);
    if (sqlRule(sql)) {
        logger.debug('sql语句通过检查');
        dbm.query(dbName, sql, function (rs, fields) {
            var retVal = {
                fields: [],
                total: 0,
                rows: []
            };
            if (rs) {
                retVal = {
                    fields: fields = _.pluck(fields, 'name'),
                    total: rs.length,
                    rows: rs
                }
            }
            logger.debug('得到查询结果:'+JSON.stringify(retVal));
            if (cb) {
                cb(cfg.tag, retVal);
            }
        });
    } else {
        logger.debug('sql语句未通过检查,返回空结果集合');
        var retVal = {
            fields: [],
            total: 0,
            rows: []
        };
        if (cb) {
            cb(cfg.tag, retVal);
        }
    }
};

var _checkSql = function (dbName, sql) {
    var regExp = /\s+from\s+([\w\.]*\.+\b(\w+))\b/gi;
    while (regExp.exec(sql)) {
        sql = sql.replace(RegExp.$1, RegExp.$2)
    }
    return sql;
};

//检查是否为select语句
var checkSelSql = function (sql) {
    if(sql){
        var p = /^select /i;
        return p.test(sql);
    }
    return false;
};
//检查是否为show tables语句
var checkShowSql = function (sql) {
    if(sql){
        var p = /^show tables/i;
        return p.test(sql);
    }
    return false;
};


fs.watch(cfgPath, function(event, filename) {
    if(event=='change'){
        delete require.cache[cfgPath];
    }
});

module.exports = router;

function main() {
    var dbName = 'local';
    var sql = 'select * from asdfafd.a_hebei (select * from NetVistaCloud.Users);';
    console.log(checkSql(dbName, sql));

    // var regExp = /\s+from\s+([\w\.]*\.?\b(\w+))\b/gi;
    // if(regExp.exec(sql)){
    //   // return sql.replace(RegExp.$1,dbName+'.'+RegExp.$2)
    //     return sql.replace(RegExp.$1,RegExp.$2)
    // }
    // return '';
    // console.log(sql.match(regExp));


}
if (require.main === module) {
    main();
}