"use strict";
/*

   oldschool -- a crosscloud chat program that runs in a terminal

   see /HELP for available commands

   The basic idea is that everything you type gets posted to your site
   (think microblog).  Meanwhile, anything posted by any of your contacts
   gets displayed, if it passes your current filters.

   It's called "oldschool" because I was into systems like this a long
   time ago, back in school (rpi.edu).  Of course, they used different
   protocols, with somewhat different properties.

   TODO:
     - help getting people signed up (currently assumes you're a pod expert)
     - catch ctl-c and mark people as away
     - private messages
     - clearer definition of who is around
     - what happens if you're on N-times?   make it sandro #2
     - use node-notifier if they haven't typed recently...
     - and/or https://github.com/Marak/play.js
	 - limit to recent history
     - ... so much more

*/

var readline = require('readline');
var program = require('commander');
var columnify = require('columnify');
var pjson = require('./package.json');
var userinfo = require('userinfo');
var crosscloud = require('crosscloud');


/****************************************************************
 * 
 *  Polyfills
 *
 ****************************************************************/

if (!String.prototype.startsWith) {
  Object.defineProperty(String.prototype, 'startsWith', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function(searchString, position) {
      position = position || 0;
      return this.lastIndexOf(searchString, position) === position;
    }
  });
}

/****************************************************************
 * 
 *  User Interface Machinery
 *
 ****************************************************************/

program
    .version(pjson.version)
    .usage('[options]')
    .option('-n, --nickname <nickname>', 'what name to go by?')
    //.option('-l, --login <webid url>', 'who is this user (a webid URL)')
    //.option('-C, --configfile <f>', 'config file')
    //.option('-I, --invitation <i>', 'use a given invitation URL')
    .parse(process.argv);

//var outfile = program.outputfile || "out.html";

function send (text) {
}

var commands = {
//                  123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 
    /*
    peek: { usage: "/PEEK [<num>] user-url",
        description: "Show the last <num> (default 10) posts from this user, without subscribing" },
    follow: { usage: "/FOLLOW <user or tag>",
          description: "publicly subscribe" },
    watch: { usage: "/WATCH <user or tag>",
         description: "privately subscribe" },
    */
    who:  { usage: "/WHO [<name pattern>]",
            description: "show who is available to talk to" },
    quit: { usage: "/QUIT",
            description: "quit this program.  (or ctl-d)" },
    help: { usage: "/HELP [<cmd>]",
            description: "describe the available commands" },
    say: { usage: "/SAY <text>",
       description: "publish the <text> as a microblog post.  The /SAY command is implied for lines with a leading slash." }
};

/*
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

commands.watch.run = function (text) {
    // the same as .follow, but the triple gets stored somewhere else.
};
*/

commands.help.run = function (text) {
    out('\nRecognized commands:');
    var columns=[];
    Object.keys(commands).sort().forEach(function (key) {
    columns.push(commands[key]);
    //out("  "+commands[key].brief);
    });
    out(columnify(columns, { include: ['usage', 'description']}));
    out('\nNon-command lines are messages to be posted.');
    out('\nBy convention, messages starting with @user or #tag are only shown to people');
    out('following both you and that person or tag.');
    out('');
};


