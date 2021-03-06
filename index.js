var express = require('express');
var cookie_parser = require('cookie-parser');
var socketIoCookieParser = require("socket.io-cookie-parser");
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.use(cookie_parser());
io.use(socketIoCookieParser());

var users = {};
var taken_names = {};
var message_log = [];

http.listen( port, function () {
    console.log('listening on port', port);
});


app.get("/", function(req, res, next){
    // var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var cookie = req.cookies.user_hash;
    console.log(cookie);
    
    if (cookie === undefined){
	let user_hash = Math.floor(Math.random() * 1000000);

	name = generate_username();
	users[user_hash] = { 'user_name': name, 'user_color': '#00ace6' };
	console.log("new user: " + name);
	//1 hour expiration on cookie
	res.cookie("user_hash", user_hash, { maxAge: 1000 * 60 * 60, httpOnly: true});
    }else{
	if (!(cookie in users)){
	    console.log("Cookie wasnt in users...");
	    users[cookie] = { 'user_name': generate_username(), 'user_color': '#00ace6' };
	}
	console.log("existing user: " + cookie);
    }
    next();
});

app.use(express.static(__dirname + '/public'));

// listen to 'chat' messages
io.on('connection', function(socket){
    let user = socket.request.cookies.user_hash;

    if(users[user] != undefined){
	console.log("Known user: " + user);
    }else{
	console.log("New user");
	name = generate_username();
	users[user] = { 'user_name': name, 'user_color': '#00ace6' };
    }

    socket.on('disconnect', function(){
	if (users[user] != undefined){
	    let message = { 'user': 'server',
			    'timestamp':new Date().getTime(),
			    'color': '#e24646',
			    'contents':users[user].user_name + " has left the server." };
	    
	    users[user].connected = false;
	    
	    io.emit('chat', message);
	    io.emit('user_left', users[user].user_name);
	}		     
    });

    socket.on('loaded', function(){
	console.log("loaded");
	if(users[user] != undefined){
	    console.log("Known user. " + users[user].user_name + " logged in.");
	    users[user].connected = true;
	}else{
	    console.log("Undefined...");
	    users[user] = {'name': generate_username(),
			   'user_color':'#00ace6',
			   'connected':true};
	}
	
	socket.emit('user_name', { 'user_name': users[user].user_name,
				   'user_color': users[user].user_color });


	for(let message of message_log){
	    socket.emit('chat', message);
	}

	for(let key in users){
	    if(users[key].connected){
		io.emit('user_joined', {'user_name': users[key].user_name,
					'user_color': users[key].user_color });
	    }
	}

	message = {'user' : 'server',
		   'timestamp':new Date().getTime(),
		   'color': '#76d65e',
		   'contents': users[user].user_name + " has joined the server."};

	io.emit('chat', message);

	message = {'user' : 'server',
		   'timestamp':new Date().getTime(),
		   'color': '#e24646',
		   'contents': 'Type /help to see a list of commands'};
	
	socket.emit('chat', message);	    
    });
    
    socket.on('chat', function(msg){

	if(users[user] != undefined){
	    let date = new Date();

	    // need to get user from here, message could be a command

	    let msg_contents = parse_message(msg, socket, user);

	    let user_name = msg_contents.user

	    console.log(user_name);
	    user_name = user_name == undefined ? users[user].user_name : user_name;
	    
	    let contents = msg_contents.message;
	    let color = msg_contents.color;
	    color = color == undefined ? users[user].user_color : color;

	    //did the parse of the message change the user who is sending it
	    //if not, keep it as the user who sent it - regular message

	    console.log('sending message from ' + user_name);
	    
	    let message = { 'user' : user_name,
			    'timestamp': date.getTime(),
			    'color': color,
			    'contents' : contents };

	    console.log('contents: ' + contents);
	    //if server message, only send to person who sent message, not everyone
	    if(user_name == 'server'){
		socket.emit('chat', message);
	    }else{
		console.log("Shouldnt be server: " + user);
		if (message_log.length >= 300){
		    shift(message_log);
		}
		message_log.push(message);
		io.emit('chat', message);
	    }
	}
    }); 
});

/* check to see if a message is a command if so, handle command */
function parse_message(msg, socket, user){
    let user_name = undefined;
    let color = undefined;
    
    if (msg[0] === '/'){
	msgParts = msg.split(" ");
	message = parse_command(msgParts, socket, user);
	user_name = "server";
	color = "#e24646";
    }
    else if (msg == ''){
	message = undefined;
    }else{
	message = msg;
    }
    
    return {'message': message, 'user': user_name, 'color': color };
}

