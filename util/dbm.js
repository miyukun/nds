/**
 * Created by dp on 17-7-5.
 */
const mysql = require('./dbUtil');
var logger = require('./log').logger;

var dbs_config = require('../conf/db.json') ;
var dbs = {};

module.exports = {
    getInfos:function(){
        return Object.keys(dbs_config);
    },
    open:function (name, url) {
        logger.info('dbName:'+name);
        logger.info('dburl:'+url);
        if(name){
            if(!url){
                url = dbs_config[name];
                if(!url) {
                    logger.info('没有找到对应的数据库配置项:'+name);
                    return false;
                }
            }
            if(dbs[name]){
                dbs[name].close();
            }
            dbs[name] = mysql.open(url);
        }else{
            this.end();
            _.each(dbs_config,function(name){
                dbs[name] = mysql.open(dbs_config[name]);
            });
        }
        return true;
    },
    query:function(db,sql,cb,scope){
        logger.info("db:"+db);
        logger.info("sql:"+sql);
        if(db&&!dbs[db]){
            if(!this.open(db)){
                cb();
            }
        }
        if(db&&dbs[db]){
            dbs[db].query(sql,cb,scope);
        }else{
        	if(cb){
                if(scope) cb.call(scope,null);
                else cb(null);
            }
        }
    },
    end: function(){
        for(var k in dbs){
            dbs[k].close();
        }
        dbs = {};
    }
};

function main()
{
    var dbm = module.exports;
    dbm.query('local','select * from Users',function(p){
//		console.log(p);
        if(p){
            for(var i in p){
                r = p[i];
            }
        }
        dbm.end();
    });
}

if(require.main === module){
    main();
}

