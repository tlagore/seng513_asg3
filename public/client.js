
// document ready calls
/* This disgusting hack of a function fixes the firefox bug without killing scrolling on 
   chrome. Took like 3 hours to figure out.
 */
$(function(){
    var isChrome = !!window.chrome && !!window.chrome.webstore;
    if(isChrome){
	$('#view-messages').css('overflow', 'auto');
    }
});

$(function(){
    var socket = io();
    localStorage.setItem("history", JSON.stringify({'chat_history': []}));
    localStorage.setItem("history_count", "0");
    socket.emit('loaded');


    /* Occurs when client receives a message from the server */
    socket.on('chat', function(msg){
	user = msg.user;
	timestamp = msg.timestamp;
	message = msg.contents;
	color = msg.color;

	let formatted_message = generate_message(user, new Date(timestamp).toUTCString(), message, timestamp, color);
	$('#view-messages').prepend(formatted_message);

	display_message(user, timestamp);

	if(user == "server" || $('#me-'+user).html() == user)
	    scrollToBottom();
    });

    socket.on('user_joined', function(msg){
	let name = msg.user_name;
	let color = msg.user_color;
	
	if(!$('#'+name).length){
	    $('#view-users').append('<h4 style="color:' + color + ';" id=' + name + '>' + name + '</h4>');
	}
    });

    socket.on('user_left', function(name){
	if($('#'+name).length){
	    $('#'+name).remove();
	}
    });

    socket.on('user_name', function(user){
	let name = user.user_name;
	let color = user.user_color;
	
	$('#whoami').html('You are: <b id="me-' + name + '" style="color:' + color + '">' + name + '</b>');
    });

    socket.on('color_changed', function(msg){
	let name = msg.user_name;
	let color = msg.user_color;

	if($('#'+name).length){
	    $('#'+name).css('color', color);
	}
    });

    socket.on('name_changed', function(msg){
	let old_name = msg.old_name;
	let new_name = msg.new_name;
	let color = msg.user_color;
	let server_color = msg.server_color;

	let timestamp = new Date().getTime();

	let formatted_message = '<div id=server' + timestamp + 
	    ' style="opacity:0.1; color:' + server_color +'" class="message-content">'
	    + '<i style="color:' + color + '">' + old_name + '</i> changed nickname to '
	    + '<i style="color:' + color + '">' + new_name + '</i></div>';
	
	$('#view-messages').prepend(formatted_message);
	display_message("server", timestamp);
    });

    socket.on('change_name', function(msg){
	let name = msg.old_name;
	let new_name = msg.new_name;
	let color = msg.user_color;

	if($('#'+name).length){
	    $('#'+name).remove();
	    $('#view-users').append('<h4 style="color:' + color + ';" id=' + new_name + '>' + new_name + '</h4>');
	}
    });
    
    $('#input-msg').keydown(function(event){	
	let history = JSON.parse(localStorage.getItem("history"));
	let count = parseInt(localStorage.getItem("history_count"));
	
	if(event.keyCode  == 27){
	    event.preventDefault();
	    $('#input-msg').val('');
	    
	}else if(event.keyCode == 38){
	    //up arrow
	    if(count > 0){
		$('#input-msg').val(history.chat_history[count - 1].toString());
		count --;
		localStorage.setItem("history_count", count.toString());
	    }
	}else if(event.keyCode == 40){

	    //down arrow
	    if (count < history.chat_history.length - 1){
		$('#input-msg').val(history.chat_history[count + 1].toString());
		count ++;
		localStorage.setItem("history_count", count.toString());
	    }
	}else if(event.keyCode == 13){
	    let msg = $('#input-msg').val();
	    
	    if(msg != ''){
		count++;
		history.chat_history.push(msg);
		localStorage.setItem("history", JSON.stringify(history));
		localStorage.setItem("history_count", count.toString());

		
		if(msg.startsWith("/nickcolor")){
		    let goodColor =  verifyColor(msg);
		    if (goodColor){
			socket.emit('chat', msg);
		    }else{
			send_server_message("Bad color. Try another css color. (lower case)");
		    }
		}else{
		    if(msg != ''){
			socket.emit('chat', msg);
		    }
		}
	    }

	    $('#input-msg').val('');
	}
    });
    
    $('#submit-message').click(function(){
	let msg = $('#input-msg').val()

	if(msg.startsWith("/nickcolor")){
	    let goodColor =  verifyColor(msg);
	    if (goodColor){
		socket.emit('chat', msg);
	    }else{
		send_server_message("Bad color. Try another css color. (lower case)");
	    }
	}else{
	    if (msg != ''){
		socket.emit('chat', msg);
		scrollToBottom();
	    }
	}
	$('#input-msg').val('');
    });
});

//scroll to bottom of messages
function scrollToBottom(){
    var messages = document.getElementById("message-wrapper");
    messages.scrollTop = messages.scrollHeight;
}

//verify that a color is in format RRR:GGG:BBB or css color
function verifyColor(command){
    let rgb = new RegExp(/^\d{1,3}:\d{1,3}:\d{1,3}$/);
    let msgParts = command.split(" ");
    
    if(msgParts.length != 2){
	return false;
    }
    
    if(rgb.test(msgParts[1])){
	return true;
    }else{
	return checkColorString(msgParts[1]);
    }
}

function send_server_message(msg){
    let timestamp = new Date().getTime();
    let formatted_message = server_message(timestamp, msg, "#e24646");
    $('#view-messages').prepend(formatted_message);
    display_message(user, timestamp);
}
    

//function taken from stackoverflow answer
//http://stackoverflow.com/questions/6386090/validating-css-color-names
function checkColorString(stringToTest){
    let rgb = $c.name2rgb(stringToTest).RGB;
    let rgb_digits = rgb.split(", ")
    return(!isNaN(rgb[0]));    
}


/* animate the message appearing */ 
function display_message(user, timestamp){
    let id = '#' + user + timestamp;
    $(id).animate({
	opacity: 1.0
    }, 750, function(){ //animation finish
    });
}

function server_message(utc, msg, color){
    return mesg = '<div id=server' + utc + 
	' style="opacity:0.1; color:' + color +'" class="message-content">' + msg + '</div>'
}

function generate_message(user, timestamp, msg, utc, color){
    if (user == "server"){
	return server_message(utc, msg, color)
    }else{
	let message = msg;

	if($('#me-'+user).html() == user){
	    message = '<i><font style="color:#b2f3f7">' + msg + '</font></i>';
	}

	return '<div id=' + user + utc + 
	    ' style="opacity:0.1;" class="message">' +
	    '<div class="message-header">' +
	    '<div class="message-user" style="color: ' + color + '">' + user + '</div>' + 
	    '<div class="message-time">' + timestamp + '</div>' +
	    '</div><div class="message-content">'+ message + '</div></div>';
    }
}
