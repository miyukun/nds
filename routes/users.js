var express = require('express');
var router = express.Router();
var path = require("path");
var fs= require('fs');
var _= require('underscore');
var md5 = require('md5');
var error = require('../util/error');
var cfgPath = path.join(__dirname, '../conf/user.json');
const logger = require('../util/log').logger;

/* GET users listing. */
router.get('/', function(req, res, next) { 
  logger.debug('route user'); 
  res.render('user');
});

router.get('/list', function(req, res, next) { 
  logger.debug('route user/list'); 
  succRes(res);
});

router.post('/delete', function(req, res, next) {
  logger.debug('route user/delete'); 
  delUserById(req.body.userid,function(err){
    if(err){
      failRes(res,1,err);
    }else{
      succRes(res);
    }
  });
});

router.post('/add', function(req, res, next) {
  logger.debug('route user/add'); 
  var user = router.findUserByName(req.body.username);
  if(user){
    failRes(res,1,'已存在的username');
  }else{
    var userid = parseInt(findMaxUserId());
    try{
      user = {
        userid:++userid,
        username:req.body.username,
        password:router.password(req.body.password)
      };
      addUser(user,function(err){
         if(err){
          failRes(res,1,err);
        }else{
          succRes(res);
        }
      });
    }catch (err){
      failRes(res,1,err.message);
    }

  }
});

router.post('/getCurrentUser', function(req, res, next) {
  logger.debug('route user/getCurrentUser'); 
  var sessionid = req.cookies['NDSSESSIONID'];
  var session = router.sessions[sessionid];
  res.json(_.extend({},{'user':session.username,'NDSSESSIONID':sessionid},{errorCode:0}));
});

router.post('/updatePwd', function(req, res, next) {
  logger.debug('route user/updatePwd'); 
  var sessionid = req.cookies['NDSSESSIONID'];
  var session = router.sessions[sessionid];
  var username = session.username;
  var user = router.findUserByName(username);

  var _authCode = md5(sessionid+'-'+user.password).toUpperCase();

  if(_authCode!=req.body.authCode){
    res.json(error('INVALID_OLD_PWD'));
  }else{
    user.password = req.body.newpwd;
    updateUser(user,function(err){
      if(err){
        res.json({errorCode:1,errorMsg:'修改失败'});
      }else{
        res.json({errorCode:0,errorMsg:'修改成功'});
      }
    });
  }
});

var failRes = function(res,errorCode,msg){
  var users = getUsers();
  res.json({errorCode:errorCode,message:msg,users:users});
};

var succRes = function(res){
  var users = getUsers();
  res.json({errorCode:0,users:users});
};

var findUserById = function (userid) {
  var users = getUsers();
  var user = _.find(users, function(user){
    return user.userid == userid;
  });
};

var findMaxUserId = function () {
  var users = getUsers();
  return _.max(users, function(user){ return user.userid; }).userid;
};

var addUser= function (user,fnAdd) {
  var users = getUsers();
  users.push(user);
  writeJsonFile(users,fnAdd);
};

var delUserById = function (userid,fnDel) {
  var users = getUsers();
  var user = _.find(users, function(user){
    return user.userid == userid;
  });
  users = _.without(users, user);
  writeJsonFile(users,fnDel);
};

var updateUser = function(user,fnUpdate){
  var users = getUsers();
  var idx =_.findIndex(users, function(u){
    return user.userid == u.userid;
  });
  users[idx].password = user.password;
  writeJsonFile(users,fnUpdate);
};

var getUsers = function(){
  return require(cfgPath);
};

router.password = function(password){
  if(password.length<6){
    throw new Error('密码至少6位');
  }
  return md5('node-'+password+'-nds').toUpperCase();
};


router.findUserByName = function (username) {
  var users = getUsers();
  return _.find(users, function(user){
    return user.username == username;
  });
};

var writeJsonFile = function (users,callback) {
  fs.writeFile( cfgPath, JSON.stringify( users, null, 2 ), function (err) {
    if(err) {
      callback(err);
    }
    callback();
  });
};

fs.watch(cfgPath, function(event, filename) {
  if(event=='change'){
    delete require.cache[cfgPath];
  }
});

module.exports = router;

function main(){
  console.log(password('aaaaaa'));
}
if(module === require.main) {
  main();
}
