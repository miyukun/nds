var childProcess = require('child_process');

function log(v){
        console.log(new Date(), v);
}

process.on('SIGINT',()=>{
        log('SIGINT');
});

process.on('SIGTERM',()=>{
        log('SIGTERM');
});

process.on('SIGHUP',()=>{
        log('SIGHUP');
});

var p = false;
function doDaemon(){
        if(!p || !p.connected){
                log('new fork');
                p = childProcess.fork('./index');
        }
        setTimeout(doDaemon, 6000);
}

doDaemon();