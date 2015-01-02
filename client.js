"use strict";
/*

   oldschool -- a cimba chat program that runs in a terminal

   see /HELP for available commands

   The basic idea is that everything you type gets posted to your
   microblog.  Meanwhile, anything posted by anyone you follow gets
   displayed.

   It's called "oldschool" because I used to use systems like this a
   long time ago, back in school.  Of course, they used different
   protocols, with somewhat different properties.

*/

var util = require('util');
var url = require('url');
var http = require('http');
var readline = require('readline');
var program = require('commander');
var fs = require('fs');
var columnify = require('columnify');
var pjson = "0.0.0"; // require('./package.json');

var me = { following: [], posts: [] };

//var db = require('./rdfdb');

program
    .version(pjson.version)
    .usage('[options]')
    .option('-l, --login <webid url>', 'who is this user (a webid URL)')
    .option('-C, --configfile <f>', 'config file')
    .option('-I, --invitation <i>', 'use a given invitation URL')
    .parse(process.argv);

//var outfile = program.outputfile || "out.html";

function send (text) {
}

var commands = {
//                  123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 
    peek: { usage: "/PEEK [<num>] user-url",
	    description: "Show the last <num> (default 10) posts from this user, without subscribing" },
    follow: { usage: "/FOLLOW <user or tag>",
	      description: "publicly subscribe" },
    watch: { usage: "/WATCH <user or tag>",
	     description: "privately subscribe" },
    help: { usage: "/HELP [<cmd>]",
            description: "describe the available commands" },
    say: { usage: "/SAY <text>",
	   description: "publish the <text> as a microblog post.  The /SAY command is implied for lines with a leading slash." }
};

commands.peek.run = function (text) {
    // load a microblog from this address, and render the last
    // ten messages.
    
    // create db, load this, load all the referenced messages, sort,
    // query, display....

};

commands.follow.run = function (text) {
    
    // parse user
    var user = text;    // naive for now

    // ( suggest they do /last   ?   do it for them )

    // add it to what we watch
    me.following.push(user);
    beginWatching(user);

    // ( publish the FOLLOWS triple )
    publish(me);
    
};

commands.say.run = function (text) {
    me.posts.push({text:text});
    publish(me);
}

commands.watch.run = function (text) {
    // the same as .follow, but the triple gets stored somewhere else.
};

commands.help.run = function (text) {
    console.log('\nRecognized commands:');
    var columns=[]
    Object.keys(commands).sort().forEach(function (key) {
	columns.push(commands[key]);
	//console.log("  "+commands[key].brief);
    });
    console.log(columnify(columns, { include: ['usage', 'description']}));
    console.log('\nNon-command lines are messages to be posted.');
    console.log('\nBy convention, messages starting with @user or #tag are only shown to people');
    console.log('following both you and that person or tag.');
    console.log('');
};




var rl = readline.createInterface(process.stdin, process.stdout);
rl.on('line', function(line) {
    line = line.trim();
    if (line[0] === '/') {
	var spacePos = line.indexOf(" ");
	var cmd, rest;
	if (spacePos == -1) {
	    cmd = line.slice(1);
	    rest = "";
	} else {
	    cmd = line.slice(1,spacePos);
	    rest = line.slice(spacePos);
	}
	var cmdObj=commands[cmd.toLowerCase()];
	if (cmdObj) {
	    cmdObj.run(line.slice(spacePos));
	} else {
	    console.log('Unknown command "'+cmd+'".   Try "/help".');
	}
    } else if (line.length) {
	commands.say.run(line);
    }
    rl.prompt();
}).on('close', function() {
    // post most this status change?
    console.log('logged out.');
    process.exit(0);
});

rl.output.write('\nCommands start with a slash.  Try /HELP.  Non-command lines are published.\n\n');

rl.setPrompt('oldschool> ');
rl.prompt();




// output some text on the readline device ABOVE the line being typed,
// without messing it up.  Has to mess with internals of readline.js,
// but seems to work okay for now.

function asyncOutput(rl, text) {
    rl.pause();
    var savePrompt = rl._prompt;
    var saveLine = rl.line;
    var saveCursor = rl.cursor;
    rl._moveCursor(-Infinity);
    rl._deleteLineRight();
    rl._prompt='';
    rl._refreshLine();
    rl.output.write(text);
    rl._prompt=savePrompt;
    rl.line=saveLine;
    rl.cursor = saveCursor;
    rl._refreshLine();
    rl.resume();
}

// test asyncOutput
if (true) {
    var n = 1;
    setInterval(function () {
	n+=1;
	asyncOutput(rl, '***********foo '+n+'\n');
    }, 2000);
}

var out = function (text) {
    asyncOutput(rl, text+"\n");
}


function publish (obj) {
    console.log('publishing to', program.login);
    
    var addr = url.parse(program.login);
    addr.method = 'POST';
    addr.headers = { 'Accept': 'application/json' };    // Content-Type?
    var req = http.request(addr)
	.on('error', function(e) {
	    out('error with posting to '+program.login+': '+e.message);
	})
	.on('response', function(res) {
	    out('got response from '+addr);
	    out('status: ' + res.statusCode);
	});
    req.write(JSON.stringify(obj));
    req.end();
}

// um, https://www.npmjs.org/package/parse-links doesn't seem to work
// trying to fix it, then maybe I'll send a patch back?
function parseLinks (linksHeader) {
    var result = {};
    var entries = linksHeader.split(',');
    // compile regular expressions ahead of time for efficiency
    var relsRegExp = /\brel="?([^"]+)"?\s*;?/;
    var keysRegExp = /(\b[^ "]+\b)/g;       // <<<<====== THIS IS MY CHANGE
    var sourceRegExp = /^<(.*)>/;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i].trim();
	//console.log('entry=', entry);
      var rels = relsRegExp.exec(entry);
      if (rels) {
	  //console.log('got a rels', rels);
        var keys = rels[1].match(keysRegExp);
	  //console.log('keys=', keys);
        var source = sourceRegExp.exec(entry)[1];
	  //console.log('got a source', source);
        var k, kLength = keys.length;
        for (k = 0; k < kLength; k += 1) {
          result[keys[k]] = source
        }
      }
    }
    //console.log('so result=', result);

    return result;
}

function beginWatching (webid_or_channel) {
    console.log('watching', webid_or_channel);

    var addr = url.parse(webid_or_channel);
    addr.headers = { 'Accept': 'application/json' };
    var req = http.get(addr)
	.on('error', function(e) {
	    out('error with '+addr+': '+e.message);
	})
	.on('response', function(res) {
	    var body = '';
	    out('got response from '+addr);
	    out('status: ' + res.statusCode);
	    out('Link: ' + JSON.stringify(parseLinks(res.headers.link)));
	    var longpollURL = parseLinks(res.headers.link)['http://ldpx-ns.org/#longpollForLaterVersionAt'];
	    longpollURL = url.resolve(webid_or_channel, longpollURL);
	    out('longpoll at ' + longpollURL);
	    res.on('data', function (chunk) {
		body += chunk;
	    });
	    res.on('end', function () {
		out('BODY: '+body);

		// begin a longpoll on the address we got from longpoll.
	    });
	});

}