/* parse command for its contents and do error checking, then run command */
function parse_command(msgParts, socket, user){
    msg = undefined;
    let user_regex = new RegExp(/^[0-9a-z_]+$/i);
    let rgb = new RegExp(/^\d{1,3}:\d{1,3}:\d{1,3}$/);

    if (msgParts.length > 2){
	msg = "Commands don't take more than one argument.";
    }else if (msgParts[0] == "/nick"){
	newNick = msgParts[1];
	if (newNick == "server"){
	    msg = "I'm the server, not you :)";
	}else if (newNick != undefined && msgParts.length == 2){
	    if(newNick.length <= 25 && user_regex.test(newNick)){
		if(change_name(newNick, socket, user)){
		    msg = 'Changed name to ' + newNick + '.';
		}else{
		    msg = 'Name taken.';
		}
	    }
	    else{
		msg = 'Invalid nickname. Nicknames must be alphanumeric and may contain underscores and no more than 25 characters in length.';
	    }	
	}else{
	    timestamp = new Date().getTime();
	    msg = "Invalid usage, correct usage is /nick [new_nickname]. Name must not contain spaces.";	    
	}

	//client side already verified nickcolor, but we don't trust the client side
    }else if(msgParts[0] == "/nickcolor"){
	if (rgb.test(msgParts[1])){
	    let colors = msgParts[1].toString().split(":");
	    let red = colors[0];
	    let green = colors[1];
	    let blue = colors[2];

	    console.log(red + " " + green + " " + blue);

	    if(between(red, 0, 255) && between(green, 0, 255) && between(blue, 0, 255)){
		users[user].user_color = "rgb(" + red + ", " + green + ", " + blue + ")";
		socket.emit("user_name", { 'user_name': users[user].user_name,
					   'user_color': users[user].user_color });
		io.emit('color_changed', { 'user_name': users[user].user_name,
					   'user_color': users[user].user_color });
		msg = "Changed color to " + msgParts[1];
	    }else{
		msg = "RGB values can only be between 0 and 255";
	    }
	}else{
	    //bad part here, we let the client side validate that the user color was a valid
	    //css string, however the worst thing that can happen (because we ensure the color
	    //is an alpha-string) is that they get white for their user name. No script injection
	    //here!
	    if(!(new RegExp(/^[a-zA-Z]*$/)).test(msgParts[1])){
		msg = "Bad color value.";
	    }else{
		users[user].user_color = msgParts[1];
		socket.emit("user_name", { 'user_name': users[user].user_name,
					   'user_color': users[user].user_color });
		io.emit('color_changed', { 'user_name': users[user].user_name,
					   'user_color': users[user].user_color });
		msg = "Changed color to " + msgParts[1];
	    }
	    //bad part here, we trust the client to 
	}

    }else if(msgParts[0] == "/help"){
	msg = "/help -- shows this menu :)<br/>" +
	    "/nick [nickname] -- sets your nickname to the new name<br/>" +
	    "/nickcolor [rgb] -- sets your nickname color to the new color (format: 0-255:0-255:0-255)<br/>"+
	    "/nickcolor [color] -- sets your nickname to the css color (lower case)<br/>" +
	    "up and down arrows cycle through your chat history of sent messages<br/>" +
	    "escape clears your current message<br/>" +
	    "enter is a quicker way to send your message than clicking the send button<br/>";
    }else{
	msg = "Invalid command.";
    }
    return msg;
}

function between(n, x, y){
    return n >= x && n <= y;
}


function change_name(requestedName, socket, user){
    let good_change = true;
    for (let key in users){
	if(users[key].user_name == requestedName){
	    good_change = false;
	    break;
	}
    }

    if(good_change){
	io.emit('name_changed', { 'old_name': users[user].user_name,
				  'new_name': requestedName,
				  'user_color': users[user].user_color,
				  'server_color': '#76d65e'});
	io.emit('change_name', { 'old_name' : users[user].user_name,
				 'new_name' : requestedName,
				 'user_color' : users[user].user_color})
	socket.emit('user_name', { 'user_name' : requestedName,
				   'user_color' : users[user].user_color });

	users[user].user_name = requestedName;		
    }

    return good_change;
}


/*
  Attempt to generate a name from preset names. If 20 iterations occur without a name chosen,
  the current name will be given, appended by 3 random numbers
*/
function generate_username(){
    let first_names = ['skilled', 'willful', 'angry',
		       'pretty', 'standard', 'plain',
		       'princess', 'prince', 'butternut'];
    let middle_names = ['toad', 'hamster', 'jock',
			'skillet', 'cake', 'pie',
			'rock', 'turtle', 'cube',
			'pork', 'panzy'];
    let last_names = ['herder', 'lumberjack', 'smither',
		      'miner', 'clown', 'baker', 'chef',
		      'teacher', 'samurai', 'master'];
    let i = 0;
    let name = undefined;

    first = first_names[Math.floor(Math.random() * first_names.length)];
    middle = middle_names[Math.floor(Math.random() * middle_names.length)];
    last = last_names[Math.floor(Math.random() * last_names.length)];

    name = first + "_" + middle + "_" + last;

    while (i < 20 && (name in taken_names)){
	first = first_names[Math.floor(Math.random() * first_names.length)];
	middle = middle_names[Math.floor(Math.random() * middle_names.length)];
	last = last_names[Math.floor(Math.random() * last_names.length)];
	
	name = first + "_" + middle + "_" + last;
	i++;
    }

    if(i == 20){
	name += Math.random().toString().substring(2, 5);
    }

    taken_names[name] = true;

    return name;
}