var rl = readline.createInterface({
    input: process.stdin, 
    output: process.stdout,
    completer: completer
});
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
            if (spacePos == -1) {
                cmdObj.run(null);
            } else {
                cmdObj.run(line.slice(spacePos));
            }
        } else {
            out('Unknown command "'+cmd+'".   Try "/help".');
        }
    } else if (line.length) {
        commands.say.run(line);
    }
    rl.prompt();
}).on('close', function() {
    // post most this status change?
    commands.quit.run();
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
    // rl._prompt='xx';  not working any more?
    rl.setPrompt('');
    rl._refreshLine();
    rl.output.write(text);
    //rl._prompt=savePrompt;
    rl.setPrompt(savePrompt);
    rl.line=saveLine;
    rl.cursor = saveCursor;
    rl._refreshLine();
    rl.resume();
}

// test asyncOutput
if (false) {
    var n = 1;
    setInterval(function () {
    n+=1;
    asyncOutput(rl, '-------- demonstrating async output-------- '+n+'\n');
    }, 3000);
}

var out = function (text) {
    asyncOutput(rl, text+"\n");
};


/****************************************************************
 * 
 *  Connect...
 *
 ****************************************************************/

var pod = crosscloud.connect();
pod.then(function () {out("connected");});
pod.catch(function () {out("connection failed"); os.exit(-1);});

// we could use fullename or username if we cared, but really 
// this info should come from the pod
var nick = program.nickname || userinfo.whoami();
var presence = { nick:nick, availableForChat: true };

var people = { };

/****************************************************************
 * 
 *  Tab Completion
 *
 ****************************************************************/

function completer(line, cb) {
    /*
    var completions = '.todo=adapt-this .help .error .exit .quit .q'.split(' ')
    var hits = completions.filter(function(c) { return c.indexOf(line) == 0 })
    // show all completions if none found
    cb(null, [hits.length ? hits : completions, line])
    */

    var completions = [];
    var text = ""+line;
    if (text.startsWith("/")) {
        for (var k in commands) {
            var cmd = "/"+k;
            if (cmd.startsWith(text)) {
                completions.push(cmd);
            }
        }
    } else {
        var lastSpace = text.lastIndexOf(" ");
        var lastAt = text.lastIndexOf("@");
        if (lastAt > lastSpace) {
            lastSpace = lastAt;
        }
        var word;
        var base;
        if (lastSpace == -1) {
            word = text;
            base = "";
        } else {
            word = text.slice(lastSpace+1);
            base = text.slice(0,lastSpace+1);
        }
        for (var nick in people) {
            if (nick.startsWith(word)) {
                completions.push(base+nick);
            }
        }
    }

    completions.sort();
    cb(null, [completions, line]);
}

/*
var completer = function (line, callback) {
    console.log('COMPLETER '+line);
    callback(null, [['sandro', 'samantha'], word]);
}
*/

/****************************************************************
 * 
 *  Watching for what we're supposed to output
 *
 ****************************************************************/

var user = function(page) {
    if (page.nick) {
        return page.nick;
    }
    return page._owner;
};

// delay until crosscloud.js handles this for us
setTimeout(function () {

    pod.push(presence);

    // only recent stuff?
    pod.query()
        .filter({messageText: {'$exists': true}})
        .on('Appear', function(page) {
            out("\n -> From "+user(page)+":\n - "+page.messageText);
        })
        .start();

    pod.query()
        .filter({availableForChat: true})
        .on('Appear', appear)
        .on('Disappear', disappear)
        .start();

}, 300);

var appear = function(page) {
    var nick = page.nick;
    people[nick] = page;
    out("*** "+nick+" is available ***");
};

var disappear = function(minpage) {
    var del = null;
    for (var nick in people) {
        var person = people[nick];
        if (person._id == minpage._id) {
            out("*** "+person.nick+" has left ***");
            delete people[nick];
        }
    }
};

var nicks = function() {
    var nicks = [];
    for (var nick in people) {
        nicks.push(nick);
    }
    nicks.sort();
    return nicks;
};

/****************************************************************
 * 
 *  Commands
 *
 ****************************************************************/

commands.say.run = function (text) {
    if (text === null) {
        out("What text do you want to send?");
    } else {
        pod.push({messageText:text, nick:nick});
    }
};

commands.who.run = function (text) {
    var rows=[];
    nicks().forEach(function (nick) {
        rows.push(people[nick]);
    });
    out(columnify(rows, { include: ['nick', '_owner']}));
};

commands.quit.run = function (text) {
    presence.availableForChat = false;
    pod.push(presence).then(function () {
        console.log('\n');
        process.exit(0);
    });
};


