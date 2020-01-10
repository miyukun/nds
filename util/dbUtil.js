/**
 * Created by dp on 17-7-5.
 */
const mysql = require('mysql');
const logger = require('./log').logger;

module.exports = {
    open:function(url){
        var pool = mysql.createPool(url);
        var db = {
            pool:pool,
            close:function(){
                if(this.pool) pool.end();
                this.pool = null;
            },
            query:function(sql,cb,scope){
                if(!sql||!this.pool){
                    if(cb){
                        if(scope) cb.call(scope,null);
                        else cb(null);
                    }
                    return;
                }
                pool.query(sql,function(err,rs,fields){
                    if(err){
                        logger.info('err:'+err);
                        if(cb){
                            if(scope) cb.call(scope,null);
                            else cb(null);
                        }
                        return;
                    }
                    if(cb){
                        if(scope) cb.call(scope,rs,fields);
                        else cb(rs,fields);
                    }
                });
            }
        };
        return db;
    }
};